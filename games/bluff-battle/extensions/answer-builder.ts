/**
 * answer-builder.ts — Bluffalo extension: build and shuffle the answer list.
 *
 * Called via the bluffalo_build_answers action on phase_enter for the
 * voting phase. Combines all player submissions with the correct answer,
 * shuffles them, assigns IDs, and produces the answer list for voting.
 *
 * KEY: Players cannot vote for their own fake answer. The answer list
 * includes submittedByPlayerId so the client can filter it.
 *
 * Part of the bluffalo-core extension package.
 */

/** A single answer in the voting list. */
export interface BluffaloAnswer {
  /** Unique ID for this answer (used when voting). */
  answerId: string;
  /** The answer text shown to players. */
  text: string;
  /** The player who submitted this fake (null = correct answer). */
  submittedByPlayerId: string | null;
  /** Whether this is the correct answer (revealed after voting). */
  isCorrect: boolean;
}

/** Serializable form of the answer list stored in globals.answers_json. */
export interface BluffaloAnswersState {
  answers: BluffaloAnswer[];
}

/** Context passed to buildAnswers from the extension runner. */
export interface BuildAnswersContext {
  /** Map of playerId → submission text. */
  submissions: Record<string, string>;
  /** The correct answer text (from private state). */
  correctAnswer: string;
  /** nanoid-compatible ID generator. */
  generateId: () => string;
}

/**
 * Combine player submissions with the correct answer, shuffle, and assign IDs.
 *
 * @param ctx - Context with submissions and correct answer
 * @returns Shuffled BluffaloAnswer array
 */
export function buildAnswers(ctx: BuildAnswersContext): BluffaloAnswer[] {
  const answers: BluffaloAnswer[] = [];

  // Add each player's fake answer
  for (const [playerId, text] of Object.entries(ctx.submissions)) {
    if (text.trim()) {
      answers.push({
        answerId: ctx.generateId(),
        text: text.trim(),
        submittedByPlayerId: playerId,
        isCorrect: false,
      });
    }
  }

  // Add the correct answer
  answers.push({
    answerId: ctx.generateId(),
    text: ctx.correctAnswer,
    submittedByPlayerId: null,
    isCorrect: true,
  });

  // Fisher-Yates shuffle
  for (let i = answers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = answers[i];
    const other = answers[j];
    if (temp && other) {
      answers[i] = other;
      answers[j] = temp;
    }
  }

  return answers;
}
