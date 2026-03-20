/**
 * extensions/index.ts — Bluffalo extension registration.
 *
 * This module is the entry point for the bluffalo-core extension package.
 * It:
 *   1. Declares extension metadata matching game.yaml extensions section
 *   2. Exports registerBluffaloActions() for wiring into a game session
 *   3. Provides the ActionHandlerMap type for typed action dispatch
 *
 * Usage (from auto-discover.ts or test harness):
 *
 *   const handlers = createBluffaloActionHandlers(promptPool);
 *   // Pass handlers to a GameModule wrapper that processes custom actions.
 *
 * The extension functions are pure TypeScript — no runtime subsystem imports.
 * They receive typed state copies and return mutations.
 *
 * Architecture Note:
 *   Bluffalo extensions use the "action handler" pattern. Custom actions
 *   declared in game.yaml phases (bluffalo_draw_prompt, etc.) are delegated
 *   to these handlers by the game module layer (not the interpreter).
 *
 *   Full interpreter-level extension dispatch is Phase 4.2 work.
 *   For Phase 5.2a, extensions are wired at the createModule() factory level
 *   in auto-discover.ts, producing a BluffaloGameModule that wraps
 *   DeclarativeGameModule and handles custom actions.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { nanoid } from 'nanoid';

import { drawPrompt } from './prompt-draw.js';
import { buildAnswers } from './answer-builder.js';
import { scoreRound } from './scoring.js';
import { buildReveal } from './reveal-builder.js';

import type { BluffaloPrompt } from './prompt-draw.js';
import type { BluffaloAnswer, BluffaloAnswersState } from './answer-builder.js';
import type { BluffaloVote } from './scoring.js';

// ---------------------------------------------------------------------------
// Extension declaration (mirrors game.yaml extensions section)
// ---------------------------------------------------------------------------

export const BLUFFALO_EXTENSION_DECLARATION = {
  id: 'bluffalo-core',
  name: 'Bluffalo Core Logic',
  version: '2.0.0',
  type: 'lifecycle' as const,
  description:
    'Implements prompt drawing, answer building, round scoring, and reveal data assembly.',
  entryPoint: './extensions/index.ts',
};

// ---------------------------------------------------------------------------
// Prompt pool loader
// ---------------------------------------------------------------------------

let _cachedPrompts: BluffaloPrompt[] | null = null;

/**
 * Load the prompt pool from content/prompts.yaml.
 * Cached after first load.
 */
export function loadPromptPool(gameDir?: string): BluffaloPrompt[] {
  if (_cachedPrompts) return _cachedPrompts;

  const base = gameDir ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const promptsPath = join(base, 'content', 'prompts.yaml');

  try {
    const raw = readFileSync(promptsPath, 'utf-8');
    const parsed = parseYaml(raw) as { prompts: BluffaloPrompt[] };
    _cachedPrompts = parsed.prompts ?? [];
    return _cachedPrompts;
  } catch (err) {
    console.error('[bluffalo-extensions] Failed to load prompts:', err);
    return [];
  }
}

// Reset cache (for testing)
export function resetPromptCache(): void {
  _cachedPrompts = null;
}

// ---------------------------------------------------------------------------
// State accessors — typed helpers for reading Bluffalo state
// ---------------------------------------------------------------------------

/** Get the used prompt IDs from globals state. */
export function getUsedPromptIds(globals: Record<string, unknown>): number[] {
  const ids = globals['used_prompt_ids'];
  if (Array.isArray(ids)) {
    return ids.filter((id): id is number => typeof id === 'number');
  }
  return [];
}

/** Get the current answers from globals.answers_json. */
export function getAnswers(globals: Record<string, unknown>): BluffaloAnswer[] {
  const json = globals['answers_json'];
  if (typeof json !== 'string' || !json) return [];
  try {
    const parsed = JSON.parse(json) as BluffaloAnswersState;
    return parsed.answers ?? [];
  } catch {
    return [];
  }
}

/** Get player submissions from per-player state. */
export function getSubmissions(
  players: Record<string, Record<string, unknown>>,
): Record<string, string> {
  const submissions: Record<string, string> = {};
  for (const [playerId, playerState] of Object.entries(players)) {
    const sub = playerState['submission'];
    if (typeof sub === 'string' && sub.trim()) {
      submissions[playerId] = sub;
    }
  }
  return submissions;
}

/** Get player votes from per-player state. */
export function getVotes(
  players: Record<string, Record<string, unknown>>,
): BluffaloVote[] {
  const votes: BluffaloVote[] = [];
  for (const [playerId, playerState] of Object.entries(players)) {
    const answerId = playerState['vote_answer_id'];
    if (typeof answerId === 'string' && answerId.trim()) {
      votes.push({ voterId: playerId, answerId });
    }
  }
  return votes;
}

// ---------------------------------------------------------------------------
// Action handler context — what the action handler receives
// ---------------------------------------------------------------------------

/**
 * Context provided to Bluffalo action handlers.
 * Mirrors the interpreter's action context but scoped to Bluffalo's needs.
 */
export interface BluffaloActionContext {
  /** Current global state snapshot. */
  globals: Record<string, unknown>;
  /** Per-player state snapshot: playerId → fieldMap. */
  players: Record<string, Record<string, unknown>>;
  /** Player info (id + name) for building reveal data. */
  playerInfo: Array<{ id: string; name: string }>;
  /** Get a player's current total score. */
  getScore: (playerId: string) => number;
  /** Mutate a global state field. */
  setGlobal: (field: string, value: unknown) => void;
  /** Award points to a player. */
  addPoints: (playerId: string, amount: number) => void;
  /** Log a message (for diagnostics). */
  log: (msg: string, data?: unknown) => void;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

/**
 * bluffalo_draw_prompt
 *
 * Draws a random unused prompt. Stores:
 *   globals.current_question = prompt.question (public)
 *   globals.correct_answer   = prompt.correct_answer (private)
 *   globals.used_prompt_ids  = [...old, prompt.id]
 */
export function handleDrawPrompt(
  ctx: BluffaloActionContext,
  gameDir?: string,
): void {
  const allPrompts = loadPromptPool(gameDir);
  const usedIds = getUsedPromptIds(ctx.globals);

  const result = drawPrompt({ allPrompts, usedIds });
  if (!result) {
    ctx.log('[bluffalo] Prompt pool exhausted — cannot draw more prompts');
    return;
  }

  ctx.setGlobal('current_question', result.question);
  ctx.setGlobal('correct_answer', result.correctAnswer);
  ctx.setGlobal('used_prompt_ids', [...usedIds, result.promptId]);

  ctx.log('[bluffalo] Drew prompt', {
    promptId: result.promptId,
    question: result.question,
  });
}

/**
 * bluffalo_build_answers
 *
 * Combines player submissions with the correct answer, shuffles, and stores
 * in globals.answers_json (public — sent to clients during voting).
 */
export function handleBuildAnswers(ctx: BluffaloActionContext): void {
  const submissions = getSubmissions(ctx.players);
  const correctAnswer = String(ctx.globals['correct_answer'] ?? '');

  if (!correctAnswer) {
    ctx.log('[bluffalo] No correct_answer in state — skipping build_answers');
    return;
  }

  const answers = buildAnswers({
    submissions,
    correctAnswer,
    generateId: nanoid,
  });

  const answersState: BluffaloAnswersState = { answers };
  ctx.setGlobal('answers_json', JSON.stringify(answersState));

  ctx.log('[bluffalo] Built answers', { count: answers.length });
}

/**
 * bluffalo_score_round
 *
 * Calculates scores from the vote data and awards points.
 * Scoring:
 *   - Vote for correct answer: 1000 pts
 *   - Each player fooled by your fake: 500 pts
 *
 * After scoring, stores the scoring result in globals for use by
 * bluffalo_build_reveal (also called on reveal phase entry).
 */
export function handleScoreRound(ctx: BluffaloActionContext): void {
  const answers = getAnswers(ctx.globals);
  const votes = getVotes(ctx.players);

  if (answers.length === 0) {
    ctx.log('[bluffalo] No answers found — skipping score_round');
    return;
  }

  const result = scoreRound(answers, votes);

  // Award points to each player
  for (const [playerId, points] of result.roundPoints) {
    if (points > 0) {
      ctx.addPoints(playerId, points);
      ctx.log('[bluffalo] Awarded points', { playerId, points });
    }
  }

  // Store scoring result for reveal builder (as JSON in globals)
  ctx.setGlobal('_scoring_result_json', JSON.stringify({
    roundPoints: Object.fromEntries(result.roundPoints),
    answerResults: result.answerResults,
  }));
}

/**
 * bluffalo_build_reveal
 *
 * Builds the reveal data structure and stores it in globals.reveal_json.
 * Must be called AFTER bluffalo_score_round (uses _scoring_result_json).
 */
export function handleBuildReveal(ctx: BluffaloActionContext): void {
  const answers = getAnswers(ctx.globals);
  const scoringJson = ctx.globals['_scoring_result_json'];

  if (answers.length === 0) {
    ctx.log('[bluffalo] No answers found — skipping build_reveal');
    return;
  }

  // Reconstruct scoring result from stored JSON
  let roundPoints: Map<string, number>;
  let answerResults: ReturnType<typeof scoreRound>['answerResults'];

  if (typeof scoringJson === 'string') {
    try {
      const parsed = JSON.parse(scoringJson) as {
        roundPoints: Record<string, number>;
        answerResults: typeof answerResults;
      };
      roundPoints = new Map(Object.entries(parsed.roundPoints));
      answerResults = parsed.answerResults;
    } catch {
      ctx.log('[bluffalo] Failed to parse scoring result — rebuilding');
      const votes = getVotes(ctx.players);
      const result = scoreRound(answers, votes);
      roundPoints = result.roundPoints;
      answerResults = result.answerResults;
    }
  } else {
    // No scoring result — run scoring now
    const votes = getVotes(ctx.players);
    const result = scoreRound(answers, votes);
    roundPoints = result.roundPoints;
    answerResults = result.answerResults;
  }

  const revealData = buildReveal({
    answers,
    scoringResult: { roundPoints, answerResults },
    players: ctx.playerInfo,
    getTotalScore: ctx.getScore,
  });

  ctx.setGlobal('reveal_json', JSON.stringify(revealData));
  ctx.log('[bluffalo] Built reveal data', {
    correctAnswerId: revealData.correctAnswerId,
    answerCount: revealData.answers.length,
  });
}

// ---------------------------------------------------------------------------
// Custom action dispatcher
// ---------------------------------------------------------------------------

/** The set of custom actions Bluffalo handles. */
export type BluffaloActionName =
  | 'bluffalo_draw_prompt'
  | 'bluffalo_build_answers'
  | 'bluffalo_score_round'
  | 'bluffalo_build_reveal';

/** Check if an action name is a Bluffalo custom action. */
export function isBluffaloAction(actionName: string): actionName is BluffaloActionName {
  return [
    'bluffalo_draw_prompt',
    'bluffalo_build_answers',
    'bluffalo_score_round',
    'bluffalo_build_reveal',
  ].includes(actionName);
}

/**
 * Dispatch a Bluffalo custom action.
 *
 * @param actionName - One of the four Bluffalo custom action names
 * @param ctx        - Action context providing state access and mutators
 * @param gameDir    - Optional path to game directory (for prompt loading)
 */
export function dispatchBluffaloAction(
  actionName: BluffaloActionName,
  ctx: BluffaloActionContext,
  gameDir?: string,
): void {
  switch (actionName) {
    case 'bluffalo_draw_prompt':
      handleDrawPrompt(ctx, gameDir);
      break;
    case 'bluffalo_build_answers':
      handleBuildAnswers(ctx);
      break;
    case 'bluffalo_score_round':
      handleScoreRound(ctx);
      break;
    case 'bluffalo_build_reveal':
      handleBuildReveal(ctx);
      break;
    default:
      console.warn('[bluffalo-extensions] Unknown action:', actionName);
  }
}
