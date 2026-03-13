/**
 * capability-docs.ts — Runtime capability documentation for the Authoring System.
 *
 * Provides structured documentation for all V2 runtime capabilities.
 * This is the foundation for AI-assisted game generation — an LLM can call
 * getCapabilityDocs() or generateSchemaReference() to understand what the
 * runtime supports before generating a game package.
 *
 * Design:
 * - Pure data — no runtime imports
 * - Each capability includes a working YAML example
 * - generateSchemaReference() produces LLM-ready markdown
 *
 * Subsystem: authoring-system
 * Phase: 4.4
 */

import type { CapabilityDoc } from './types.js';

// ---------------------------------------------------------------------------
// All capability docs
// ---------------------------------------------------------------------------

const CAPABILITY_DOCS: CapabilityDoc[] = [
  // =========================================================================
  // INTERACTIONS
  // =========================================================================
  {
    name: 'text-input',
    category: 'interaction',
    description:
      'Free-text submission. Players type any text response on their phone. ' +
      'Used for answer games, name entry, drawing prompts, etc.',
    yamlExample: `phases:
  submit:
    type: input_gate
    duration: 45
    input:
      primitive: text_submit
      target: per_player.answer
      required: all_players
    screen:
      display: template:waiting
      phone: template:text_input`,
    parameters: [
      { name: 'primitive', type: 'string', required: true, description: 'Must be "text_submit"' },
      { name: 'target', type: 'string', required: true, description: 'State path to store the submission (e.g. per_player.answer)' },
      { name: 'required', type: 'string | string[]', required: false, description: '"all_players", "active_player", or list of player IDs' },
    ],
  },
  {
    name: 'choice',
    category: 'interaction',
    description:
      'Pick one option from a list. Used for multiple choice, card selection, ' +
      'board moves, etc. Options can be static or dynamic (from state).',
    yamlExample: `phases:
  vote:
    type: input_gate
    duration: 30
    input:
      primitive: choice
      options: globals.answer_list
      target: per_player.vote
      required: all_players
    screen:
      display: template:choice
      phone: template:choice`,
    parameters: [
      { name: 'primitive', type: 'string', required: true, description: 'Must be "choice"' },
      { name: 'options', type: 'string | string[]', required: true, description: 'State path to options array, or static string array' },
      { name: 'target', type: 'string', required: true, description: 'State path to store the selected value' },
      { name: 'required', type: 'string | string[]', required: false, description: '"all_players", "active_player", etc.' },
    ],
  },
  {
    name: 'vote',
    category: 'interaction',
    description:
      'Vote for a player (target-player selection). Used in social deduction, ' +
      'elimination games, popularity contests. Players select another player by name/ID.',
    yamlExample: `phases:
  day_vote:
    type: input_gate
    duration: 30
    input:
      primitive: vote
      target: per_player.vote
      required: players.alive
      options: players.alive
    screen:
      display: template:waiting
      phone: template:vote`,
    parameters: [
      { name: 'primitive', type: 'string', required: true, description: 'Must be "vote"' },
      { name: 'target', type: 'string', required: true, description: 'State path to store the selected player ID' },
      { name: 'required', type: 'string | string[]', required: false, description: 'Who must vote' },
      { name: 'options', type: 'string', required: false, description: 'Who can be voted for (state path or player filter)' },
    ],
  },
  {
    name: 'number-input',
    category: 'interaction',
    description:
      'Numeric input with optional min/max/step. Used for bets, guesses, quantities.',
    yamlExample: `phases:
  bet:
    type: input_gate
    duration: 20
    input:
      primitive: number_input
      target: per_player.bet
      required: all_players
      min: 0
      max: 1000
      step: 10
    screen:
      phone: template:number_input`,
    parameters: [
      { name: 'primitive', type: 'string', required: true, description: 'Must be "number_input"' },
      { name: 'target', type: 'string', required: true, description: 'State path to store the number' },
      { name: 'min', type: 'number', required: false, description: 'Minimum allowed value' },
      { name: 'max', type: 'number', required: false, description: 'Maximum allowed value' },
      { name: 'step', type: 'number', required: false, description: 'Step increment' },
    ],
  },
  {
    name: 'toggle',
    category: 'interaction',
    description:
      'Binary yes/no or on/off. Used for readiness checks, opt-in/opt-out, boolean choices.',
    yamlExample: `phases:
  ready_check:
    type: input_gate
    duration: 30
    input:
      primitive: toggle
      target: per_player.ready
      required: all_players
    screen:
      phone: template:toggle`,
    parameters: [
      { name: 'primitive', type: 'string', required: true, description: 'Must be "toggle"' },
      { name: 'target', type: 'string', required: true, description: 'State path to store the boolean' },
    ],
  },
  {
    name: 'ranking',
    category: 'interaction',
    description:
      'Drag-to-reorder a list of items. Used for preference ranking, ordering challenges.',
    yamlExample: `phases:
  rank:
    type: input_gate
    duration: 45
    input:
      primitive: ranking
      options: globals.items_to_rank
      target: per_player.ranking
      required: all_players
    screen:
      phone: template:ranking`,
    parameters: [
      { name: 'primitive', type: 'string', required: true, description: 'Must be "ranking"' },
      { name: 'options', type: 'string', required: true, description: 'State path to items to rank' },
      { name: 'target', type: 'string', required: true, description: 'State path to store the ranked order' },
    ],
  },
  {
    name: 'slider',
    category: 'interaction',
    description:
      'Continuous numeric slider. Used for intensity ratings, approximate guesses, scales.',
    yamlExample: `phases:
  rate:
    type: input_gate
    duration: 20
    input:
      primitive: slider
      target: per_player.rating
      required: all_players
      min: 0
      max: 100
    screen:
      phone: template:slider`,
    parameters: [
      { name: 'primitive', type: 'string', required: true, description: 'Must be "slider"' },
      { name: 'target', type: 'string', required: true, description: 'State path to store the value' },
      { name: 'min', type: 'number', required: false, description: 'Minimum value (default: 0)' },
      { name: 'max', type: 'number', required: false, description: 'Maximum value (default: 100)' },
    ],
  },

  // =========================================================================
  // PHASE TYPES
  // =========================================================================
  {
    name: 'phase-timed',
    category: 'phase',
    description:
      'A phase that runs for a fixed duration then auto-advances. ' +
      'Use for countdown reveals, transitions, lobby waits.',
    yamlExample: `phases:
  reveal:
    type: timed
    duration: 8
    screen:
      display: template:reveal
      phone: template:reveal
    on_exit:
      - action: advance
        to: next_phase`,
    parameters: [
      { name: 'type', type: 'string', required: true, description: 'Must be "timed"' },
      { name: 'duration', type: 'number | string', required: false, description: 'Duration in seconds (e.g. 8 or "30s")' },
      { name: 'on_enter', type: 'Action[]', required: false, description: 'Actions to run when phase starts' },
      { name: 'on_exit', type: 'Action[]', required: false, description: 'Actions to run when phase ends' },
      { name: 'screen', type: 'PhaseScreens', required: false, description: 'display/phone/spectator screen declarations' },
    ],
  },
  {
    name: 'phase-input_gate',
    category: 'phase',
    description:
      'A phase that waits for required player inputs before advancing. ' +
      'Has optional timeout — if timer expires, missing inputs are filled with defaults. ' +
      'Use for submissions, votes, card plays.',
    yamlExample: `phases:
  submit:
    type: input_gate
    duration: 30
    input:
      primitive: text_submit
      target: per_player.answer
      required: all_players
    screen:
      display: template:waiting
      phone: template:text_input
    on_complete:
      - action: advance
        to: next_phase`,
    parameters: [
      { name: 'type', type: 'string', required: true, description: 'Must be "input_gate"' },
      { name: 'duration', type: 'number', required: false, description: 'Timeout in seconds' },
      { name: 'input', type: 'PhaseInput', required: true, description: 'Interaction primitive configuration' },
      { name: 'on_complete', type: 'Action[]', required: false, description: 'Actions when all required inputs received' },
    ],
  },

  // =========================================================================
  // CONTENT
  // =========================================================================
  {
    name: 'content-prompts',
    category: 'content',
    description:
      'A pool of text prompts (questions, topics, challenges). ' +
      'Drawn during game phases via content_draw action.',
    yamlExample: `content:
  pools:
    - id: prompts
      name: Game Prompts
      sources:
        - type: file
          path: ./prompts.json
      selection: random
      noRepeat: true

# In game phases:
phases:
  draw_prompt:
    type: timed
    duration: 5
    on_enter:
      - action: content_draw
        pool: prompts
        target: globals.current_prompt`,
    parameters: [
      { name: 'id', type: 'string', required: true, description: 'Unique pool identifier' },
      { name: 'sources', type: 'ContentSource[]', required: true, description: 'Where to load content from (file, inline, bundled)' },
      { name: 'selection', type: 'string', required: true, description: '"random", "weighted", "sequential", or "shuffle"' },
      { name: 'noRepeat', type: 'boolean', required: false, description: 'Avoid repeating items until pool exhausted' },
    ],
  },
  {
    name: 'content-questions',
    category: 'content',
    description:
      'A pool of trivia questions with answer choices. ' +
      'Items should include metadata with the correct answer.',
    yamlExample: `content:
  pools:
    - id: questions
      sources:
        - type: inline
          items:
            - id: q1
              text: "What is the capital of France?"
              metadata:
                choices: ["London", "Paris", "Berlin", "Madrid"]
                answer: "Paris"
                difficulty: easy
      selection: random
      noRepeat: true`,
    parameters: [
      { name: 'text', type: 'string', required: true, description: 'Question text' },
      { name: 'metadata.choices', type: 'string[]', required: false, description: 'Answer choices for multiple choice' },
      { name: 'metadata.answer', type: 'string', required: false, description: 'The correct answer' },
      { name: 'difficulty', type: 'string', required: false, description: '"easy", "medium", or "hard"' },
    ],
  },
  {
    name: 'content-categories',
    category: 'content',
    description:
      'Categorized content pools — filter by category or difficulty for adaptive content.',
    yamlExample: `content:
  pools:
    - id: mixed_questions
      sources:
        - type: file
          path: ./questions.json
      selection: weighted
      filters:
        - field: difficulty
          value: easy`,
    parameters: [
      { name: 'filters', type: 'ContentFilter[]', required: false, description: 'Filter by category, difficulty, or tag' },
      { name: 'selection', type: 'string', required: false, description: '"weighted" uses item weight field for probability' },
    ],
  },

  // =========================================================================
  // SCORING
  // =========================================================================
  {
    name: 'score-tracks',
    category: 'scoring',
    description:
      'Define one or more score dimensions. Multiple tracks enable parallel scoring ' +
      '(e.g. points + lives + bonus multiplier).',
    yamlExample: `scoring:
  tracks:
    - id: points
      name: Points
      initial: 0
      direction: higher-better
    - id: lives
      name: Lives
      initial: 3
      min: 0
      direction: lower-better
  rules:
    - id: score_correct
      track: points
      trigger: manual
      formula:
        type: fixed
        amount: 100`,
    parameters: [
      { name: 'tracks', type: 'ScoreTrack[]', required: true, description: 'Array of score track definitions' },
      { name: 'rules', type: 'ScoringRule[]', required: false, description: 'Array of scoring rules (when/how to award points)' },
    ],
  },
  {
    name: 'score-formulas',
    category: 'scoring',
    description:
      'Formula-based scoring: fixed amounts, expressions, multipliers, lookup tables.',
    yamlExample: `scoring:
  rules:
    - id: speed_bonus
      track: points
      trigger: manual
      formula:
        type: expression
        expr: "max(0, 100 - elapsed_ms / 1000 * 5)"
    - id: combo_score
      track: points
      trigger: manual
      formula:
        type: multiplier
        base: 50
        multiplier: player.streak`,
    parameters: [
      { name: 'formula.type', type: 'string', required: true, description: '"fixed", "expression", "multiplier", or "lookup"' },
      { name: 'formula.amount', type: 'number', required: false, description: 'Fixed point amount (type: fixed)' },
      { name: 'formula.expr', type: 'string', required: false, description: 'Expression string (type: expression)' },
    ],
  },
  {
    name: 'victory-conditions',
    category: 'scoring',
    description:
      'Declare when and how the game ends. Supports various victory patterns.',
    yamlExample: `victory:
  type: highest_score
  after: all_rounds
  tiebreak: most_correct_guesses

# Other types:
# type: target_score
# target: 500

# type: last_standing
# (use with elimination logic)

# type: team_objective
# (use with teams: section)`,
    parameters: [
      { name: 'type', type: 'string', required: true, description: '"highest_score", "target_score", "last_standing", "team_objective", etc.' },
      { name: 'after', type: 'number | "all_rounds"', required: false, description: 'When to evaluate victory' },
      { name: 'target', type: 'number', required: false, description: 'Target score for "target_score" type' },
      { name: 'tiebreak', type: 'string', required: false, description: 'Tiebreak rule ID or field name' },
    ],
  },

  // =========================================================================
  // RULES
  // =========================================================================
  {
    name: 'rule-conditions',
    category: 'rule',
    description:
      'Declarative conditions that evaluate game state. Used in rules, phase transitions, ' +
      'and victory conditions.',
    yamlExample: `rules:
  - id: check_winner
    when:
      type: comparison
      left: player.score
      operator: ">="
      right: 500
    then:
      - type: state_mutation
        target: globals.winner_id
        value: player.id`,
    parameters: [
      { name: 'type', type: 'string', required: true, description: '"comparison", "logical", "expression", or "builtin"' },
      { name: 'operator', type: 'string', required: false, description: '"==", "!=", ">", "<", ">=", "<=", "contains", "in"' },
    ],
  },
  {
    name: 'rule-actions',
    category: 'rule',
    description:
      'Actions triggered when a rule condition is met. Supports state mutations, ' +
      'score changes, announcements, and phase jumps.',
    yamlExample: `rules:
  - id: comeback_bonus
    when:
      type: expression
      expr: "leader.score - player.score > 200"
    then:
      - type: score_modifier
        track: points
        amount: 100
        target: trailing_player`,
    parameters: [
      { name: 'type', type: 'string', required: true, description: '"state_mutation", "score_modifier", "announce", "phase_jump"' },
      { name: 'target', type: 'string', required: false, description: 'State path to mutate' },
      { name: 'value', type: 'unknown', required: false, description: 'New value for state_mutation' },
    ],
  },

  // =========================================================================
  // PRESENTATION
  // =========================================================================
  {
    name: 'presentation-screens',
    category: 'presentation',
    description:
      'Declare screens for each phase. Each phase can have different screens for ' +
      'the TV display, player phones, and spectators.',
    yamlExample: `presentation:
  screens:
    - id: play
      template: prompt
      surface: both
      title: "Answer Time!"
      animations:
        enter: slide-up
        duration: 200`,
    parameters: [
      { name: 'id', type: 'string', required: true, description: 'Screen identifier (usually matches phase ID)' },
      { name: 'template', type: 'string', required: true, description: 'Template name: lobby, prompt, choice, reveal, results, waiting, etc.' },
      { name: 'surface', type: 'string', required: false, description: '"display", "phone", "spectator", or "both"' },
    ],
  },
  {
    name: 'presentation-themes',
    category: 'presentation',
    description:
      'Per-game visual theming — colors, typography, dark/light mode, animations.',
    yamlExample: `presentation:
  theme:
    colors:
      primary: "#a855f7"
      background: "#0f0f23"
      surface: "#1a1040"
      text: "#f8fafc"
      accent: "#f59e0b"
    darkMode: true
    borderRadius: "12px"
    typography: rounded`,
    parameters: [
      { name: 'colors.primary', type: 'string', required: false, description: 'Hex color for primary UI elements' },
      { name: 'colors.background', type: 'string', required: false, description: 'Page background color' },
      { name: 'darkMode', type: 'boolean', required: false, description: 'Enable dark mode (default: false)' },
    ],
  },

  // =========================================================================
  // EXTENSIONS
  // =========================================================================
  {
    name: 'extension-renderer',
    category: 'extension',
    description:
      'Custom React component for specialized UI — board games, drawing tools, ' +
      'card tables. Receives typed state props from the runtime.',
    yamlExample: `extensions:
  renderers:
    wordcraft_board:
      display: ./display/WCDisplay.tsx
      phone: ./phone/WCPhone.tsx
      props_schema:
        board: board_ref
        rack: hand_ref`,
    parameters: [
      { name: 'display', type: 'string', required: false, description: 'Path to display (TV) React component' },
      { name: 'phone', type: 'string', required: false, description: 'Path to phone React component' },
      { name: 'props_schema', type: 'Record<string, string>', required: false, description: 'Type schema for props passed to renderer' },
    ],
  },
  {
    name: 'extension-rule',
    category: 'extension',
    description:
      'Custom rule evaluator function — for logic too complex for expressions: ' +
      'dictionary validation, hand evaluation, physics checks.',
    yamlExample: `extensions:
  rules:
    validate_word:
      module: ./server/dictionary.ts
      function: isValidWord
      input: { word: string }
      output: boolean`,
    parameters: [
      { name: 'module', type: 'string', required: true, description: 'Path to TypeScript module' },
      { name: 'function', type: 'string', required: true, description: 'Exported function name' },
      { name: 'input', type: 'Record<string, string>', required: false, description: 'Input type schema' },
      { name: 'output', type: 'string', required: false, description: 'Output type (boolean, number, string)' },
    ],
  },
  {
    name: 'extension-interaction',
    category: 'extension',
    description:
      'Custom input widget for specialized player interactions — drawing canvas, ' +
      'tile placement, card sorting.',
    yamlExample: `extensions:
  interactions:
    tile_placer:
      phone: ./phone/TilePlacer.tsx
      payload_schema:
        tiles: array_of_tile_placement
      validator: ./server/validate_placement.ts`,
    parameters: [
      { name: 'phone', type: 'string', required: false, description: 'Path to phone interaction component' },
      { name: 'payload_schema', type: 'Record<string, string>', required: false, description: 'Schema for submitted payload' },
      { name: 'validator', type: 'string', required: false, description: 'Path to server-side validation module' },
    ],
  },
  {
    name: 'extension-lifecycle',
    category: 'extension',
    description:
      'Custom lifecycle hooks for game events — on_game_start, on_phase_end, etc. ' +
      'For logic that cannot be expressed with declarative rules.',
    yamlExample: `extensions:
  lifecycle:
    game_hooks:
      module: ./server/lifecycle.ts
      hooks:
        - on_game_start
        - on_phase_end
        - on_player_eliminate`,
    parameters: [
      { name: 'module', type: 'string', required: true, description: 'Path to TypeScript module' },
      { name: 'hooks', type: 'string[]', required: true, description: 'List of lifecycle events to hook into' },
    ],
  },

  // =========================================================================
  // ASSETS
  // =========================================================================
  {
    name: 'asset-image',
    category: 'asset',
    description:
      'Declare images to be used in the game. Images can be preloaded at game start ' +
      'for smooth display during play.',
    yamlExample: `assets:
  declarations:
    - id: game_logo
      type: image
      src: ./assets/logo.png
      alt: Game logo
      preload: true
    - id: background_art
      type: image
      src: ./assets/bg.jpg
      preload: false`,
    parameters: [
      { name: 'id', type: 'string', required: true, description: 'Asset identifier' },
      { name: 'type', type: 'string', required: true, description: '"image", "audio", "video", "font", or "json"' },
      { name: 'src', type: 'string', required: true, description: 'Path to asset file (relative to game directory)' },
      { name: 'preload', type: 'boolean', required: false, description: 'Whether to preload at game start (default: false)' },
    ],
  },
  {
    name: 'asset-audio',
    category: 'asset',
    description:
      'Sound effects and music. Declare audio assets for use in screen templates ' +
      'or triggered by game events.',
    yamlExample: `assets:
  declarations:
    - id: correct_ding
      type: audio
      src: ./sounds/correct.mp3
      preload: true
    - id: background_music
      type: audio
      src: ./sounds/bg_music.ogg
      preload: false`,
    parameters: [
      { name: 'id', type: 'string', required: true, description: 'Asset identifier' },
      { name: 'type', type: 'string', required: true, description: 'Must be "audio"' },
      { name: 'src', type: 'string', required: true, description: 'Path to audio file' },
    ],
  },
  {
    name: 'asset-video',
    category: 'asset',
    description:
      'Video assets for intros, reveals, or backgrounds.',
    yamlExample: `assets:
  declarations:
    - id: game_intro
      type: video
      src: ./videos/intro.mp4
      preload: true`,
    parameters: [
      { name: 'id', type: 'string', required: true, description: 'Asset identifier' },
      { name: 'type', type: 'string', required: true, description: 'Must be "video"' },
      { name: 'src', type: 'string', required: true, description: 'Path to video file' },
    ],
  },
  {
    name: 'asset-font',
    category: 'asset',
    description:
      'Custom fonts for game theming. Declare and reference in the theme section.',
    yamlExample: `assets:
  declarations:
    - id: game_font
      type: font
      src: ./fonts/GameFont.woff2
      preload: true`,
    parameters: [
      { name: 'id', type: 'string', required: true, description: 'Asset identifier' },
      { name: 'type', type: 'string', required: true, description: 'Must be "font"' },
      { name: 'src', type: 'string', required: true, description: 'Path to font file' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get documentation for all available runtime capabilities.
 */
export function getCapabilityDocs(): CapabilityDoc[] {
  return CAPABILITY_DOCS;
}

/**
 * Find documentation for a specific capability by name.
 */
export function getCapabilityDoc(name: string): CapabilityDoc | undefined {
  return CAPABILITY_DOCS.find((doc) => doc.name === name);
}

/**
 * Generate a comprehensive schema reference document in Markdown format.
 * Suitable for including in an LLM prompt to guide game generation.
 */
export function generateSchemaReference(): string {
  const sections: string[] = [
    '# Boredless V2 — Game Schema Reference',
    '',
    'This reference describes all capabilities available in the Boredless V2 declarative game runtime.',
    'Use this to generate, understand, and validate game packages.',
    '',
    '---',
    '',
    '## Top-Level Structure',
    '',
    'Every V2 game package (game.yaml) must include:',
    '',
    '```yaml',
    'schema_version: "2.0"',
    '',
    'manifest:',
    '  id: my-game              # lowercase-alphanumeric-with-hyphens',
    '  name: My Game',
    '  description: "..."',
    '  version: "1.0.0"',
    '  players:',
    '    min: 2',
    '    max: 8',
    '',
    'state_model:',
    '  globals:',
    '    round: { type: integer, default: 0 }',
    '  per_player:',
    '    score: { type: integer, default: 0, visibility: public }',
    '',
    'turn_model:',
    '  type: simultaneous   # or: round_robin, priority_queue',
    '',
    'phases:',
    '  lobby:',
    '    type: timed',
    '    duration: 5',
    '    on_exit:',
    '      - action: advance',
    '        to: play',
    '',
    'victory:',
    '  type: highest_score',
    '  after: all_rounds',
    '```',
    '',
    '---',
    '',
  ];

  // Group capabilities by category
  const categories = [
    'phase',
    'interaction',
    'content',
    'scoring',
    'rule',
    'presentation',
    'extension',
    'asset',
  ] as const;

  const categoryLabels: Record<string, string> = {
    phase: '## Phase Types',
    interaction: '## Interaction Primitives',
    content: '## Content System',
    scoring: '## Scoring & Victory',
    rule: '## Rule System',
    presentation: '## Presentation & Theming',
    extension: '## Extension System',
    asset: '## Asset System',
  };

  const categoryDescriptions: Record<string, string> = {
    phase: 'Phases define the stages of your game. Each phase has a type that controls how it advances.',
    interaction: 'Interaction primitives define how players provide input. Add them to `input_gate` phases.',
    content: 'The content system separates game content (prompts, questions, cards) from game logic.',
    scoring: 'Declare how players earn points and what constitutes a win.',
    rule: 'Rules evaluate conditions and trigger actions. Use for dynamic game behavior.',
    presentation: 'Control the visual appearance and screen layout for display and phones.',
    extension: 'Extensions are escape hatches for logic that can\'t be expressed declaratively.',
    asset: 'Declare images, audio, video, and fonts used by your game.',
  };

  for (const category of categories) {
    const docs = CAPABILITY_DOCS.filter((d) => d.category === category);
    if (docs.length === 0) continue;

    sections.push(categoryLabels[category]);
    sections.push('');
    sections.push(categoryDescriptions[category]);
    sections.push('');

    for (const doc of docs) {
      sections.push(`### ${doc.name}`);
      sections.push('');
      sections.push(doc.description);
      sections.push('');
      sections.push('**YAML Example:**');
      sections.push('');
      sections.push('```yaml');
      sections.push(doc.yamlExample);
      sections.push('```');
      sections.push('');

      if (doc.parameters && doc.parameters.length > 0) {
        sections.push('**Parameters:**');
        sections.push('');
        for (const param of doc.parameters) {
          const required = param.required ? '*(required)*' : '*(optional)*';
          sections.push(`- \`${param.name}\` — ${param.type} ${required}: ${param.description}`);
        }
        sections.push('');
      }

      sections.push('---');
      sections.push('');
    }
  }

  sections.push('## State Model Field Types');
  sections.push('');
  sections.push('Valid types for `state_model` fields:');
  sections.push('');
  sections.push('| Type | Description |');
  sections.push('|------|-------------|');
  sections.push('| `integer` | Whole number (0, 1, 100) |');
  sections.push('| `float` | Decimal number |');
  sections.push('| `string` | Text value |');
  sections.push('| `boolean` | true/false |');
  sections.push('| `content_ref` | Reference to drawn content item |');
  sections.push('| `array` | List of values |');
  sections.push('| `object` | Key-value map |');
  sections.push('| `null` | Empty / unset |');
  sections.push('');
  sections.push('**Visibility options:** `public`, `private`, `team`, `host`, `spectator`');
  sections.push('');
  sections.push('---');
  sections.push('');
  sections.push('## Turn Models');
  sections.push('');
  sections.push('| Type | Description |');
  sections.push('|------|-------------|');
  sections.push('| `simultaneous` | All players act at the same time (most party games) |');
  sections.push('| `round_robin` | Players take turns in order |');
  sections.push('| `priority_queue` | Players act based on a priority value |');
  sections.push('');
  sections.push('---');
  sections.push('');
  sections.push('## Phase Actions');
  sections.push('');
  sections.push('Common actions for `on_enter`, `on_exit`, `on_complete`:');
  sections.push('');
  sections.push('| Action | Description |');
  sections.push('|--------|-------------|');
  sections.push('| `advance` | Move to next phase (`to: phase_id`) |');
  sections.push('| `conditional` | Branch on condition (`condition`, `then`, `else`) |');
  sections.push('| `content_draw` | Draw content from pool (`pool`, `target`) |');
  sections.push('| `increment` | Increment a counter (`target`) |');
  sections.push('| `score_round` | Award points (`formulas`) |');
  sections.push('| `assign_roles` | Distribute roles to players |');
  sections.push('| `shuffle` | Shuffle an array or deck |');
  sections.push('| `deal` | Deal cards from deck to hands |');
  sections.push('| `eliminate_most_voted` | Eliminate the most-voted player |');
  sections.push('');

  return sections.join('\n');
}
