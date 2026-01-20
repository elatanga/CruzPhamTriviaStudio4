import React, { useState, useEffect } from 'react';
import { Save, X, Wand2, RefreshCw, Loader2, Download, Upload, Plus, Minus, Trash2 } from 'lucide-react';
import { GameTemplate, Category, Question, Difficulty } from '../types';
import { generateTriviaGame, generateSingleQuestion, generateCategoryQuestions } from '../services/geminiService';
import { dataService } from '../services/dataService';

interface Props {
  showId: string;
  initialTemplate?: GameTemplate | null;
  onClose: () => void;
  onSave: () => void;
  addToast: (type: any, msg: string) => void;
}

export const TemplateBuilder: React.FC<Props> = ({ showId, initialTemplate, onClose, onSave, addToast }) => {
  // --- STATE ---
  const [step, setStep] = useState<'CONFIG' | 'BUILDER'>(initialTemplate ? 'BUILDER' : 'CONFIG');
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Config State
  const [config, setConfig] = useState({
    title: initialTemplate?.topic || '',
    catCount: initialTemplate?.categories.length || 4,
    rowCount: initialTemplate?.config?.rowCount || 5,
  });

  // Player Names State - Initialize from template or defaults
  const [playerNames, setPlayerNames] = useState<string[]>(
    initialTemplate?.config?.playerNames || 
    (initialTemplate?.config?.playerCount ? Array.from({length: initialTemplate.config.playerCount}).map((_, i) => `Player ${i+1}`) : ['Player 1', 'Player 2', 'Player 3', 'Player 4'])
  );

  // Builder State
  const [categories, setCategories] = useState<Category[]>(initialTemplate?.categories || []);
  const [editCell, setEditCell] = useState<{cIdx: number, qIdx: number} | null>(null);
  
  // Initialize blank board if new
  useEffect(() => {
    if (!initialTemplate && step === 'CONFIG') {
      // Waiting for user to click "Start Building"
    }
  }, [initialTemplate]);

  const initBoard = () => {
    if (!config.title.trim()) {
      addToast('error', 'Title is required');
      return;
    }

    if (playerNames.some(n => !n.trim())) {
      addToast('error', 'All player names must be filled');
      return;
    }

    const newCats: Category[] = Array.from({ length: config.catCount }).map((_, cI) => {
      // Randomly assign Double Or Nothing
      const luckyIndex = Math.floor(Math.random() * config.rowCount);
      return {
        id: Math.random().toString(),
        title: `Category ${cI + 1}`,
        questions: Array.from({ length: config.rowCount }).map((_, qI) => ({
          id: Math.random().toString(),
          text: 'Enter question text...',
          answer: 'Enter answer...',
          points: (qI + 1) * 100,
          isRevealed: false,
          isAnswered: false,
          isDoubleOrNothing: qI === luckyIndex
        }))
      };
    });
    setCategories(newCats);
    setStep('BUILDER');
  };

  // --- ACTIONS ---

  const handleSave = () => {
    try {
      // Enforce: Each category must have exactly one Double Or Nothing
      // If none found (e.g. manual edit interference), assign one randomly.
      const validatedCategories = categories.map(cat => {
        if (cat.questions.some(q => q.isDoubleOrNothing)) return cat;
        const lucky = Math.floor(Math.random() * cat.questions.length);
        return {
          ...cat,
          questions: cat.questions.map((q, i) => ({...q, isDoubleOrNothing: i === lucky}))
        };
      });

      if (initialTemplate) {
        dataService.updateTemplate({
          ...initialTemplate,
          topic: config.title,
          categories: validatedCategories,
          config: {
            playerCount: playerNames.length,
            playerNames: playerNames,
            categoryCount: validatedCategories.length,
            rowCount: validatedCategories[0]?.questions.length || config.rowCount
          }
        });
      } else {
        dataService.createTemplate(showId, config.title, {
          playerCount: playerNames.length,
          playerNames: playerNames,
          categoryCount: validatedCategories.length,
          rowCount: validatedCategories[0]?.questions.length || config.rowCount
        }, validatedCategories);
      }
      addToast('success', 'Template saved successfully.');
      onSave();
    } catch (e: any) {
      addToast('error', e.message === 'LIMIT_REACHED' ? 'Show has reached 40 templates limit.' : 'Failed to save.');
    }
  };

  const handleAiFillBoard = async (prompt: string, difficulty: Difficulty) => {
    if (!prompt.trim()) return;
    setIsAiLoading(true);
    try {
      const generatedCats = await generateTriviaGame(prompt, difficulty, categories.length, categories[0].questions.length);
      // Replace content but try to maintain IDs where possible to be safe, though replacing state is cleaner
      // We will trust the generatedCats structure matches the grid
      setCategories(generatedCats);
      setConfig(prev => ({...prev, title: prompt})); // Auto update title to topic
      addToast('success', 'Board populated by AI.');
    } catch (e) {
      addToast('error', 'AI Generation failed.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiRewriteCategory = async (cIdx: number) => {
    if (!confirm('Rewrite entire category? Existing content will be lost.')) return;
    setIsAiLoading(true);
    try {
      const cat = categories[cIdx];
      const newQs = await generateCategoryQuestions(config.title, cat.title, cat.questions.length, 'mixed');
      
      const newCats = [...categories];
      newCats[cIdx].questions = newQs.map((nq, i) => ({
        ...nq,
        points: (i + 1) * 100,
        id: cat.questions[i]?.id || nq.id 
      }));
      setCategories(newCats);
      addToast('success', `Category "${cat.title}" rewritten.`);
    } catch (e) {
      addToast('error', 'AI Failed to rewrite category.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleMagicCell = async (cIdx: number, qIdx: number) => {
    setIsAiLoading(true);
    try {
      const cat = categories[cIdx];
      const q = cat.questions[qIdx];
      const result = await generateSingleQuestion(config.title, q.points, cat.title);
      
      const newCats = [...categories];
      newCats[cIdx].questions[qIdx] = { ...q, text: result.text, answer: result.answer };
      setCategories(newCats);
      addToast('success', 'Question generated.');
    } catch (e) {
      addToast('error', 'Failed to generate question.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const updateCell = (text: string, answer: string) => {
    if (!editCell) return;
    const { cIdx, qIdx } = editCell;
    const newCats = [...categories];
    newCats[cIdx].questions[qIdx] = { ...newCats[cIdx].questions[qIdx], text, answer };
    setCategories(newCats);
    setEditCell(null);
  };

  const updateCatTitle = (cIdx: number, val: string) => {
    const newCats = [...categories];
    newCats[cIdx].title = val;
    setCategories(newCats);
  };

  // --- RENDER ---

  if (step === 'CONFIG') {
    return (
      <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-zinc-900 border border-gold-600 rounded-xl p-8 shadow-2xl flex flex-col max-h-[90vh]">
          <h2 className="text-2xl font-serif text-white mb-6 flex-none">New Template Configuration</h2>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
            <div>
              <label className="block text-xs uppercase text-gold-500 font-bold mb-1">Trivia Game Title</label>
              <input 
                value={config.title} onChange={e => setConfig(p => ({...p, title: e.target.value}))}
                className="w-full bg-black border border-zinc-700 p-3 rounded text-white focus:border-gold-500 outline-none"
                placeholder="e.g. Science Night" autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-8">
              {/* Grid Config */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase text-zinc-400 font-bold border-b border-zinc-800 pb-1">Board Size</h3>
                <div className="flex justify-between items-center">
                    <label className="text-xs text-zinc-300">Categories (1-8)</label>
                    <div className="flex items-center gap-2 bg-black p-1 rounded border border-zinc-800">
                      <button onClick={() => setConfig(p => ({...p, catCount: Math.max(1, p.catCount - 1)}))} className="text-gold-500 hover:text-white p-1"><Minus className="w-3 h-3" /></button>
                      <span className="text-sm font-mono text-white w-4 text-center">{config.catCount}</span>
                      <button onClick={() => setConfig(p => ({...p, catCount: Math.min(8, p.catCount + 1)}))} className="text-gold-500 hover:text-white p-1"><Plus className="w-3 h-3" /></button>
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <label className="text-xs text-zinc-300">Rows (1-10)</label>
                    <div className="flex items-center gap-2 bg-black p-1 rounded border border-zinc-800">
                      <button onClick={() => setConfig(p => ({...p, rowCount: Math.max(1, p.rowCount - 1)}))} className="text-gold-500 hover:text-white p-1"><Minus className="w-3 h-3" /></button>
                      <span className="text-sm font-mono text-white w-4 text-center">{config.rowCount}</span>
                      <button onClick={() => setConfig(p => ({...p, rowCount: Math.min(10, p.rowCount + 1)}))} className="text-gold-500 hover:text-white p-1"><Plus className="w-3 h-3" /></button>
                    </div>
                </div>
              </div>

              {/* Player Config */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-1">
                   <h3 className="text-xs uppercase text-zinc-400 font-bold">Contestants ({playerNames.length}/8)</h3>
                   {playerNames.length < 8 && (
                     <button onClick={() => setPlayerNames([...playerNames, `Player ${playerNames.length + 1}`])} className="text-[10px] text-gold-500 hover:text-white flex items-center gap-1">
                       <Plus className="w-3 h-3" /> ADD
                     </button>
                   )}
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                   {playerNames.map((name, idx) => (
                     <div key={idx} className="flex gap-2">
                        <input 
                            value={name} 
                            onChange={(e) => {
                                const newNames = [...playerNames];
                                newNames[idx] = e.target.value;
                                setPlayerNames(newNames);
                            }}
                            className="flex-1 bg-black border border-zinc-800 p-1.5 rounded text-white text-xs focus:border-gold-500 outline-none placeholder:text-zinc-700"
                            placeholder={`Player ${idx+1}`}
                        />
                        {playerNames.length > 1 && (
                            <button onClick={() => setPlayerNames(playerNames.filter((_, i) => i !== idx))} className="text-zinc-600 hover:text-red-500 px-1">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                     </div>
                   ))}
                </div>
              </div>
            </div>
            
            {/* AI Generator In Config */}
            <div className="bg-zinc-950 p-4 rounded border border-zinc-800">
               <h3 className="text-xs uppercase text-gold-600 font-bold mb-2 flex items-center gap-2"><Wand2 className="w-3 h-3" /> Instant Start</h3>
               <p className="text-[10px] text-zinc-500 mb-3">Skip manual setup and let AI generate the entire board structure and content.</p>
               <AiToolbar onGenerate={(prompt, diff) => {
                  setConfig(p => ({...p, title: prompt}));
                  // We need to initialize categories first then fill
                  const newCats = Array.from({ length: config.catCount }).map((_, cI) => ({
                    id: Math.random().toString(),
                    title: `Category ${cI + 1}`,
                    questions: Array.from({ length: config.rowCount }).map((_, qI) => ({
                      id: Math.random().toString(),
                      text: '', answer: '', points: (qI + 1) * 100, isRevealed: false, isAnswered: false, isDoubleOrNothing: false
                    }))
                  }));
                  setCategories(newCats);
                  setStep('BUILDER');
                  // Trigger generation
                  setIsAiLoading(true);
                  generateTriviaGame(prompt, diff, config.catCount, config.rowCount).then(generated => {
                      setCategories(generated);
                      setIsAiLoading(false);
                      addToast('success', 'Board generated!');
                  }).catch(() => {
                      setIsAiLoading(false);
                      addToast('error', 'Generation failed');
                  });
               }} />
            </div>

          </div>

          <div className="flex gap-3 mt-8 pt-4 border-t border-zinc-800 flex-none">
             <button onClick={onClose} className="flex-1 py-3 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 text-sm">Cancel</button>
             <button onClick={initBoard} disabled={!config.title || isAiLoading} className="flex-1 py-3 rounded bg-gold-600 text-black font-bold hover:bg-gold-500 disabled:opacity-50 text-sm flex items-center justify-center gap-2">
               {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start Building'}
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="h-16 bg-zinc-900 border-b border-gold-900/30 flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
          <input 
            value={config.title} 
            onChange={e => setConfig(p => ({...p, title: e.target.value}))}
            className="bg-transparent text-xl font-serif text-gold-500 font-bold outline-none border-b border-transparent focus:border-gold-500 placeholder:text-zinc-700"
            placeholder="Template Title"
          />
        </div>
        <div className="flex items-center gap-3">
           {isAiLoading && <div className="flex items-center gap-2 text-gold-400 text-xs animate-pulse"><Loader2 className="w-4 h-4 animate-spin" /> AI Processing...</div>}
           <AiToolbar onGenerate={handleAiFillBoard} />
           <button onClick={handleSave} className="bg-gold-600 hover:bg-gold-500 text-black font-bold px-4 py-2 rounded flex items-center gap-2"><Save className="w-4 h-4" /> Save</button>
        </div>
      </div>

      {/* GRID EDITOR */}
      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        <div 
           className="grid gap-2 w-full min-w-[800px] h-full"
           style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(150px, 1fr))` }}
        >
          {categories.map((cat, cIdx) => (
            <div key={cat.id} className="flex flex-col gap-2">
              {/* Header */}
              <div className="relative group/header">
                <input 
                  value={cat.title}
                  onChange={(e) => updateCatTitle(cIdx, e.target.value)}
                  className="w-full bg-gold-700 text-black font-bold text-center p-3 rounded uppercase text-sm border-b-4 border-gold-900 outline-none focus:bg-gold-600"
                />
                <button 
                  onClick={() => handleAiRewriteCategory(cIdx)}
                  className="absolute top-1 right-1 p-1 bg-black/20 hover:bg-black/50 rounded text-black hover:text-white opacity-0 group-hover/header:opacity-100 transition-opacity"
                  title="AI Rewrite Category"
                >
                  <Wand2 className="w-3 h-3" />
                </button>
              </div>

              {/* Rows */}
              {cat.questions.map((q, qIdx) => (
                <div 
                  key={q.id}
                  onClick={() => setEditCell({cIdx, qIdx})}
                  className="bg-zinc-900 border border-zinc-800 hover:border-gold-500 text-gold-400 font-serif font-bold text-2xl flex-1 flex flex-col items-center justify-center rounded cursor-pointer relative group transition-all"
                >
                  <span className={q.isDoubleOrNothing ? 'text-red-500' : ''}>{q.points}</span>
                  {q.isDoubleOrNothing && <div className="absolute top-1 right-1 text-[8px] bg-red-900 text-white px-1 rounded">2X</div>}
                  {(q.text !== 'Enter question text...') && (
                    <div className="absolute bottom-2 right-2 w-2 h-2 bg-green-500 rounded-full" title="Has Content" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* EDIT MODAL */}
      {editCell && (() => {
         const { cIdx, qIdx } = editCell;
         const q = categories[cIdx].questions[qIdx];
         return (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
             <div className="w-full max-w-lg bg-zinc-900 border border-gold-500/50 rounded-xl p-6 shadow-2xl">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="text-gold-500 font-bold">{categories[cIdx].title} // {q.points} Points</h3>
                  <button onClick={() => setEditCell(null)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
               </div>
               
               <div className="space-y-4">
                 <div>
                   <label className="text-xs uppercase text-zinc-500 font-bold">Question</label>
                   <textarea 
                     id="edit-q-text"
                     defaultValue={q.text}
                     className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-24 focus:border-gold-500 outline-none"
                   />
                 </div>
                 <div>
                   <label className="text-xs uppercase text-zinc-500 font-bold">Answer</label>
                   <textarea 
                     id="edit-q-answer"
                     defaultValue={q.answer}
                     className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-16 focus:border-gold-500 outline-none"
                   />
                 </div>
                 <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="edit-q-double" 
                      defaultChecked={q.isDoubleOrNothing}
                      onChange={(e) => {
                         // Manually toggling double means we might have 2 or 0 in category. 
                         // handleSave will fix 0, but 2 is allowed if manual.
                         const newCats = [...categories];
                         newCats[cIdx].questions[qIdx].isDoubleOrNothing = e.target.checked;
                         setCategories(newCats);
                      }}
                      className="accent-gold-600 w-4 h-4"
                    />
                    <label htmlFor="edit-q-double" className="text-xs text-red-500 font-bold uppercase">Force Double Or Nothing</label>
                 </div>
               </div>

               <div className="flex justify-between mt-6">
                 <button 
                   onClick={() => handleMagicCell(cIdx, qIdx)}
                   className="text-purple-400 hover:text-purple-300 flex items-center gap-2 text-sm font-bold"
                 >
                   <Wand2 className="w-4 h-4" /> AI Generate This Tile
                 </button>
                 <button 
                   onClick={() => {
                     const txt = (document.getElementById('edit-q-text') as HTMLTextAreaElement).value;
                     const ans = (document.getElementById('edit-q-answer') as HTMLTextAreaElement).value;
                     updateCell(txt, ans);
                   }}
                   className="bg-gold-600 hover:bg-gold-500 text-black font-bold px-6 py-2 rounded"
                 >
                   Update Tile
                 </button>
               </div>
             </div>
           </div>
         );
      })()}
    </div>
  );
};

// Sub-component for AI Toolbar
const AiToolbar: React.FC<{ onGenerate: (p: string, d: Difficulty) => void }> = ({ onGenerate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [diff, setDiff] = useState<Difficulty>('mixed');

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="text-gold-500 border border-gold-600/50 hover:bg-gold-900/20 px-3 py-2 rounded flex items-center gap-2 text-xs uppercase font-bold transition-all">
        <Wand2 className="w-4 h-4" /> AI Generate
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-zinc-800 p-1 rounded border border-gold-500/30 animate-in slide-in-from-top-2">
      <input 
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Topic for board..."
        className="bg-black text-white text-xs p-2 rounded w-48 border border-zinc-700 focus:border-gold-500 outline-none"
      />
      <select 
        value={diff} 
        onChange={e => setDiff(e.target.value as Difficulty)}
        className="bg-black text-white text-xs p-2 rounded border border-zinc-700 outline-none"
      >
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
        <option value="mixed">Mixed</option>
      </select>
      <button onClick={() => { onGenerate(prompt, diff); setIsOpen(false); }} className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded"><Wand2 className="w-3 h-3" /></button>
      <button onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white p-2"><X className="w-3 h-3" /></button>
    </div>
  );
};