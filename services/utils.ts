
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
