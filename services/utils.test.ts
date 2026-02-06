
import { describe, it, expect } from 'vitest';
import { applyAiCategoryPreservePoints } from './utils';
import { Category, Question } from '../types';

describe('applyAiCategoryPreservePoints', () => {
  const existingCategory: Category = {
    id: 'cat-123',
    title: 'Science',
    questions: [
      { id: 'q-0', points: 100, text: 'Old Q1', answer: 'Old A1', isAnswered: true, isRevealed: true },
      { id: 'q-1', points: 200, text: 'Old Q2', answer: 'Old A2', isAnswered: false, isRevealed: false }
    ]
  };

  const aiQuestions: Question[] = [
    { id: 'new-id-0', points: 0, text: 'AI Q1', answer: 'AI A1', isAnswered: false, isRevealed: false },
    { id: 'new-id-1', points: 0, text: 'AI Q2', answer: 'AI A2', isAnswered: false, isRevealed: false }
  ];

  it('A) preserves existing IDs and points while updating content', () => {
    const result = applyAiCategoryPreservePoints(existingCategory, aiQuestions);
    
    expect(result.questions[0].id).toBe('q-0');
    expect(result.questions[0].points).toBe(100);
    expect(result.questions[0].text).toBe('AI Q1');
    expect(result.questions[0].answer).toBe('AI A1');
    
    expect(result.questions[1].id).toBe('q-1');
    expect(result.questions[1].points).toBe(200);
  });

  it('B) preserves answered/revealed status of existing tiles', () => {
    const result = applyAiCategoryPreservePoints(existingCategory, aiQuestions);
    
    expect(result.questions[0].isAnswered).toBe(true);
    expect(result.questions[0].isRevealed).toBe(true);
  });

  it('C) gracefully handles AI returning fewer questions than existing', () => {
    const shortAiQs = [aiQuestions[0]];
    const result = applyAiCategoryPreservePoints(existingCategory, shortAiQs);
    
    expect(result.questions.length).toBe(2);
    expect(result.questions[0].text).toBe('AI Q1');
    expect(result.questions[1].text).toBe('Old Q2'); // Kept original
  });
});
