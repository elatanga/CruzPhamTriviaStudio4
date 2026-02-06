
import { Category, Question, SizeScale } from "../types";

/**
 * Normalizes player names to a consistent format.
 */
export const normalizePlayerName = (name: string): string => {
  if (!name) return "";
  return name.trim().replace(/\s+/g, " ").toUpperCase();
};

/**
 * Pure helper to apply AI questions to an existing category skeleton.
 * BUG FIX #1: This function explicitly ignores AI-generated points and IDs,
 * ensuring manual producer overrides are preserved.
 */
export const applyAiCategoryPreservePoints = (existingCategory: Category, aiQuestions: Question[]): Category => {
  return {
    ...existingCategory,
    questions: existingCategory.questions.map((q, i) => {
      const aiQ = aiQuestions[i];
      if (!aiQ) return q;
      return {
        ...q,
        text: aiQ.text,
        answer: aiQ.answer
      };
    })
  };
};

/**
 * Central Mapping: Converts abstract scales to production pixel/scale values.
 * Used to drive GameBoard and Scoreboard CSS variables independently.
 */
export const getScaleMap = (scale: SizeScale) => {
  const maps = {
    XS: { px: 10, factor: 0.65 },
    S:  { px: 13, factor: 0.82 },
    M:  { px: 16, factor: 1.0 }, // Production Baseline
    L:  { px: 20, factor: 1.22 },
    XL: { px: 24, factor: 1.5 }
  };
  return maps[scale] || maps.M;
};

export const getCategoryTitleFontSize = (scale: SizeScale): number => getScaleMap(scale).px;

export const getPlayerNameFontSize = (scale: SizeScale): number => {
  // Player names cap at 22px to prevent scoreboard overflow even at XL scale
  return Math.min(getScaleMap(scale).px, 22);
};

export const getTileScaleFactor = (scale: SizeScale): number => getScaleMap(scale).factor;
