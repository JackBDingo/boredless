import { describe, it, expect } from 'vitest';
import { calculateBBScores, type BBAnswer, type BBVote } from './scoring.js';

describe('calculateBBScores', () => {
  const correctAnswer: BBAnswer = {
    answerId: 'correct',
    text: 'Vatican City',
    submittedByPlayerId: null,
    isCorrect: true,
  };

  const fakeByAlice: BBAnswer = {
    answerId: 'fake-alice',
    text: 'Monaco',
    submittedByPlayerId: 'alice',
    isCorrect: false,
  };

  const fakeByBob: BBAnswer = {
    answerId: 'fake-bob',
    text: 'Luxembourg',
    submittedByPlayerId: 'bob',
    isCorrect: false,
  };

  it('awards 1000 points for voting correct answer', () => {
    const answers = [correctAnswer, fakeByAlice, fakeByBob];
    const votes: BBVote[] = [
      { voterId: 'alice', answerId: 'correct' },
      { voterId: 'bob', answerId: 'correct' },
    ];

    const result = calculateBBScores(answers, votes);
    expect(result.roundPoints.get('alice')).toBe(1000);
    expect(result.roundPoints.get('bob')).toBe(1000);
  });

  it('awards 500 points per player fooled by your fake', () => {
    const answers = [correctAnswer, fakeByAlice, fakeByBob];
    const votes: BBVote[] = [
      { voterId: 'bob', answerId: 'fake-alice' },    // Bob fooled by Alice
      { voterId: 'charlie', answerId: 'fake-alice' }, // Charlie fooled by Alice
    ];

    const result = calculateBBScores(answers, votes);
    expect(result.roundPoints.get('alice')).toBe(1000); // 2 players × 500
    expect(result.roundPoints.get('bob')).toBeUndefined(); // Got nothing
  });

  it('awards both correct vote AND fool points', () => {
    const fakeByCharlie: BBAnswer = {
      answerId: 'fake-charlie',
      text: 'Nauru',
      submittedByPlayerId: 'charlie',
      isCorrect: false,
    };

    const answers = [correctAnswer, fakeByAlice, fakeByBob, fakeByCharlie];
    const votes: BBVote[] = [
      { voterId: 'alice', answerId: 'correct' },        // Alice gets 1000 for correct
      { voterId: 'bob', answerId: 'fake-alice' },       // Alice gets 500 for fooling Bob
      { voterId: 'charlie', answerId: 'fake-alice' },   // Alice gets 500 for fooling Charlie
    ];

    const result = calculateBBScores(answers, votes);
    // Alice: 1000 (correct vote) + 1000 (fooled 2 players)
    expect(result.roundPoints.get('alice')).toBe(2000);
  });

  it('handles no votes gracefully', () => {
    const answers = [correctAnswer, fakeByAlice];
    const votes: BBVote[] = [];

    const result = calculateBBScores(answers, votes);
    expect(result.roundPoints.size).toBe(0);
  });

  it('returns correct answerResults structure', () => {
    const answers = [correctAnswer, fakeByAlice];
    const votes: BBVote[] = [
      { voterId: 'bob', answerId: 'fake-alice' },
    ];

    const result = calculateBBScores(answers, votes);
    expect(result.answerResults).toHaveLength(2);

    const correctResult = result.answerResults.find(r => r.isCorrect);
    expect(correctResult?.voterIds).toEqual([]);

    const fakeResult = result.answerResults.find(r => !r.isCorrect);
    expect(fakeResult?.voterIds).toEqual(['bob']);
    expect(fakeResult?.submittedByPlayerId).toBe('alice');
  });
});
