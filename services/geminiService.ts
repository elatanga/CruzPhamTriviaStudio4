import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Category, Question, Difficulty, AppError } from "../types";
import { logger } from "./logger";

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

const getSchema = (numCats: number, numQs: number): Schema => {
  return {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        categoryName: { type: Type.STRING },
        questions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              questionText: { type: Type.STRING },
              answer: { type: Type.STRING },
            },
            required: ["questionText", "answer"]
          }
        }
      },
      required: ["categoryName", "questions"]
    }
  };
};

// Retry Wrapper
async function withRetry<T>(operation: () => Promise<T>, retries = 2): Promise<T> {
  if (!navigator.onLine) {
    throw new AppError('ERR_NETWORK', 'Device is offline. Cannot generate content.', logger.getCorrelationId());
  }

  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      logger.warn(`AI Operation failed (attempt ${i + 1}/${retries + 1})`, err);
      // If 4xx (client error), do not retry unless it's 429 (rate limit)
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw new AppError('ERR_FORBIDDEN', 'AI Request Rejected: ' + (err.message || 'Client Error'), logger.getCorrelationId());
      }
      // Wait before retry (Exponential backoff)
      if (i < retries) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  
  throw new AppError('ERR_AI_GENERATION', 'AI Service unavailable after retries. ' + (lastError?.message || ''), logger.getCorrelationId());
}

export const generateTriviaGame = async (
  topic: string, 
  difficulty: Difficulty,
  numCategories: number = 4,
  numQuestions: number = 5
): Promise<Category[]> => {
  logger.info(`Generating trivia: ${topic} (${numCategories}x${numQuestions}, ${difficulty})`);

  if (!process.env.API_KEY) throw new AppError('ERR_FORBIDDEN', "Missing API Key", logger.getCorrelationId());
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a trivia game board about "${topic}". 
        Difficulty: ${difficulty}.
        Create exactly ${numCategories} distinct categories. 
        For each category, create exactly ${numQuestions} questions.
        The questions should increase in difficulty from 1 to ${numQuestions}.
        Ensure facts are accurate.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: getSchema(numCategories, numQuestions)
        }
      });

      const rawData = JSON.parse(response.text || "[]");
      
      // Map to domain
      const categories: Category[] = rawData.map((cat: any, cIdx: number) => ({
        id: generateId(),
        title: cat.categoryName,
        questions: (cat.questions || []).map((q: any, qIdx: number) => ({
          id: generateId(),
          text: q.questionText,
          points: (qIdx + 1) * 100, // Auto-generate points
          answer: q.answer,
          isRevealed: false,
          isAnswered: false,
        }))
      }));

      // Robustness: Fill gaps
      while (categories.length < numCategories) {
        categories.push({ id: generateId(), title: `Category ${categories.length+1}`, questions: [] });
      }
      categories.forEach(cat => {
        while (cat.questions.length < numQuestions) {
          const nextPoints = (cat.questions.length + 1) * 100;
          cat.questions.push({
            id: generateId(),
            text: "Placeholder Question",
            answer: "Placeholder Answer",
            points: nextPoints,
            isRevealed: false,
            isAnswered: false
          });
        }
      });

      return categories;

    } catch (error: any) {
      throw error; // Let wrapper handle parsing
    }
  });
};

export const generateSingleQuestion = async (
  topic: string, 
  points: number, 
  categoryContext: string,
  difficulty: Difficulty = 'mixed'
): Promise<{text: string, answer: string}> => {
  if (!process.env.API_KEY) throw new AppError('ERR_FORBIDDEN', "Missing API Key", logger.getCorrelationId());
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Write a single trivia question and answer.
      Topic: ${topic}
      Category: ${categoryContext}
      Difficulty Level: ${difficulty} (Points: ${points}).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            answer: { type: Type.STRING }
          }
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return { text: data.question || "Error", answer: data.answer || "Error" };
  });
};

export const generateCategoryQuestions = async (
  topic: string,
  categoryTitle: string,
  count: number,
  difficulty: Difficulty
): Promise<Question[]> => {
  if (!process.env.API_KEY) throw new AppError('ERR_FORBIDDEN', "Missing API Key", logger.getCorrelationId());
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate ${count} trivia questions for the category "${categoryTitle}" within the topic "${topic}".
      Difficulty: ${difficulty}.
      Questions should range from easy to hard.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING }
            }
          }
        }
      }
    });

    const data = JSON.parse(response.text || "[]");
    return data.map((item: any, idx: number) => ({
      id: generateId(),
      text: item.question,
      answer: item.answer,
      points: (idx + 1) * 100,
      isRevealed: false,
      isAnswered: false
    }));
  });
};