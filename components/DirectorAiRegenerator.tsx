
import React, { useState } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { GameState, Difficulty, Category } from '../types';
import { generateTriviaGame } from '../services/geminiService';
import { logger } from '../services/logger';
import { soundService } from '../services/soundService';

interface Props {
  gameState: GameState;
  onUpdateState: (newState: GameState) => void;
  addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const DirectorAiRegenerator: React.FC<Props> = ({ gameState, onUpdateState, addToast }) => {
  const [prompt, setPrompt] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('mixed');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegenerate = async () => {
    if (isLoading || !prompt.trim()) return;
    
    const genId = crypto.randomUUID();
    const catCount = gameState.categories.length;
    const rowCount = gameState.categories[0]?.questions.length || 5;
    
    setIsLoading(true);
    soundService.playClick();
    
    logger.info('director_ai_board_regen_start', { 
      genId, 
      prompt, 
      difficulty, 
      dimensions: `${catCount}x${rowCount}` 
    });

    try {
      // 1. Fetch new content from Gemini
      const aiCats = await generateTriviaGame(
        prompt,
        difficulty,
        catCount,
        rowCount,
        100, // Dummy scale, points will be overridden by existing ones
        genId
      );

      // 2. Perform zip-merge to preserve IDs, Points, and State Flags
      const nextCats: Category[] = gameState.categories.map((exCat, cIdx) => {
        const aiCat = aiCats[cIdx];
        if (!aiCat) return exCat; // Fallback if AI returns fewer categories

        return {
          ...exCat,
          title: aiCat.title, // Update Title
          questions: exCat.questions.map((exQ, qIdx) => {
            const aiQ = aiCat.questions[qIdx];
            if (!aiQ) return exQ; // Fallback if AI returns fewer questions

            return {
              ...exQ,       // Preserves ID, Points, isAnswered, isRevealed, isDoubleOrNothing
              text: aiQ.text,
              answer: aiQ.answer
            };
          })
        };
      });

      // 3. Atomic state update
      onUpdateState({
        ...gameState,
        showTitle: prompt,
        categories: nextCats
      });

      logger.info('director_ai_board_regen_success', { genId, preservedIds: true });
      addToast('success', 'Board content updated (IDs & Points preserved).');
      setPrompt(''); // Clear after success
    } catch (e: any) {
      logger.error('director_ai_board_regen_failed', { genId, error: e.message });
      addToast('error', `Regeneration failed: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-purple-950/20 border border-purple-500/30 p-5 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-purple-400 font-black uppercase tracking-widest text-xs flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" /> Board Master Regeneration
        </h3>
        {isLoading && <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />}
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <label className="block text-[9px] uppercase font-black text-purple-300/40 mb-1.5 tracking-wider">New Global Topic</label>
          <input 
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={isLoading}
            placeholder="e.g. 1990s Pop Culture & Technology"
            className="w-full bg-black/40 border border-purple-500/20 p-2.5 rounded-lg text-white text-sm focus:border-purple-500 outline-none font-bold placeholder:text-zinc-800 transition-colors"
          />
        </div>

        <div className="w-full md:w-56 shrink-0">
          <label className="block text-[9px] uppercase font-black text-purple-300/40 mb-1.5 tracking-wider">Target Difficulty</label>
          <div className="grid grid-cols-2 gap-1">
            {(['easy', 'medium', 'hard', 'mixed'] as Difficulty[]).map(d => (
              <button 
                key={d} 
                type="button"
                onClick={() => setDifficulty(d)}
                disabled={isLoading}
                className={`py-1.5 rounded text-[9px] font-black uppercase border transition-all ${
                  difficulty === d 
                    ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/20' 
                    : 'bg-black/20 border-purple-500/10 text-purple-300/30 hover:border-purple-500/30'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end">
          <button 
            onClick={handleRegenerate}
            disabled={isLoading || !prompt.trim()}
            className="w-full md:w-auto h-[38px] px-6 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-lg transition-all shadow-xl disabled:opacity-30 disabled:grayscale active:scale-95"
          >
            Regenerate All
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[9px] text-purple-400/50 font-bold italic">
        <AlertCircle className="w-3 h-3" />
        <span>Replaces content but locks {gameState.categories.length} categories, {gameState.categories[0]?.questions.length || 5} rows, and all point values.</span>
      </div>
    </div>
  );
};
