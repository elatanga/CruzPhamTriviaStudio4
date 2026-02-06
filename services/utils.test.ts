
import { describe, it, expect } from 'vitest';
import { 
  applyAiCategoryPreservePoints, 
  getCategoryTitleFontSize, 
  getPlayerNameFontSize, 
  getTileScaleFactor 
} from './utils';
import { Category, Question } from '../types';

describe('applyAiCategoryPreservePoints', () => {
  const existingCategory: Category = {
    id: 'cat-123',
    title: 'Science',
    questions: [
      { id: 'q-0', points: 150, text: 'Old Q1', answer: 'Old A1', isAnswered: true, isRevealed: true },
      { id: 'q-1', points: 300, text: 'Old Q2', answer: 'Old A2', isAnswered: false, isRevealed: false }
    ]
  };

  const aiQuestions: Question[] = [
    { id: 'ai-id-0', points: 0, text: 'AI Q1', answer: 'AI A1', isAnswered: false, isRevealed: false },
    { id: 'ai-id-1', points: 0, text: 'AI Q2', answer: 'AI A2', isAnswered: false, isRevealed: false }
  ];

  it('A) preserves existing IDs and points while updating content', () => {
    const result = applyAiCategoryPreservePoints(existingCategory, aiQuestions);
    
    expect(result.questions[0].id).toBe('q-0');
    expect(result.questions[0].points).toBe(150); // Preserved custom point value
    expect(result.questions[0].text).toBe('AI Q1');
    expect(result.questions[0].answer).toBe('AI A1');
  });

  it('B) preserves answered/revealed status of existing tiles during rewrite', () => {
    const result = applyAiCategoryPreservePoints(existingCategory, aiQuestions);
    expect(result.questions[0].isAnswered).toBe(true);
    expect(result.questions[0].isRevealed).toBe(true);
  });
});

describe('Visual Scale Mapping Audit', () => {
  it('Category Title: provides significant difference (10px to 24px)', () => {
    expect(getCategoryTitleFontSize('XS')).toBe(10);
    expect(getCategoryTitleFontSize('M')).toBe(16);
    expect(getCategoryTitleFontSize('XL')).toBe(24);
  });

  it('Player Name: caps at 22px even at XL scale', () => {
    expect(getPlayerNameFontSize('XS')).toBe(10);
    expect(getPlayerNameFontSize('XL')).toBe(22); // Clamped from 24
  });

  it('Tile Factor: provides >2x area difference between XS and XL', () => {
    const xs = getTileScaleFactor('XS');
    const xl = getTileScaleFactor('XL');
    expect(xs).toBe(0.65);
    expect(xl).toBe(1.5);
    expect(xl).toBeGreaterThan(xs * 2);
  });
});
