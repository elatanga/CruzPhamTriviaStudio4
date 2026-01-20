import React, { useState, useEffect } from 'react';
import { Save, X, Wand2, RefreshCw, Loader2, Download, Upload, Plus, Minus } from 'lucide-react';
import { GameTemplate, Category, Question, Difficulty } from '../types';
import { generateTriviaGame, generateSingleQuestion } from '../services/geminiService';
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
    playerCount: initialTemplate?.config?.playerCount || 4,
    catCount: initialTemplate?.categories.length || 4,
    rowCount: initialTemplate?.config?.rowCount || 5,
  });

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

    const newCats: Category[] = Array.from({ length: config.catCount }).map((_, cI) => ({
      id: Math.random().toString(),
      title: `Category ${cI + 1}`,
      questions: Array.from({ length: config.rowCount }).map((_, qI) => ({
        id: Math.random().toString(),
        text: 'Enter question text...',
        answer: 'Enter answer...',
        points: (qI + 1) * 100,
        isRevealed: false,
        isAnswered: false
      }))
    }));
    setCategories(newCats);
    setStep('BUILDER');
  };

  // --- ACTIONS ---

  const handleSave = () => {
    try {
      if (initialTemplate) {
        dataService.updateTemplate({
          ...initialTemplate,
          topic: config.title,
          categories,
          config: {
            playerCount: config.playerCount,
            categoryCount: categories.length,
            rowCount: categories[0]?.questions.length || config.rowCount
          }
        });
      } else {
        dataService.createTemplate(showId, config.title, {
          playerCount: config.playerCount,
          categoryCount: categories.length,
          rowCount: categories[0]?.questions.length || config.rowCount
        }, categories);
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
      // Merge IDs to preserve structure if needed, but here we just replace content
      setCategories(generatedCats);
      addToast('success', 'Board populated by AI.');
    } catch (e) {
      addToast('error', 'AI Generation failed.');
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
        <div className="w-full max-w-lg bg-zinc-900 border border-gold-600 rounded-xl p-8 shadow-2xl">
          <h2 className="text-2xl font-serif text-white mb-6">New Template Configuration</h2>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs uppercase text-gold-500 font-bold mb-1">Trivia Game Title</label>
              <input 
                value={config.title} onChange={e => setConfig(p => ({...p, title: e.target.value}))}
                className="w-full bg-black border border-zinc-700 p-3 rounded text-white focus:border-gold-500 outline-none"
                placeholder="e.g. Science Night" autoFocus
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-2">Players (1-8)</label>
                <div className="flex items-center justify-center gap-2 bg-black p-2 rounded border border-zinc-800">
                  <button onClick={() => setConfig(p => ({...p, playerCount: Math.max(1, p.playerCount - 1)}))} className="text-gold-500 hover:text-white"><Minus className="w-4 h-4" /></button>
                  <span className="text-xl font-mono text-white w-6">{config.playerCount}</span>
                  <button onClick={() => setConfig(p => ({...p, playerCount: Math.min(8, p.playerCount + 1)}))} className="text-gold-500 hover:text-white"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="text-center">
                <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-2">Categories (1-8)</label>
                <div className="flex items-center justify-center gap-2 bg-black p-2 rounded border border-zinc-800">
                  <button onClick={() => setConfig(p => ({...p, catCount: Math.max(1, p.catCount - 1)}))} className="text-gold-500 hover:text-white"><Minus className="w-4 h-4" /></button>
                  <span className="text-xl font-mono text-white w-6">{config.catCount}</span>
                  <button onClick={() => setConfig(p => ({...p, catCount: Math.min(8, p.catCount + 1)}))} className="text-gold-500 hover:text-white"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="text-center">
                <label className="block text-[10px] uppercase text-zinc-500 font-bold mb-2">Rows (1-10)</label>
                <div className="flex items-center justify-center gap-2 bg-black p-2 rounded border border-zinc-800">
                  <button onClick={() => setConfig(p => ({...p, rowCount: Math.max(1, p.rowCount - 1)}))} className="text-gold-500 hover:text-white"><Minus className="w-4 h-4" /></button>
                  <span className="text-xl font-mono text-white w-6">{config.rowCount}</span>
                  <button onClick={() => setConfig(p => ({...p, rowCount: Math.min(10, p.rowCount + 1)}))} className="text-gold-500 hover:text-white"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={onClose} className="flex-1 py-3 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800">Cancel</button>
              <button onClick={initBoard} disabled={!config.title} className="flex-1 py-3 rounded bg-gold-600 text-black font-bold hover:bg-gold-500 disabled:opacity-50">Start Building</button>
            </div>
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
              <input 
                value={cat.title}
                onChange={(e) => updateCatTitle(cIdx, e.target.value)}
                className="bg-gold-700 text-black font-bold text-center p-3 rounded uppercase text-sm border-b-4 border-gold-900 outline-none focus:bg-gold-600"
              />
              {/* Rows */}
              {cat.questions.map((q, qIdx) => (
                <div 
                  key={q.id}
                  onClick={() => setEditCell({cIdx, qIdx})}
                  className="bg-zinc-900 border border-zinc-800 hover:border-gold-500 text-gold-400 font-serif font-bold text-2xl flex-1 flex flex-col items-center justify-center rounded cursor-pointer relative group transition-all"
                >
                  <span>{q.points}</span>
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
        <Wand2 className="w-4 h-4" /> AI Tools
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-zinc-800 p-1 rounded border border-gold-500/30 animate-in slide-in-from-top-2">
      <input 
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Topic for full board..."
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