import { describe, it, expect } from 'vitest';
import { 
  restoreTile, 
  restoreAllTiles, 
  rescalePoints,
  applyAiCategoryPreservePoints 
} from './utils';
import { Category, Question } from '../types';

const createMockQuestions = (): Question[] => [
  { id: 'q1', text: 'Q1', answer: 'A1', points: 100, isAnswered: true, isRevealed: true, isVoided: false },
  { id: 'q2', text: 'Q2', answer: 'A2', points: 200, isAnswered: false, isRevealed: false, isVoided: true }
];

const mockCategories: Category[] = [{
  id: 'c1',
  title: 'TEST',
  questions: createMockQuestions()
}];

describe('Director Logic Utils', () => {
  
  it('restoreTile: resets status flags but preserves content', () => {
    const next = restoreTile(mockCategories, 0, 0);
    const q = next[0].questions[0];
    
    expect(q.isAnswered).toBe(false);
    expect(q.isRevealed).toBe(false);
    expect(q.isVoided).toBe(false);
    
    // Content Preservation
    expect(q.id).toBe('q1');
    expect(q.text).toBe('Q1');
    expect(q.points).toBe(100);
  });

  it('restoreTile: is idempotent for active tiles', () => {
    const activeState: Category[] = [{
      id: 'c1', title: 'T', 
      questions: [{ ...createMockQuestions()[0], isAnswered: false, isRevealed: false, isVoided: false }]
    }];
    const next = restoreTile(activeState, 0, 0);
    expect(next).toBe(activeState); // Reference equality for pure performance
  });

  it('restoreAllTiles: resets entire board state and returns count', () => {
    const { nextCategories, restoredCount } = restoreAllTiles(mockCategories);
    expect(restoredCount).toBe(2);
    expect(nextCategories[0].questions.every(q => !q.isAnswered && !q.isVoided && !q.isRevealed)).toBe(true);
  });

  it('restoreAllTiles: is optimized and returns original reference if no work needed', () => {
    const cleanCategories: Category[] = [{
      id: 'c1', title: 'CLEAN',
      questions: [{ id: 'q1', text: 'Q', answer: 'A', points: 100, isAnswered: false, isRevealed: false, isVoided: false }]
    }];
    const { nextCategories, restoredCount } = restoreAllTiles(cleanCategories);
    expect(restoredCount).toBe(0);
    expect(nextCategories).toBe(cleanCategories); // Pure optimization check
  });

  it('rescalePoints: re-calculates points based on row index and scale', () => {
    const next = rescalePoints(mockCategories, 50);
    expect(next[0].questions[0].points).toBe(50);  // (0+1) * 50
    expect(next[0].questions[1].points).toBe(100); // (1+1) * 50
    
    // Integrity check
    expect(next[0].questions[0].text).toBe('Q1');
    expect(next[0].questions[0].isAnswered).toBe(true);
    expect(next[0].questions[1].isVoided).toBe(true);
  });
});