/**
 * prompt-draw.ts — Bluffalo extension: draw a random unused prompt.
 *
 * Called via the bluffalo_draw_prompt action on phase_enter for the
 * submit phase. Selects a random prompt not yet used this game,
 * stores the question publicly and the correct answer privately.
 *
 * This extension does NOT import from any runtime subsystem internals.
 * It receives a typed copy of game state and returns state mutations.
 *
 * Part of the bluffalo-core extension package.
 */

/** A single prompt from the content pool. */
export interface BluffaloPrompt {
  id: number;
  question: string;
  correct_answer: string;
}

/** Context passed to the draw function from the extension runner. */
export interface DrawPromptContext {
  /** Current list of used prompt IDs this game. */
  usedIds: number[];
  /** All available prompts in the pool. */
  allPrompts: BluffaloPrompt[];
}

/** Result of drawing a prompt. */
export interface DrawPromptResult {
  /** The drawn prompt ID (to add to usedIds). */
  promptId: number;
  /** The question to show publicly. */
  question: string;
  /** The correct answer (kept private — not sent to players). */
  correctAnswer: string;
}

/**
 * Draw a random prompt not in the used list.
 *
 * @param ctx - Context with used IDs and full prompt pool
 * @returns Drawn prompt, or null if pool is exhausted
 */
export function drawPrompt(ctx: DrawPromptContext): DrawPromptResult | null {
  const available = ctx.allPrompts.filter(p => !ctx.usedIds.includes(p.id));
  if (available.length === 0) {
    return null; // Pool exhausted — game can end or recycle
  }

  const index = Math.floor(Math.random() * available.length);
  const prompt = available[index];
  if (!prompt) return null;

  return {
    promptId: prompt.id,
    question: prompt.question,
    correctAnswer: prompt.correct_answer,
  };
}
