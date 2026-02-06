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
 * Pure function to restore a specific tile to an active, unplayed state.
 * Minimal, explicit state changes: content is strictly preserved.
 */
export const restoreTile = (categories: Category[], cIdx: number, qIdx: number): Category[] => {
  const cat = categories[cIdx];
  if (!cat || !cat.questions[qIdx]) return categories;
  
  const q = cat.questions[qIdx];
  // Idempotency: skip if already active
  if (!q.isAnswered && !q.isVoided && !q.isRevealed) return categories;

  const nextCategories = [...categories];
  const nextQs = [...nextCategories[cIdx].questions];
  
  nextQs[qIdx] = { 
    ...q, 
    isAnswered: false, 
    isRevealed: false, 
    isVoided: false 
  };
  
  nextCategories[cIdx] = { ...nextCategories[cIdx], questions: nextQs };
  return nextCategories;
};

/**
 * Resets all tiles on the board to an active state.
 * Performance optimized: avoids cloning categories or questions that are already active.
 */
export const restoreAllTiles = (categories: Category[]): { nextCategories: Category[], restoredCount: number } => {
  let totalRestored = 0;
  
  const nextCategories = categories.map(cat => {
    let catHasChanges = false;
    const nextQs = cat.questions.map(q => {
      if (q.isAnswered || q.isVoided || q.isRevealed) {
        totalRestored++;
        catHasChanges = true;
        return { ...q, isAnswered: false, isRevealed: false, isVoided: false };
      }
      return q;
    });
    
    return catHasChanges ? { ...cat, questions: nextQs } : cat;
  });

  // Return original reference if no changes to prevent unnecessary re-renders
  return {
    nextCategories: totalRestored > 0 ? nextCategories : categories,
    restoredCount: totalRestored
  };
};

/**
 * Re-scales points across the board while keeping question content unchanged.
 * Deterministic: points = (row index + 1) * newScale
 */
export const rescalePoints = (categories: Category[], newScale: number): Category[] => {
  return categories.map(cat => ({
    ...cat,
    questions: cat.questions.map((q, qIdx) => ({ 
      ...q, 
      points: (qIdx + 1) * newScale 
    }))
  }));
};

/**
 * Central Mapping: Converts abstract scales to production pixel/scale values.
 */
export const getScaleMap = (scale: SizeScale) => {
  const maps = {
    XS: { px: 10, factor: 0.65 },
    S:  { px: 13, factor: 0.82 },
    M:  { px: 16, factor: 1.0 },
    L:  { px: 20, factor: 1.22 },
    XL: { px: 24, factor: 1.5 }
  };
  return maps[scale] || maps.M;
};

export const getCategoryTitleFontSize = (scale: SizeScale): number => getScaleMap(scale).px;
export const getPlayerNameFontSize = (scale: SizeScale): number => Math.min(getScaleMap(scale).px, 22);
export const getTileScaleFactor = (scale: SizeScale): number => getScaleMap(scale).factor;