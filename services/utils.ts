
import { Category, Question } from "../types";

/**
 * Normalizes player names to a consistent format:
 * - Trim leading/trailing whitespace
 * - Collapse multiple spaces into one
 * - Force to UPPERCASE
 */
export const normalizePlayerName = (name: string): string => {
  if (!name) return "";
  return name.trim().replace(/\s+/g, " ").toUpperCase();
};

/**
 * Pure helper to apply AI questions to an existing category skeleton.
 * Fixes Bug #1: Preserves IDs and Points by row index.
 */
export const applyAiCategoryPreservePoints = (existingCategory: Category, aiQuestions: Question[]): Category => {
  return {
    ...existingCategory,
    questions: existingCategory.questions.map((q, i) => {
      const aiQ = aiQuestions[i];
      // Fallback: If AI fails to return enough questions, keep original for that row
      if (!aiQ) return q;
      
      return {
        ...q, // Preserve existing ID, points, isRevealed, isAnswered, isDoubleOrNothing
        text: aiQ.text,
        answer: aiQ.answer
      };
    })
  };
};
