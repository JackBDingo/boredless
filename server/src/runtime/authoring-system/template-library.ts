/**
 * template-library.ts — Game template scaffolding for the Authoring System.
 *
 * Provides complete game.yaml skeletons for common game types.
 * Each template is a valid game package that passes validateGamePackage().
 *
 * Design:
 * - Pure data — no runtime imports
 * - Each template is self-contained and immediately playable
 * - Templates are annotated with comments embedded in string content
 *
 * Subsystem: authoring-system
 * Phase: 4.4
 */

import type { GameTemplate, GameTemplateType, ComplexityScore } from './types.js';
import { calculateComplexity } from './introspector.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a complete game template by type.
 * Returns a valid game.yaml schema plus supplemental files.
 */
export function getTemplate(type: GameTemplateType): GameTemplate {
  switch (type) {
    case 'minimal':
      return buildMinimalTemplate();
    case 'party':
      return buildPartyTemplate();
    case 'trivia':
      return buildTriviaTemplate();
    case 'hidden-role':
      return buildHiddenRoleTemplate();
    case 'drawing':
      return buildDrawingTemplate();
    case 'word':
      return buildWordTemplate();
    case 'card':
      return buildCardTemplate();
    case 'board':
      return buildBoardTemplate();
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown template type: ${String(_exhaustive)}`);
    }
  }
}

/**
 * List all available templates with their metadata.
 */
export function getAvailableTemplates(): Array<{
  type: GameTemplateType;
  name: string;
  description: string;
  complexity: ComplexityScore;
}> {
  const types: GameTemplateType[] = [
    'minimal',
    'party',
    'trivia',
    'hidden-role',
    'drawing',
    'word',
    'card',
    'board',
  ];

  return types.map((type) => {
    const template = getTemplate(type);
    return {
      type,
      name: template.name,
      description: template.description,
      complexity: template.complexity,
    };
  });
}

// ---------------------------------------------------------------------------
// Minimal template (simplest possible game)
// ---------------------------------------------------------------------------

function buildMinimalTemplate(): GameTemplate {
  const schema: Record<string, unknown> = {
    schema_version: '2.0',
    manifest: {
      id: 'my-minimal-game',
      name: 'My Minimal Game',
      description: 'A bare-minimum game template. Customize to build your own.',
      version: '1.0.0',
      author: 'Your Name',
      tags: ['custom'],
      players: { min: 2, max: 8 },
      estimated_minutes: { min: 5, max: 15 },
    },
    state_model: {
      globals: {
        round: { type: 'integer', default: 1, visibility: 'public' },
      },
      per_player: {
        score: { type: 'integer', default: 0, visibility: 'public' },
        answer: { type: 'string', default: null, visibility: 'private' },
      },
    },
    turn_model: { type: 'simultaneous' },
    phases: {
      lobby: {
        type: 'timed',
        duration: 5,
        screen: {
          display: 'template:lobby',
          phone: 'template:lobby',
        },
        on_exit: [{ action: 'advance', to: 'play' }],
      },
      play: {
        type: 'input_gate',
        duration: 30,
        input: {
          primitive: 'text_submit',
          target: 'per_player.answer',
          required: 'all_players',
        },
        screen: {
          display: 'template:waiting',
          phone: 'template:text_input',
        },
        on_complete: [{ action: 'advance', to: 'end' }],
      },
      end: {
        type: 'timed',
        duration: 10,
        screen: {
          display: 'template:final_results',
          phone: 'template:final_results',
        },
      },
    },
    presentation: {
      theme: {
        colors: {
          primary: '#6366f1',
          background: '#0f0f23',
          surface: '#1a1a3e',
          text: '#f8fafc',
        },
        darkMode: true,
      },
    },
    scoring: {
      correct_answer: 100,
    },
    victory: {
      type: 'highest_score',
      after: 'all_rounds',
    },
  };

  const complexity = calculateComplexity({
    subsystems: {
      phases: [
        { id: 'lobby', type: 'timed', hasTimer: true, transitions: ['play'] },
        { id: 'play', type: 'input_gate', hasTimer: true, transitions: ['end'] },
        { id: 'end', type: 'timed', hasTimer: true, transitions: [] },
      ],
      interactions: [{ type: 'text_submit', phase: 'play', surface: 'phone' }],
      contentSources: [],
      scoreTracks: [{ id: 'score', name: 'Score', direction: 'higher-better' }],
      rules: [],
      extensions: [],
      screens: [],
      assets: [],
    },
  });

  return {
    type: 'minimal',
    name: 'Minimal Game',
    description: 'The simplest possible game: lobby → play → end. Text input, one score track.',
    schema,
    files: [
      {
        path: 'README.md',
        content: [
          '# My Minimal Game',
          '',
          'A bare-minimum game built on the Boredless V2 runtime.',
          '',
          '## Phases',
          '- **lobby** — Wait for players, then start',
          '- **play** — All players submit a text answer',
          '- **end** — Show final results',
          '',
          '## Customizing',
          '1. Edit `game.yaml` to change phase durations, add content, or add rules',
          '2. Rename the game ID in the manifest',
          '3. Add prompts using the content system',
          '',
          'See the Boredless V2 documentation for full schema reference.',
        ].join('\n'),
        description: 'Game README with setup instructions',
      },
    ],
    complexity,
  };
}

// ---------------------------------------------------------------------------
// Party template (Quiplash-style)
// ---------------------------------------------------------------------------

function buildPartyTemplate(): GameTemplate {
  const schema: Record<string, unknown> = {
    schema_version: '2.0',
    manifest: {
      id: 'my-party-game',
      name: 'My Party Game',
      description: 'Players write funny answers to prompts. Everyone votes for the best.',
      version: '1.0.0',
      author: 'Your Name',
      tags: ['party', 'bluffing', 'writing'],
      players: { min: 3, max: 8 },
      estimated_minutes: { min: 15, max: 30 },
    },
    state_model: {
      globals: {
        round: { type: 'integer', default: 0, visibility: 'public' },
        total_rounds: { type: 'integer', default: 6, visibility: 'public' },
        current_prompt: { type: 'content_ref', default: null, visibility: 'public' },
        answer_list: { type: 'array', default: [], visibility: 'public' },
      },
      per_player: {
        score: { type: 'integer', default: 0, visibility: 'public' },
        submission: { type: 'string', default: null, visibility: 'private' },
        vote: { type: 'string', default: null, visibility: 'private' },
      },
    },
    turn_model: { type: 'simultaneous' },
    phases: {
      lobby: {
        type: 'timed',
        duration: 5,
        screen: {
          display: 'template:lobby',
          phone: 'template:lobby',
        },
        on_exit: [{ action: 'advance', to: 'prompt' }],
      },
      prompt: {
        type: 'timed',
        duration: 8,
        on_enter: [
          {
            action: 'content_draw',
            pool: 'prompts',
            target: 'globals.current_prompt',
          },
          { action: 'increment', target: 'globals.round' },
        ],
        screen: {
          display: 'template:prompt',
          phone: 'template:prompt',
        },
        on_exit: [{ action: 'advance', to: 'submit' }],
      },
      submit: {
        type: 'input_gate',
        duration: 45,
        input: {
          primitive: 'text_submit',
          target: 'per_player.submission',
          required: 'all_players',
        },
        screen: {
          display: 'template:waiting',
          phone: 'template:text_input',
        },
        on_complete: [{ action: 'advance', to: 'vote' }],
      },
      vote: {
        type: 'input_gate',
        duration: 30,
        on_enter: [
          {
            action: 'shuffle_and_merge',
            sources: ['per_player.submission'],
            target: 'globals.answer_list',
          },
        ],
        input: {
          primitive: 'choice',
          options: 'globals.answer_list',
          target: 'per_player.vote',
          required: 'all_players',
        },
        screen: {
          display: 'template:choice',
          phone: 'template:choice',
        },
        on_complete: [{ action: 'advance', to: 'reveal' }],
      },
      reveal: {
        type: 'timed',
        duration: 10,
        on_enter: [
          {
            action: 'score_round',
            formulas: {
              received_vote: 100,
            },
          },
        ],
        screen: {
          display: 'template:reveal',
          phone: 'template:reveal',
        },
        on_exit: [
          {
            action: 'conditional',
            condition: 'globals.round < globals.total_rounds',
            then: { advance_to: 'prompt' },
            else: { advance_to: 'scores' },
          },
        ],
      },
      scores: {
        type: 'timed',
        duration: 10,
        screen: {
          display: 'template:final_results',
          phone: 'template:final_results',
        },
      },
    },
    content: {
      pools: [
        {
          id: 'prompts',
          name: 'Party Prompts',
          sources: [{ type: 'file', path: './prompts.json' }],
          selection: 'random',
          noRepeat: true,
        },
      ],
    },
    presentation: {
      theme: {
        colors: {
          primary: '#a855f7',
          background: '#0f0f23',
          surface: '#1a1040',
          text: '#f8fafc',
        },
        darkMode: true,
      },
    },
    scoring: {
      received_vote: 100,
    },
    victory: {
      type: 'highest_score',
      after: 'all_rounds',
      tiebreak: 'most_votes',
    },
  };

  const complexity = calculateComplexity({
    subsystems: {
      phases: [
        { id: 'lobby', type: 'timed', hasTimer: true, transitions: ['prompt'] },
        { id: 'prompt', type: 'timed', hasTimer: true, transitions: ['submit'] },
        { id: 'submit', type: 'input_gate', hasTimer: true, transitions: ['vote'] },
        { id: 'vote', type: 'input_gate', hasTimer: true, transitions: ['reveal'] },
        { id: 'reveal', type: 'timed', hasTimer: true, transitions: ['prompt', 'scores'] },
        { id: 'scores', type: 'timed', hasTimer: true, transitions: [] },
      ],
      interactions: [
        { type: 'text_submit', phase: 'submit', surface: 'phone' },
        { type: 'choice', phase: 'vote', surface: 'phone' },
      ],
      contentSources: [{ type: 'file' }],
      scoreTracks: [{ id: 'score', name: 'Score', direction: 'higher-better' }],
      rules: [],
      extensions: [],
      screens: [],
      assets: [],
    },
  });

  return {
    type: 'party',
    name: 'Party Game',
    description: 'Classic party game: write funny answers, vote for the best. Like Quiplash.',
    schema,
    files: [
      {
        path: 'README.md',
        content: [
          '# My Party Game',
          '',
          'A Quiplash-style party game built on Boredless V2.',
          '',
          '## Phases',
          '- **lobby** — Wait for players',
          '- **prompt** — Show a prompt (drawn from prompts.json)',
          '- **submit** — Players write their funniest answer',
          '- **vote** — Pick the answer you like best (anonymized)',
          '- **reveal** — See who said what and award points',
          '- **scores** — Show final results',
          '',
          '## Customizing',
          '1. Edit `prompts.json` with your own prompts',
          '2. Change `total_rounds` in state_model globals',
          '3. Adjust durations on each phase',
          '4. Modify scoring formulas',
        ].join('\n'),
        description: 'Game README',
      },
      {
        path: 'prompts.json',
        content: JSON.stringify(
          [
            { id: 'p1', text: 'The worst thing about Mondays is ___.' },
            { id: 'p2', text: 'My superpower would be ___, but only on Tuesdays.' },
            { id: 'p3', text: 'The new Olympic sport that would guarantee gold for me: ___.' },
            { id: 'p4', text: 'If I could replace the handshake with any gesture, it would be ___.' },
            { id: 'p5', text: '___ is the key to a happy life.' },
            { id: 'p6', text: 'The world would be a better place if everyone ___ before breakfast.' },
          ],
          null,
          2,
        ),
        description: 'Sample prompts — replace with your own',
      },
    ],
    complexity,
  };
}

// ---------------------------------------------------------------------------
// Trivia template
// ---------------------------------------------------------------------------

function buildTriviaTemplate(): GameTemplate {
  const schema: Record<string, unknown> = {
    schema_version: '2.0',
    manifest: {
      id: 'my-trivia-game',
      name: 'My Trivia Game',
      description: 'Multiple choice trivia. Answer fast for a speed bonus.',
      version: '1.0.0',
      author: 'Your Name',
      tags: ['trivia', 'quiz', 'knowledge'],
      players: { min: 2, max: 10 },
      estimated_minutes: { min: 10, max: 25 },
    },
    state_model: {
      globals: {
        round: { type: 'integer', default: 0, visibility: 'public' },
        total_rounds: { type: 'integer', default: 8, visibility: 'public' },
        current_question: { type: 'content_ref', default: null, visibility: 'public' },
      },
      per_player: {
        score: { type: 'integer', default: 0, visibility: 'public' },
        answer: { type: 'string', default: null, visibility: 'private' },
        answer_time_ms: { type: 'integer', default: null, visibility: 'private' },
      },
    },
    turn_model: { type: 'simultaneous' },
    phases: {
      lobby: {
        type: 'timed',
        duration: 5,
        screen: {
          display: 'template:lobby',
          phone: 'template:lobby',
        },
        on_exit: [{ action: 'advance', to: 'question' }],
      },
      question: {
        type: 'timed',
        duration: 5,
        on_enter: [
          {
            action: 'content_draw',
            pool: 'questions',
            target: 'globals.current_question',
          },
          { action: 'increment', target: 'globals.round' },
        ],
        screen: {
          display: 'template:prompt',
          phone: 'template:prompt',
        },
        on_exit: [{ action: 'advance', to: 'answer' }],
      },
      answer: {
        type: 'input_gate',
        duration: 20,
        input: {
          primitive: 'choice',
          options: 'globals.current_question.choices',
          target: 'per_player.answer',
          required: 'all_players',
        },
        screen: {
          display: 'template:waiting',
          phone: 'template:choice',
        },
        on_complete: [{ action: 'advance', to: 'reveal' }],
      },
      reveal: {
        type: 'timed',
        duration: 8,
        on_enter: [
          {
            action: 'score_round',
            formulas: {
              correct_answer: 100,
              speed_bonus: 50,
            },
          },
        ],
        screen: {
          display: 'template:reveal',
          phone: 'template:reveal',
        },
        on_exit: [
          {
            action: 'conditional',
            condition: 'globals.round < globals.total_rounds',
            then: { advance_to: 'question' },
            else: { advance_to: 'scores' },
          },
        ],
      },
      scores: {
        type: 'timed',
        duration: 10,
        screen: {
          display: 'template:final_results',
          phone: 'template:final_results',
        },
      },
    },
    content: {
      pools: [
        {
          id: 'questions',
          name: 'Trivia Questions',
          sources: [{ type: 'file', path: './questions.json' }],
          selection: 'random',
          noRepeat: true,
        },
      ],
    },
    presentation: {
      theme: {
        colors: {
          primary: '#3b82f6',
          background: '#0c1220',
          surface: '#162032',
          text: '#f8fafc',
        },
        darkMode: true,
      },
    },
    scoring: {
      correct_answer: 100,
      speed_bonus: 50,
    },
    victory: {
      type: 'highest_score',
      after: 'all_rounds',
      tiebreak: 'fastest_average',
    },
  };

  const complexity = calculateComplexity({
    subsystems: {
      phases: [
        { id: 'lobby', type: 'timed', hasTimer: true, transitions: ['question'] },
        { id: 'question', type: 'timed', hasTimer: true, transitions: ['answer'] },
        { id: 'answer', type: 'input_gate', hasTimer: true, transitions: ['reveal'] },
        { id: 'reveal', type: 'timed', hasTimer: true, transitions: ['question', 'scores'] },
        { id: 'scores', type: 'timed', hasTimer: true, transitions: [] },
      ],
      interactions: [{ type: 'choice', phase: 'answer', surface: 'phone' }],
      contentSources: [{ type: 'file' }],
      scoreTracks: [{ id: 'score', name: 'Score', direction: 'higher-better' }],
      rules: [],
      extensions: [],
      screens: [],
      assets: [],
    },
  });

  return {
    type: 'trivia',
    name: 'Trivia Game',
    description: 'Multiple-choice trivia with a timer on the answer phase.',
    schema,
    files: [
      {
        path: 'README.md',
        content: [
          '# My Trivia Game',
          '',
          'A quiz-style trivia game built on Boredless V2.',
          '',
          '## Phases',
          '- **lobby** — Wait for players',
          '- **question** — Show question (5 seconds)',
          '- **answer** — Players pick A/B/C/D (20 second timer)',
          '- **reveal** — Show correct answer + award points',
          '- **scores** — Show final results',
          '',
          '## Content Format',
          'Questions in `questions.json` need:',
          '```json',
          '{',
          '  "id": "q1",',
          '  "text": "What is the capital of France?",',
          '  "choices": ["London", "Paris", "Berlin", "Madrid"],',
          '  "metadata": { "answer": "Paris", "difficulty": "easy" }',
          '}',
          '```',
        ].join('\n'),
        description: 'Game README',
      },
      {
        path: 'questions.json',
        content: JSON.stringify(
          [
            {
              id: 'q1',
              text: 'What is the capital of France?',
              choices: ['London', 'Paris', 'Berlin', 'Madrid'],
              metadata: { answer: 'Paris', difficulty: 'easy' },
            },
            {
              id: 'q2',
              text: 'How many sides does a hexagon have?',
              choices: ['5', '6', '7', '8'],
              metadata: { answer: '6', difficulty: 'easy' },
            },
            {
              id: 'q3',
              text: 'Which planet is closest to the Sun?',
              choices: ['Venus', 'Earth', 'Mercury', 'Mars'],
              metadata: { answer: 'Mercury', difficulty: 'medium' },
            },
          ],
          null,
          2,
        ),
        description: 'Sample questions — replace with your own',
      },
    ],
    complexity,
  };
}

// ---------------------------------------------------------------------------
// Hidden role template (Werewolf-style)
// ---------------------------------------------------------------------------

function buildHiddenRoleTemplate(): GameTemplate {
  const schema: Record<string, unknown> = {
    schema_version: '2.0',
    manifest: {
      id: 'my-hidden-role-game',
      name: 'My Hidden Role Game',
      description: 'Social deduction with hidden roles. Village vs. Wolves. Trust no one.',
      version: '1.0.0',
      author: 'Your Name',
      tags: ['social-deduction', 'hidden-role', 'bluffing'],
      players: { min: 5, max: 12 },
      estimated_minutes: { min: 20, max: 45 },
    },
    state_model: {
      globals: {
        phase_number: { type: 'integer', default: 0, visibility: 'public' },
        eliminated_count: { type: 'integer', default: 0, visibility: 'public' },
        vote_target: { type: 'string', default: null, visibility: 'public' },
      },
      per_player: {
        role: { type: 'string', default: null, visibility: 'private' },
        is_alive: { type: 'boolean', default: true, visibility: 'public' },
        vote: { type: 'string', default: null, visibility: 'private' },
        score: { type: 'integer', default: 0, visibility: 'public' },
      },
    },
    roles: {
      villager: {
        name: 'Villager',
        description: 'An ordinary townsfolk. Find and eliminate the wolves.',
        team: 'village',
        count: 'majority',
      },
      wolf: {
        name: 'Wolf',
        description: 'A wolf in sheep\'s clothing. Eliminate villagers without being caught.',
        team: 'wolves',
        count: 2,
        ability: 'night_kill',
        visibility: 'role:wolf',
      },
    },
    turn_model: { type: 'simultaneous' },
    phases: {
      lobby: {
        type: 'timed',
        duration: 5,
        screen: {
          display: 'template:lobby',
          phone: 'template:lobby',
        },
        on_exit: [{ action: 'advance', to: 'role_reveal' }],
      },
      role_reveal: {
        type: 'timed',
        duration: 8,
        on_enter: [
          { action: 'assign_roles', source: 'roles' },
        ],
        screen: {
          display: 'template:waiting',
          phone: 'template:role_reveal',
        },
        on_exit: [{ action: 'advance', to: 'night' }],
      },
      night: {
        type: 'input_gate',
        duration: 30,
        input: {
          primitive: 'vote',
          target: 'per_player.vote',
          required: 'role:wolf',
          options: 'players.alive.not_role:wolf',
        },
        screen: {
          display: 'template:night',
          phone: 'template:vote',
        },
        on_complete: [
          { action: 'eliminate_most_voted', from: 'per_player.vote' },
          { action: 'advance', to: 'day_discussion' },
        ],
      },
      day_discussion: {
        type: 'timed',
        duration: 120,
        on_enter: [{ action: 'increment', target: 'globals.phase_number' }],
        screen: {
          display: 'template:discussion',
          phone: 'template:discussion',
        },
        on_exit: [{ action: 'advance', to: 'day_vote' }],
      },
      day_vote: {
        type: 'input_gate',
        duration: 30,
        input: {
          primitive: 'vote',
          target: 'per_player.vote',
          required: 'players.alive',
          options: 'players.alive',
        },
        screen: {
          display: 'template:waiting',
          phone: 'template:vote',
        },
        on_complete: [
          { action: 'eliminate_most_voted', from: 'per_player.vote' },
          { action: 'advance', to: 'day_reveal' },
        ],
      },
      day_reveal: {
        type: 'timed',
        duration: 8,
        screen: {
          display: 'template:reveal',
          phone: 'template:reveal',
        },
        on_exit: [
          {
            action: 'conditional',
            condition: 'players.alive.role:wolf.count == 0',
            then: { advance_to: 'village_wins' },
            else: {
              advance_to: 'night',
            },
          },
        ],
      },
      village_wins: {
        type: 'timed',
        duration: 10,
        screen: {
          display: 'template:final_results',
          phone: 'template:final_results',
        },
      },
    },
    presentation: {
      theme: {
        colors: {
          primary: '#dc2626',
          background: '#0c0c14',
          surface: '#1a1022',
          text: '#f8fafc',
        },
        darkMode: true,
      },
    },
    scoring: {
      survived: 50,
      correct_elimination: 100,
    },
    victory: {
      type: 'last_standing',
      tiebreak: 'team_wins',
    },
  };

  const complexity = calculateComplexity({
    subsystems: {
      phases: [
        { id: 'lobby', type: 'timed', hasTimer: true, transitions: ['role_reveal'] },
        { id: 'role_reveal', type: 'timed', hasTimer: true, transitions: ['night'] },
        { id: 'night', type: 'input_gate', hasTimer: true, transitions: ['day_discussion'] },
        { id: 'day_discussion', type: 'timed', hasTimer: true, transitions: ['day_vote'] },
        { id: 'day_vote', type: 'input_gate', hasTimer: true, transitions: ['day_reveal'] },
        { id: 'day_reveal', type: 'timed', hasTimer: true, transitions: ['night', 'village_wins'] },
        { id: 'village_wins', type: 'timed', hasTimer: true, transitions: [] },
      ],
      interactions: [
        { type: 'vote', phase: 'night', surface: 'phone' },
        { type: 'vote', phase: 'day_vote', surface: 'phone' },
      ],
      contentSources: [],
      scoreTracks: [{ id: 'score', name: 'Score', direction: 'higher-better' }],
      rules: [],
      extensions: [],
      screens: [],
      assets: [],
    },
  });

  return {
    type: 'hidden-role',
    name: 'Hidden Role Game',
    description: 'Social deduction with hidden roles. Village vs. Wolves.',
    schema,
    suggestedExtensions: ['role-renderer', 'night-action-validator'],
    files: [
      {
        path: 'README.md',
        content: [
          '# My Hidden Role Game',
          '',
          'A social deduction game built on Boredless V2.',
          '',
          '## Roles',
          '- **Villager** — Find and eliminate the wolves',
          '- **Wolf** — Secretly eliminate villagers each night',
          '',
          '## Phases',
          '- **lobby** → **role_reveal** → **night** → **day_discussion** → **day_vote** → **day_reveal**',
          '- Loop: night → day until wolves eliminated or outnumber villagers',
          '',
          '## Customizing',
          '- Add roles in the `roles:` section',
          '- Adjust wolf count via role count fields',
          '- Add special abilities using the extension system',
        ].join('\n'),
        description: 'Game README',
      },
    ],
    complexity,
  };
}

// ---------------------------------------------------------------------------
// Drawing template
// ---------------------------------------------------------------------------

function buildDrawingTemplate(): GameTemplate {
  const schema: Record<string, unknown> = {
    schema_version: '2.0',
    manifest: {
      id: 'my-drawing-game',
      name: 'My Drawing Game',
      description: 'Draw it, guess it. Like Pictionary for your phone.',
      version: '1.0.0',
      author: 'Your Name',
      tags: ['drawing', 'guessing', 'creative'],
      players: { min: 3, max: 8 },
      estimated_minutes: { min: 15, max: 30 },
    },
    state_model: {
      globals: {
        round: { type: 'integer', default: 0, visibility: 'public' },
        total_rounds: { type: 'integer', default: 5, visibility: 'public' },
        current_prompt: { type: 'content_ref', default: null, visibility: 'private' },
        drawer_id: { type: 'string', default: null, visibility: 'public' },
        current_drawing: { type: 'string', default: null, visibility: 'public' },
      },
      per_player: {
        score: { type: 'integer', default: 0, visibility: 'public' },
        guess: { type: 'string', default: null, visibility: 'private' },
      },
    },
    turn_model: { type: 'round_robin' },
    phases: {
      lobby: {
        type: 'timed',
        duration: 5,
        screen: {
          display: 'template:lobby',
          phone: 'template:lobby',
        },
        on_exit: [{ action: 'advance', to: 'draw' }],
      },
      draw: {
        type: 'input_gate',
        duration: 60,
        on_enter: [
          {
            action: 'content_draw',
            pool: 'draw_prompts',
            target: 'globals.current_prompt',
          },
          { action: 'increment', target: 'globals.round' },
        ],
        input: {
          primitive: 'draw_canvas',
          target: 'globals.current_drawing',
          required: 'active_player',
        },
        screen: {
          display: 'template:waiting',
          phone: 'template:draw_canvas',
        },
        on_complete: [{ action: 'advance', to: 'guess' }],
      },
      guess: {
        type: 'input_gate',
        duration: 30,
        input: {
          primitive: 'text_submit',
          target: 'per_player.guess',
          required: 'all_players_except_drawer',
        },
        screen: {
          display: 'template:drawing_display',
          phone: 'template:text_input',
        },
        on_complete: [{ action: 'advance', to: 'reveal' }],
      },
      reveal: {
        type: 'timed',
        duration: 8,
        on_enter: [
          {
            action: 'score_round',
            formulas: {
              correct_guess: 100,
              drawer_bonus_per_guesser: 25,
            },
          },
        ],
        screen: {
          display: 'template:reveal',
          phone: 'template:reveal',
        },
        on_exit: [
          {
            action: 'conditional',
            condition: 'globals.round < globals.total_rounds',
            then: { advance_to: 'draw' },
            else: { advance_to: 'scores' },
          },
        ],
      },
      scores: {
        type: 'timed',
        duration: 10,
        screen: {
          display: 'template:final_results',
          phone: 'template:final_results',
        },
      },
    },
    content: {
      pools: [
        {
          id: 'draw_prompts',
          name: 'Things to Draw',
          sources: [{ type: 'file', path: './prompts.json' }],
          selection: 'random',
          noRepeat: true,
        },
      ],
    },
    presentation: {
      theme: {
        colors: {
          primary: '#f59e0b',
          background: '#0f0c00',
          surface: '#1a1800',
          text: '#f8fafc',
        },
        darkMode: true,
      },
    },
    scoring: {
      correct_guess: 100,
      drawer_bonus_per_guesser: 25,
    },
    victory: {
      type: 'highest_score',
      after: 'all_rounds',
    },
    extensions: {
      interactions: {
        draw_canvas: {
          name: 'Drawing Canvas',
          description: 'Freeform drawing on phone touchscreen',
          phone: './phone/DrawCanvas.tsx',
          payload_schema: {
            strokes: 'array',
            image_data: 'string',
          },
        },
      },
    },
  };

  const complexity = calculateComplexity({
    subsystems: {
      phases: [
        { id: 'lobby', type: 'timed', hasTimer: true, transitions: ['draw'] },
        { id: 'draw', type: 'input_gate', hasTimer: true, transitions: ['guess'] },
        { id: 'guess', type: 'input_gate', hasTimer: true, transitions: ['reveal'] },
        { id: 'reveal', type: 'timed', hasTimer: true, transitions: ['draw', 'scores'] },
        { id: 'scores', type: 'timed', hasTimer: true, transitions: [] },
      ],
      interactions: [
        { type: 'draw_canvas', phase: 'draw', surface: 'phone' },
        { type: 'text_submit', phase: 'guess', surface: 'phone' },
      ],
      contentSources: [{ type: 'file' }],
      scoreTracks: [{ id: 'score', name: 'Score', direction: 'higher-better' }],
      rules: [],
      extensions: [{ id: 'draw_canvas', name: 'Drawing Canvas', type: 'interactions' }],
      screens: [],
      assets: [],
    },
  });

  return {
    type: 'drawing',
    name: 'Drawing Game',
    description: 'Pictionary-style: one player draws, others guess.',
    schema,
    suggestedExtensions: ['draw_canvas', 'stroke-renderer'],
    files: [
      {
        path: 'README.md',
        content: [
          '# My Drawing Game',
          '',
          'A Pictionary-style game built on Boredless V2.',
          '',
          '## Note on the draw_canvas Extension',
          'This template uses the `draw_canvas` interaction primitive, which requires',
          'a custom interaction extension (`phone/DrawCanvas.tsx`). You\'ll need to',
          'implement this component or install a community extension.',
          '',
          '## Phases',
          '- **lobby** — Wait for players',
          '- **draw** — Active player draws a prompt on their phone',
          '- **guess** — Everyone else types their guess',
          '- **reveal** — Show the answer and award points',
          '- **scores** — Final results',
        ].join('\n'),
        description: 'Game README',
      },
      {
        path: 'prompts.json',
        content: JSON.stringify(
          [
            { id: 'd1', text: 'Elephant', difficulty: 'easy' },
            { id: 'd2', text: 'Rollercoaster', difficulty: 'medium' },
            { id: 'd3', text: 'Time travel', difficulty: 'hard' },
            { id: 'd4', text: 'Pizza', difficulty: 'easy' },
            { id: 'd5', text: 'Dancing robot', difficulty: 'medium' },
          ],
          null,
          2,
        ),
        description: 'Sample draw prompts',
      },
    ],
    complexity,
  };
}

// ---------------------------------------------------------------------------
// Word template
// ---------------------------------------------------------------------------

function buildWordTemplate(): GameTemplate {
  const schema: Record<string, unknown> = {
    schema_version: '2.0',
    manifest: {
      id: 'my-word-game',
      name: 'My Word Game',
      description: 'Make words, score points. Simple word game skeleton.',
      version: '1.0.0',
      author: 'Your Name',
      tags: ['word', 'language', 'spelling'],
      players: { min: 2, max: 6 },
      estimated_minutes: { min: 10, max: 20 },
    },
    state_model: {
      globals: {
        round: { type: 'integer', default: 0, visibility: 'public' },
        total_rounds: { type: 'integer', default: 5, visibility: 'public' },
        letters: { type: 'array', default: [], visibility: 'public' },
      },
      per_player: {
        score: { type: 'integer', default: 0, visibility: 'public' },
        word: { type: 'string', default: null, visibility: 'private' },
        word_valid: { type: 'boolean', default: null, visibility: 'public' },
      },
    },
    turn_model: { type: 'simultaneous' },
    phases: {
      lobby: {
        type: 'timed',
        duration: 5,
        screen: {
          display: 'template:lobby',
          phone: 'template:lobby',
        },
        on_exit: [{ action: 'advance', to: 'play' }],
      },
      play: {
        type: 'input_gate',
        duration: 45,
        on_enter: [
          { action: 'increment', target: 'globals.round' },
          { action: 'generate_letters', count: 7, target: 'globals.letters' },
        ],
        input: {
          primitive: 'text_submit',
          target: 'per_player.word',
          required: 'all_players',
        },
        screen: {
          display: 'template:waiting',
          phone: 'template:text_input',
        },
        on_complete: [{ action: 'advance', to: 'validate' }],
      },
      validate: {
        type: 'timed',
        duration: 5,
        on_enter: [
          {
            action: 'validate_words',
            source: 'per_player.word',
            target: 'per_player.word_valid',
          },
          {
            action: 'score_round',
            formulas: {
              valid_word: 'word.length * 10',
              longest_word: 50,
            },
          },
        ],
        screen: {
          display: 'template:reveal',
          phone: 'template:reveal',
        },
        on_exit: [
          {
            action: 'conditional',
            condition: 'globals.round < globals.total_rounds',
            then: { advance_to: 'play' },
            else: { advance_to: 'scores' },
          },
        ],
      },
      scores: {
        type: 'timed',
        duration: 10,
        screen: {
          display: 'template:final_results',
          phone: 'template:final_results',
        },
      },
    },
    presentation: {
      theme: {
        colors: {
          primary: '#10b981',
          background: '#0a1810',
          surface: '#132515',
          text: '#f8fafc',
        },
        darkMode: true,
      },
    },
    scoring: {
      valid_word: 10,
      longest_word: 50,
    },
    victory: {
      type: 'highest_score',
      after: 'all_rounds',
    },
    extensions: {
      rules: {
        validate_word: {
          name: 'Dictionary Validator',
          description: 'Validates submitted words against a dictionary',
          module: './server/dictionary.ts',
          function: 'isValidWord',
          input: { word: 'string' },
          output: 'boolean',
        },
      },
    },
  };

  const complexity = calculateComplexity({
    subsystems: {
      phases: [
        { id: 'lobby', type: 'timed', hasTimer: true, transitions: ['play'] },
        { id: 'play', type: 'input_gate', hasTimer: true, transitions: ['validate'] },
        { id: 'validate', type: 'timed', hasTimer: true, transitions: ['play', 'scores'] },
        { id: 'scores', type: 'timed', hasTimer: true, transitions: [] },
      ],
      interactions: [{ type: 'text_submit', phase: 'play', surface: 'phone' }],
      contentSources: [],
      scoreTracks: [{ id: 'score', name: 'Score', direction: 'higher-better' }],
      rules: [],
      extensions: [{ id: 'validate_word', name: 'Dictionary Validator', type: 'rules' }],
      screens: [],
      assets: [],
    },
  });

  return {
    type: 'word',
    name: 'Word Game',
    description: 'Submit words from a set of letters. Dictionary validation via extension.',
    schema,
    suggestedExtensions: ['dictionary-validator'],
    files: [
      {
        path: 'README.md',
        content: [
          '# My Word Game',
          '',
          'A word game built on Boredless V2.',
          '',
          '## Note on Dictionary Validation',
          'This template declares a `validate_word` rule extension. You\'ll need to',
          'implement `server/dictionary.ts` with an `isValidWord(word: string): boolean` export.',
          '',
          '## Phases',
          '- **lobby** — Wait for players',
          '- **play** — Submit a word from the available letters',
          '- **validate** — Validate words and award points',
          '- **scores** — Final results',
        ].join('\n'),
        description: 'Game README',
      },
    ],
    complexity,
  };
}

// ---------------------------------------------------------------------------
// Card template
// ---------------------------------------------------------------------------

function buildCardTemplate(): GameTemplate {
  const schema: Record<string, unknown> = {
    schema_version: '2.0',
    manifest: {
      id: 'my-card-game',
      name: 'My Card Game',
      description: 'A card game skeleton with deck, deal, and play phases.',
      version: '1.0.0',
      author: 'Your Name',
      tags: ['card', 'deck', 'strategy'],
      players: { min: 2, max: 6 },
      estimated_minutes: { min: 15, max: 30 },
    },
    state_model: {
      globals: {
        round: { type: 'integer', default: 0, visibility: 'public' },
        total_rounds: { type: 'integer', default: 5, visibility: 'public' },
      },
      per_player: {
        score: { type: 'integer', default: 0, visibility: 'public' },
        hand: { type: 'array', default: [], visibility: 'private' },
        played_card: { type: 'object', default: null, visibility: 'public' },
      },
    },
    objects: {
      deck: {
        type: 'deck',
        cards: {
          suits: ['hearts', 'diamonds', 'clubs', 'spades'],
          values: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
        },
        shuffle: true,
      },
      player_hand: {
        type: 'hand',
        max_size: 5,
        visibility: 'private',
      },
    },
    turn_model: { type: 'round_robin' },
    phases: {
      lobby: {
        type: 'timed',
        duration: 5,
        screen: {
          display: 'template:lobby',
          phone: 'template:lobby',
        },
        on_exit: [{ action: 'advance', to: 'deal' }],
      },
      deal: {
        type: 'timed',
        duration: 5,
        on_enter: [
          { action: 'shuffle', target: 'objects.deck' },
          { action: 'deal', from: 'objects.deck', to: 'per_player.hand', count: 5 },
        ],
        screen: {
          display: 'template:waiting',
          phone: 'template:card_reveal',
        },
        on_exit: [{ action: 'advance', to: 'play' }],
      },
      play: {
        type: 'input_gate',
        duration: 30,
        on_enter: [{ action: 'increment', target: 'globals.round' }],
        input: {
          primitive: 'choice',
          options: 'per_player.hand',
          target: 'per_player.played_card',
          required: 'active_player',
        },
        screen: {
          display: 'template:waiting',
          phone: 'template:card_hand',
        },
        on_complete: [{ action: 'advance', to: 'resolve' }],
      },
      resolve: {
        type: 'timed',
        duration: 8,
        on_enter: [
          {
            action: 'score_round',
            formulas: {
              highest_card: 50,
              ace_bonus: 25,
            },
          },
        ],
        screen: {
          display: 'template:reveal',
          phone: 'template:reveal',
        },
        on_exit: [
          {
            action: 'conditional',
            condition: 'globals.round < globals.total_rounds',
            then: { advance_to: 'play' },
            else: { advance_to: 'scores' },
          },
        ],
      },
      scores: {
        type: 'timed',
        duration: 10,
        screen: {
          display: 'template:final_results',
          phone: 'template:final_results',
        },
      },
    },
    presentation: {
      theme: {
        colors: {
          primary: '#14b8a6',
          background: '#080f0e',
          surface: '#0f1c1a',
          text: '#f8fafc',
        },
        darkMode: true,
      },
    },
    scoring: {
      highest_card: 50,
      ace_bonus: 25,
    },
    victory: {
      type: 'highest_score',
      after: 'all_rounds',
    },
  };

  const complexity = calculateComplexity({
    subsystems: {
      phases: [
        { id: 'lobby', type: 'timed', hasTimer: true, transitions: ['deal'] },
        { id: 'deal', type: 'timed', hasTimer: true, transitions: ['play'] },
        { id: 'play', type: 'input_gate', hasTimer: true, transitions: ['resolve'] },
        { id: 'resolve', type: 'timed', hasTimer: true, transitions: ['play', 'scores'] },
        { id: 'scores', type: 'timed', hasTimer: true, transitions: [] },
      ],
      interactions: [{ type: 'choice', phase: 'play', surface: 'phone' }],
      contentSources: [],
      scoreTracks: [{ id: 'score', name: 'Score', direction: 'higher-better' }],
      rules: [],
      extensions: [],
      screens: [],
      assets: [],
    },
  });

  return {
    type: 'card',
    name: 'Card Game',
    description: 'Card game skeleton: deck, deal, play, resolve. Choice interaction for card selection.',
    schema,
    files: [
      {
        path: 'README.md',
        content: [
          '# My Card Game',
          '',
          'A card game skeleton built on Boredless V2.',
          '',
          '## Phases',
          '- **lobby** — Wait for players',
          '- **deal** — Shuffle deck and deal 5 cards per player',
          '- **play** — Active player picks a card from their hand',
          '- **resolve** — Award points based on cards played',
          '- **scores** — Final results',
          '',
          '## Customizing',
          '- Modify the `objects.deck` to change card suits/values',
          '- Add game-specific scoring in the `resolve` phase',
          '- Add rule extensions for complex card evaluation (poker hands, etc.)',
        ].join('\n'),
        description: 'Game README',
      },
    ],
    complexity,
  };
}

// ---------------------------------------------------------------------------
// Board template
// ---------------------------------------------------------------------------

function buildBoardTemplate(): GameTemplate {
  const schema: Record<string, unknown> = {
    schema_version: '2.0',
    manifest: {
      id: 'my-board-game',
      name: 'My Board Game',
      description: 'A grid-based board game skeleton.',
      version: '1.0.0',
      author: 'Your Name',
      tags: ['board', 'grid', 'strategy'],
      players: { min: 2, max: 4 },
      estimated_minutes: { min: 15, max: 45 },
    },
    state_model: {
      globals: {
        turn: { type: 'integer', default: 0, visibility: 'public' },
        max_turns: { type: 'integer', default: 20, visibility: 'public' },
      },
      per_player: {
        score: { type: 'integer', default: 0, visibility: 'public' },
        move: { type: 'object', default: null, visibility: 'private' },
        pieces: { type: 'array', default: [], visibility: 'public' },
      },
    },
    objects: {
      board: {
        type: 'board',
        width: 8,
        height: 8,
        cell_types: ['empty', 'blocked', 'player_1', 'player_2', 'player_3', 'player_4'],
      },
    },
    turn_model: { type: 'round_robin' },
    phases: {
      lobby: {
        type: 'timed',
        duration: 5,
        screen: {
          display: 'template:lobby',
          phone: 'template:lobby',
        },
        on_exit: [{ action: 'advance', to: 'setup' }],
      },
      setup: {
        type: 'timed',
        duration: 3,
        on_enter: [
          { action: 'initialize_board', target: 'objects.board' },
          { action: 'place_pieces', target: 'per_player.pieces' },
        ],
        screen: {
          display: 'template:board',
          phone: 'template:board',
        },
        on_exit: [{ action: 'advance', to: 'play' }],
      },
      play: {
        type: 'input_gate',
        duration: 60,
        on_enter: [{ action: 'increment', target: 'globals.turn' }],
        input: {
          primitive: 'choice',
          options: 'valid_moves',
          target: 'per_player.move',
          required: 'active_player',
        },
        screen: {
          display: 'template:board',
          phone: 'template:choice',
        },
        on_complete: [{ action: 'advance', to: 'resolve' }],
      },
      resolve: {
        type: 'timed',
        duration: 3,
        on_enter: [
          { action: 'apply_move', source: 'per_player.move', target: 'objects.board' },
          {
            action: 'score_round',
            formulas: { move_bonus: 10, capture_bonus: 25 },
          },
        ],
        screen: {
          display: 'template:board',
          phone: 'template:board',
        },
        on_exit: [
          {
            action: 'conditional',
            condition: 'globals.turn < globals.max_turns',
            then: { advance_to: 'play' },
            else: { advance_to: 'scores' },
          },
        ],
      },
      scores: {
        type: 'timed',
        duration: 10,
        screen: {
          display: 'template:final_results',
          phone: 'template:final_results',
        },
      },
    },
    presentation: {
      theme: {
        colors: {
          primary: '#8b5cf6',
          background: '#0a080f',
          surface: '#12101a',
          text: '#f8fafc',
        },
        darkMode: true,
      },
    },
    scoring: {
      move_bonus: 10,
      capture_bonus: 25,
    },
    victory: {
      type: 'highest_score',
      after: 'all_rounds',
    },
    extensions: {
      renderers: {
        board_renderer: {
          name: 'Board Renderer',
          display: './display/BoardDisplay.tsx',
          phone: './phone/BoardPhone.tsx',
          props_schema: {
            board: 'board_ref',
            valid_moves: 'array',
          },
        },
      },
    },
  };

  const complexity = calculateComplexity({
    subsystems: {
      phases: [
        { id: 'lobby', type: 'timed', hasTimer: true, transitions: ['setup'] },
        { id: 'setup', type: 'timed', hasTimer: true, transitions: ['play'] },
        { id: 'play', type: 'input_gate', hasTimer: true, transitions: ['resolve'] },
        { id: 'resolve', type: 'timed', hasTimer: true, transitions: ['play', 'scores'] },
        { id: 'scores', type: 'timed', hasTimer: true, transitions: [] },
      ],
      interactions: [{ type: 'choice', phase: 'play', surface: 'phone' }],
      contentSources: [],
      scoreTracks: [{ id: 'score', name: 'Score', direction: 'higher-better' }],
      rules: [],
      extensions: [{ id: 'board_renderer', name: 'Board Renderer', type: 'renderers' }],
      screens: [],
      assets: [],
    },
  });

  return {
    type: 'board',
    name: 'Board Game',
    description: 'Grid-based board game skeleton with custom board renderer.',
    schema,
    suggestedExtensions: ['board-renderer', 'move-validator'],
    files: [
      {
        path: 'README.md',
        content: [
          '# My Board Game',
          '',
          'A board game skeleton built on Boredless V2.',
          '',
          '## Note on Board Rendering',
          'This template declares a `board_renderer` extension. You\'ll need to',
          'implement `display/BoardDisplay.tsx` and `phone/BoardPhone.tsx` to',
          'render the board grid.',
          '',
          '## Phases',
          '- **lobby** — Wait for players',
          '- **setup** — Initialize board and place pieces',
          '- **play** — Active player selects a move',
          '- **resolve** — Apply move to board and award points',
          '- **scores** — Final results',
        ].join('\n'),
        description: 'Game README',
      },
    ],
    complexity,
  };
}
