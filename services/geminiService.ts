
import { GoogleGenAI, Type } from "@google/genai";
import { Category, Question, Difficulty, AppError } from "../types";
import { logger } from "./logger";

// Helper to generate IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * Robustly extracts JSON from potentially messy AI responses.
 * Handles markdown blocks and leading/trailing text.
 */
const extractAndParseJson = (text: string, generationId: string) => {
  logger.info("aiGen_parseStart", { generationId, textLength: text.length });
  try {
    let clean = text.trim();
    // Remove markdown code blocks if present
    const jsonMatch = clean.match(/```json\s?([\s\S]*?)\s?```/) || clean.match(/```\s?([\s\S]*?)\s?```/);
    if (jsonMatch) {
      clean = jsonMatch[1].trim();
    } else {
      // Find the first occurrence of { or [ and last of } or ]
      const firstBrace = clean.indexOf('{');
      const firstBracket = clean.indexOf('[');
      const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
      
      const lastBrace = clean.lastIndexOf('}');
      const lastBracket = clean.lastIndexOf(']');
      const end = (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) ? lastBrace : lastBracket;

      if (start !== -1 && end !== -1 && end > start) {
        clean = clean.substring(start, end + 1);
      }
    }

    const data = JSON.parse(clean);
    logger.info("aiGen_parseSuccess", { generationId });
    return data;
  } catch (e: any) {
    logger.error("aiGen_parseError", { generationId, message: e.message, snippet: text.substring(0, 100) });
    throw new Error(`AI returned invalid format: ${e.message}`);
  }
};

// Fix: Removed explicit Schema return type and import to align with coding guidelines and avoid potential export issues.
const getSchema = (numCats: number, numQs: number) => {
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
async function withRetry<T>(operation: (attempt: number) => Promise<T>, retries = 2): Promise<T> {
  if (!navigator.onLine) {
    throw new AppError('ERR_NETWORK', 'Device is offline. Cannot generate content.', logger.getCorrelationId());
  }

  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      return await operation(i);
    } catch (err: any) {
      lastError = err;
      logger.warn(`AI Operation failed (attempt ${i + 1}/${retries + 1})`, { message: err.message });
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw new AppError('ERR_FORBIDDEN', 'AI Request Rejected: ' + (err.message || 'Client Error'), logger.getCorrelationId());
      }
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
  pointScale: number = 100,
  generationId: string = "unknown"
): Promise<Category[]> => {
  logger.info("aiGen_start", { generationId, mode: 'full_board', topic, rows: numQuestions, cols: numCategories, difficulty });

  if (!process.env.API_KEY) throw new AppError('ERR_FORBIDDEN', "Missing API Key", logger.getCorrelationId());
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  return withRetry(async (attempt) => {
    const prompt = `Generate a trivia game board about "${topic}". 
      Difficulty: ${difficulty}.
      Create exactly ${numCategories} distinct categories. 
      For each category, create exactly ${numQuestions} questions.
      The questions should increase in difficulty from 1 to ${numQuestions}.
      Ensure facts are accurate.
      ${attempt > 0 ? "IMPORTANT: RETURN VALID JSON ONLY." : ""}`;
    
    logger.info("aiGen_promptBuilt", { generationId, promptSize: prompt.length, attempt });
    logger.info("aiGen_requestSent", { generationId });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: getSchema(numCategories, numQuestions)
      }
    });

    const text = response.text || "";
    logger.info("aiGen_responseReceived", { generationId, bytes: text.length });
    
    const rawData = extractAndParseJson(text, generationId);
    
    // Map to domain
    const categories: Category[] = (Array.isArray(rawData) ? rawData : []).map((cat: any) => {
      const questions: Question[] = (cat.questions || []).map((q: any, qIdx: number) => ({
        id: generateId(),
        text: q.questionText || "Missing Question",
        points: (qIdx + 1) * pointScale,
        answer: q.answer || "Missing Answer",
        isRevealed: false,
        isAnswered: false,
        isDoubleOrNothing: false
      }));
      
      // Fill gaps if AI under-generated
      while (questions.length < numQuestions) {
        questions.push({
          id: generateId(), text: "Placeholder Question", answer: "Placeholder Answer",
          points: (questions.length + 1) * pointScale, isRevealed: false, isAnswered: false, isDoubleOrNothing: false
        });
      }

      const luckyIndex = Math.floor(Math.random() * questions.length);
      questions[luckyIndex].isDoubleOrNothing = true;

      return {
        id: generateId(),
        title: cat.categoryName || `Category ${generateId()}`,
        questions: questions.slice(0, numQuestions)
      };
    });

    // Fill missing categories
    while (categories.length < numCategories) {
      const qs = Array.from({ length: numQuestions }).map((_, i) => ({
        id: generateId(), text: "Placeholder Question", answer: "Placeholder Answer",
        points: (i+1)*pointScale, isRevealed: false, isAnswered: false, isDoubleOrNothing: false
      }));
      const lucky = Math.floor(Math.random() * qs.length);
      qs[lucky].isDoubleOrNothing = true;
      categories.push({ id: generateId(), title: `Category ${categories.length+1}`, questions: qs });
    }

    const finalResult = categories.slice(0, numCategories);
    logger.info("aiGen_parseSuccess", { generationId, categoriesCount: finalResult.length });
    return finalResult;
  });
};

export const generateSingleQuestion = async (
  topic: string, 
  points: number, 
  categoryContext: string,
  difficulty: Difficulty = 'mixed',
  generationId: string = "unknown"
): Promise<{text: string, answer: string}> => {
  logger.info("aiGen_start", { generationId, mode: 'single_q', topic, categoryContext, points });
  if (!process.env.API_KEY) throw new AppError('ERR_FORBIDDEN', "Missing API Key", logger.getCorrelationId());
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  return withRetry(async (attempt) => {
    const prompt = `Write a single trivia question and answer.
      Topic: ${topic}
      Category: ${categoryContext}
      Difficulty Level: ${difficulty} (Points: ${points}).
      ${attempt > 0 ? "RETURN VALID JSON ONLY." : ""}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            answer: { type: Type.STRING }
          },
          required: ["question", "answer"]
        }
      }
    });

    const text = response.text || "";
    const data = extractAndParseJson(text, generationId);
    return { text: data.question || "Error", answer: data.answer || "Error" };
  });
};

export const generateCategoryQuestions = async (
  topic: string,
  categoryTitle: string,
  count: number,
  difficulty: Difficulty,
  pointScale: number = 100,
  generationId: string = "unknown"
): Promise<Question[]> => {
  logger.info("aiGen_start", { generationId, mode: 'category_rewrite', topic, categoryTitle, count });
  if (!process.env.API_KEY) throw new AppError('ERR_FORBIDDEN', "Missing API Key", logger.getCorrelationId());
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  return withRetry(async (attempt) => {
    const prompt = `Generate ${count} trivia questions for the category "${categoryTitle}" within the topic "${topic}".
      Difficulty: ${difficulty}.
      Questions should range from easy to hard.
      ${attempt > 0 ? "IMPORTANT: RETURN VALID JSON ONLY." : ""}`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING }
            },
            required: ["question", "answer"]
          }
        }
      }
    });

    const text = response.text || "";
    const data = extractAndParseJson(text, generationId);
    const questions: Question[] = (Array.isArray(data) ? data : []).map((item: any, idx: number) => ({
      id: generateId(),
      text: item.question || "Missing Question",
      answer: item.answer || "Missing Answer",
      points: (idx + 1) * pointScale,
      isRevealed: false,
      isAnswered: false,
      isDoubleOrNothing: false
    }));

    if (questions.length > 0) {
      const lucky = Math.floor(Math.random() * questions.length);
      questions[lucky].isDoubleOrNothing = true;
    }

    return questions;
  });
};
