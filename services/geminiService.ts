
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Category, Question, Difficulty, AppError } from "../types";
import { logger } from "./logger";

// Access runtime config
const runtimeConfig = (typeof window !== 'undefined' ? (window as any).__RUNTIME_CONFIG__ : {}) as any;
// Prefer runtime config, fallback to process.env (for local dev/tests if script fails)
const apiKey = runtimeConfig?.API_KEY || process.env.API_KEY;

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
      logger.warn('AI', `AI Operation failed (attempt ${i + 1}/${retries + 1})`, err);
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
  numQuestions: number = 5,
  pointScale: number = 100
): Promise<Category[]> => {
  logger.info('AI', `Generating trivia: ${topic} (${numCategories}x${numQuestions}, ${difficulty}, scale=${pointScale})`);

  if (!apiKey) throw new AppError('ERR_FORBIDDEN', "Missing API Key", logger.getCorrelationId());
  const ai = new GoogleGenAI({ apiKey: apiKey });

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
      const categories: Category[] = rawData.map((cat: any, cIdx: number) => {
        const questions: Question[] = (cat.questions || []).map((q: any, qIdx: number) => ({
          id: generateId(),
          text: q.questionText,
          points: (qIdx + 1) * pointScale, // Use point scale
          answer: q.answer,
          isRevealed: false,
          isAnswered: false,
          isDoubleOrNothing: false // Default, set below
        }));
        
        // Robustness: Fill gaps
        while (questions.length < numQuestions) {
          const nextPoints = (questions.length + 1) * pointScale;
          questions.push({
            id: generateId(),
            text: "Placeholder Question",
            answer: "Placeholder Answer",
            points: nextPoints,
            isRevealed: false,
            isAnswered: false,
            isDoubleOrNothing: false
          });
        }

        // Assign exactly ONE Double Or Nothing per category
        const luckyIndex = Math.floor(Math.random() * questions.length);
        questions[luckyIndex].isDoubleOrNothing = true;

        return {
          id: generateId(),
          title: cat.categoryName,
          questions
        };
      });

      // Robustness: Fill missing categories
      while (categories.length < numCategories) {
        const qs = [];
        for(let i=0; i<numQuestions; i++) {
           qs.push({
            id: generateId(),
            text: "Placeholder Question",
            answer: "Placeholder Answer",
            points: (i+1)*pointScale,
            isRevealed: false,
            isAnswered: false,
            isDoubleOrNothing: false
          });
        }
        const lucky = Math.floor(Math.random() * qs.length);
        qs[lucky].isDoubleOrNothing = true;
        categories.push({ id: generateId(), title: `Category ${categories.length+1}`, questions: qs });
      }

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
  if (!apiKey) throw new AppError('ERR_FORBIDDEN', "Missing API Key", logger.getCorrelationId());
  const ai = new GoogleGenAI({ apiKey: apiKey });
  
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
  difficulty: Difficulty,
  pointScale: number = 100
): Promise<Question[]> => {
  if (!apiKey) throw new AppError('ERR_FORBIDDEN', "Missing API Key", logger.getCorrelationId());
  const ai = new GoogleGenAI({ apiKey: apiKey });

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
    const questions: Question[] = data.map((item: any, idx: number) => ({
      id: generateId(),
      text: item.question,
      answer: item.answer,
      points: (idx + 1) * pointScale,
      isRevealed: false,
      isAnswered: false,
      isDoubleOrNothing: false
    }));

    // Ensure one Double Or Nothing
    if (questions.length > 0) {
      const lucky = Math.floor(Math.random() * questions.length);
      questions[lucky].isDoubleOrNothing = true;
    }

    return questions;
  });
};