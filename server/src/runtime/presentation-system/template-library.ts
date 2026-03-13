/**
 * template-library.ts — Built-in screen template defaults.
 *
 * Each template type provides a sensible default set of components that
 * a game schema can use as-is or override by declaring its own `components`.
 *
 * Templates are pure data — no rendering logic here.
 */

import type { ScreenTemplateType, ScreenDeclaration, ScreenComponent } from './types.js';

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------

/** Components for the lobby template — waiting for players to join. */
const lobbyComponents: ScreenComponent[] = [
  {
    type: 'text',
    id: 'lobby-title',
    props: { text: 'Waiting for players...', variant: 'heading' },
  },
  {
    type: 'player-list',
    id: 'lobby-players',
    props: { showReady: true },
    visibility: 'all',
  },
  {
    type: 'button-group',
    id: 'lobby-actions',
    props: {
      buttons: [{ label: 'Start Game', action: 'start', style: 'primary' }],
    },
    visibility: 'active-player',
  },
];

/** Components for the prompt template — displaying a question for players to respond to. */
const promptComponents: ScreenComponent[] = [
  {
    type: 'text',
    id: 'prompt-title',
    props: { text: '', variant: 'heading' },
    binding: 'globals.currentPrompt',
  },
  {
    type: 'text',
    id: 'prompt-subtitle',
    props: { variant: 'body' },
  },
  {
    type: 'timer',
    id: 'prompt-timer',
    binding: 'phase.timeRemaining',
  },
  {
    type: 'input',
    id: 'prompt-input',
    props: { placeholder: 'Type your answer...' },
    visibility: 'active-player',
  },
];

/** Components for the vote template — players selecting from options. */
const voteComponents: ScreenComponent[] = [
  {
    type: 'text',
    id: 'vote-question',
    props: { variant: 'heading' },
    binding: 'globals.voteQuestion',
  },
  {
    type: 'button-group',
    id: 'vote-options',
    props: { layout: 'grid' },
    binding: 'globals.voteOptions',
    visibility: 'active-player',
  },
  {
    type: 'timer',
    id: 'vote-timer',
    binding: 'phase.timeRemaining',
  },
];

/** Components for the reveal template — showing the answer and who got it right. */
const revealComponents: ScreenComponent[] = [
  {
    type: 'text',
    id: 'reveal-answer',
    props: { variant: 'heading', emphasis: true },
    binding: 'globals.correctAnswer',
  },
  {
    type: 'player-list',
    id: 'reveal-correct',
    props: { filter: 'correct', showScores: true },
    binding: 'globals.correctPlayers',
  },
];

/** Components for the scoreboard template — mid-game scores. */
const scoreboardComponents: ScreenComponent[] = [
  {
    type: 'score-table',
    id: 'scoreboard-table',
    props: { showRank: true, showDelta: true },
    visibility: 'all',
  },
  {
    type: 'text',
    id: 'scoreboard-round',
    props: { variant: 'caption' },
    binding: 'globals.round',
  },
];

/** Components for the results template — final game results. */
const resultsComponents: ScreenComponent[] = [
  {
    type: 'text',
    id: 'results-heading',
    props: { text: 'Game Over!', variant: 'hero' },
  },
  {
    type: 'text',
    id: 'results-winner',
    props: { variant: 'heading' },
    binding: 'globals.winner',
  },
  {
    type: 'score-table',
    id: 'results-scores',
    props: { showRank: true, final: true },
    visibility: 'all',
  },
  {
    type: 'button-group',
    id: 'results-actions',
    props: {
      buttons: [
        { label: 'Play Again', action: 'restart', style: 'primary' },
        { label: 'Back to Lobby', action: 'lobby', style: 'secondary' },
      ],
    },
    visibility: 'active-player',
  },
];

/** Components for the timer template — countdown-focused screen. */
const timerComponents: ScreenComponent[] = [
  {
    type: 'timer',
    id: 'timer-main',
    props: { size: 'large', showProgress: true },
    binding: 'phase.timeRemaining',
  },
  {
    type: 'text',
    id: 'timer-label',
    props: { variant: 'caption' },
  },
];

/** Components for the info template — generic information display. */
const infoComponents: ScreenComponent[] = [
  {
    type: 'text',
    id: 'info-title',
    props: { variant: 'heading' },
  },
  {
    type: 'text',
    id: 'info-body',
    props: { variant: 'body' },
  },
];

/** Components for the media template — image/video/audio display. */
const mediaComponents: ScreenComponent[] = [
  {
    type: 'image',
    id: 'media-content',
    props: { fit: 'contain' },
    binding: 'globals.mediaUrl',
  },
];

/** Custom template has no default components — the game declares everything. */
const customComponents: ScreenComponent[] = [];

// ---------------------------------------------------------------------------
// Template map
// ---------------------------------------------------------------------------

const TEMPLATE_COMPONENTS: Record<ScreenTemplateType, ScreenComponent[]> = {
  lobby: lobbyComponents,
  prompt: promptComponents,
  vote: voteComponents,
  reveal: revealComponents,
  scoreboard: scoreboardComponents,
  results: resultsComponents,
  timer: timerComponents,
  info: infoComponents,
  media: mediaComponents,
  custom: customComponents,
};

// ---------------------------------------------------------------------------
// getDefaultTemplate
// ---------------------------------------------------------------------------

/**
 * Returns the default partial screen declaration for a template type.
 *
 * The returned object includes a default `components` array and a default
 * `layout` appropriate to the template. Games can spread these defaults and
 * override specific fields.
 *
 * Unknown template types fall back to the `custom` template (empty components).
 */
export function getDefaultTemplate(type: ScreenTemplateType): Partial<ScreenDeclaration> {
  const components = TEMPLATE_COMPONENTS[type] ?? TEMPLATE_COMPONENTS['custom'];

  // Default layouts per template type
  const layoutMap: Record<ScreenTemplateType, ScreenDeclaration['layout']> = {
    lobby: { type: 'centered' },
    prompt: { type: 'stack' },
    vote: { type: 'grid', columns: 2 },
    reveal: { type: 'centered' },
    scoreboard: { type: 'list' },
    results: { type: 'centered' },
    timer: { type: 'fullscreen' },
    info: { type: 'centered' },
    media: { type: 'fullscreen' },
    custom: { type: 'stack' },
  };

  return {
    template: type,
    layout: layoutMap[type] ?? { type: 'stack' },
    components: [...components.map((c) => ({ ...c }))],
  };
}

/**
 * Returns all available template types.
 */
export function getTemplateTypes(): ScreenTemplateType[] {
  return Object.keys(TEMPLATE_COMPONENTS) as ScreenTemplateType[];
}
