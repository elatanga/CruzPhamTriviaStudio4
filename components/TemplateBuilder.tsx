
import React, { useState, useEffect, useRef } from 'react';
import { Save, X, Wand2, RefreshCw, Loader2, Download, Upload, Plus, Minus, Trash2, HelpCircle, AlertCircle } from 'lucide-react';
import { GameTemplate, Category, Question, Difficulty } from '../types';
import { generateTriviaGame, generateSingleQuestion, generateCategoryQuestions } from '../services/geminiService';
import { dataService } from '../services/dataService';
import { soundService } from '../services/soundService';
import { logger } from '../services/logger';

type GenerationStatus = 'IDLE' | 'GENERATING' | 'APPLYING' | 'COMPLETE' | 'FAILED' | 'CANCELED';

interface GenerationState {
  status: GenerationStatus;
  id: string | null;
  stage: string;
}

interface Props {
  showId: string;
  initialTemplate?: GameTemplate | null;
  onClose: () => void;
  onSave: () => void;
  addToast: (type: any, msg: string) => void;
}

export const TemplateBuilder: React.FC<Props> = ({ showId, initialTemplate, onClose, onSave, addToast }) => {
  // --- STATE MACHINE ---
  const [genState, setGenState] = useState<GenerationState>({ status: 'IDLE', id: null, stage: '' });
  const [step, setStep] = useState<'CONFIG' | 'BUILDER'>(initialTemplate ? 'BUILDER' : 'CONFIG');
  
  // Snapshots for rollback
  const snapshotRef = useRef<Category[] | null>(null);
  const currentGenId = useRef<string | null>(null);

  // Config State
  const [config, setConfig] = useState({
    title: initialTemplate?.topic || '',
    catCount: initialTemplate?.categories.length || 4,
    rowCount: initialTemplate?.config?.rowCount || 5,
    pointScale: initialTemplate?.config?.pointScale || 100
  });

  // Player Names State
  const [playerNames, setPlayerNames] = useState<string[]>(
    initialTemplate?.config?.playerNames || 
    (initialTemplate?.config?.playerCount ? Array.from({length: initialTemplate.config.playerCount}).map((_, i) => `Player ${i+1}`) : ['Player 1', 'Player 2', 'Player 3', 'Player 4'])
  );

  // Builder State
  const [categories, setCategories] = useState<Category[]>(initialTemplate?.categories || []);
  const [editCell, setEditCell] = useState<{cIdx: number, qIdx: number} | null>(null);
  
  const isLocked = genState.status === 'GENERATING' || genState.status === 'APPLYING';

  // --- MUTATION GUARDS ---
  
  /**
   * Guards state updates.
   * Allows internal AI updates but blocks user interactions while generating.
   */
  const guardedSetCategories = (
    updater: Category[] | ((prev: Category[]) => Category[]), 
    meta?: { source: string; genId?: string }
  ) => {
    const isAiApply = meta?.source === 'AI_GENERATION' && meta?.genId === currentGenId.current;
    
    if (isLocked && !isAiApply) {
      logger.warn('Mutation blocked during generation lock', { 
        status: genState.status, 
        source: meta?.source || 'USER',
        currentGenId: currentGenId.current,
        incomingGenId: meta?.genId
      });
      return;
    }
    setCategories(updater);
  };

  const initBoard = () => {
    if (isLocked) return;
    soundService.playClick();
    if (!config.title.trim()) {
      addToast('error', 'Title is required');
      return;
    }

    if (playerNames.some(n => !n.trim())) {
      addToast('error', 'All player names must be filled');
      return;
    }

    const newCats: Category[] = Array.from({ length: config.catCount }).map((_, cI) => {
      const luckyIndex = Math.floor(Math.random() * config.rowCount);
      return {
        id: Math.random().toString(),
        title: `Category ${cI + 1}`,
        questions: Array.from({ length: config.rowCount }).map((_, qI) => ({
          id: Math.random().toString(),
          text: 'Enter question text...',
          answer: 'Enter answer...',
          points: (qI + 1) * config.pointScale,
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
    if (isLocked) return;
    soundService.playClick();
    try {
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
            rowCount: validatedCategories[0]?.questions.length || config.rowCount,
            pointScale: config.pointScale
          }
        });
      } else {
        dataService.createTemplate(showId, config.title, {
          playerCount: playerNames.length,
          playerNames: playerNames,
          categoryCount: validatedCategories.length,
          rowCount: validatedCategories[0]?.questions.length || config.rowCount,
          pointScale: config.pointScale
        }, validatedCategories);
      }
      addToast('success', 'Template saved successfully.');
      onSave();
    } catch (e: any) {
      addToast('error', e.message === 'LIMIT_REACHED' ? 'Show has reached 40 templates limit.' : 'Failed to save.');
    }
  };

  const startAiGeneration = (stage: string) => {
    const genId = crypto.randomUUID();
    currentGenId.current = genId;
    snapshotRef.current = [...categories];
    setGenState({ status: 'GENERATING', id: genId, stage });
    logger.info('aiGen_lifecycle_start', { genId, stage });
    return genId;
  };

  const handleAiFillBoard = async (prompt: string, difficulty: Difficulty) => {
    if (!prompt.trim() || isLocked) return;
    soundService.playClick();
    
    const genId = startAiGeneration('Populating entire board...');

    try {
      const generatedCats = await generateTriviaGame(
        prompt, 
        difficulty, 
        config.catCount, 
        config.rowCount, 
        config.pointScale, 
        genId
      );
      
      if (currentGenId.current !== genId) {
        logger.info('aiGen_stale_discarded', { genId });
        return;
      }

      setGenState(prev => ({ ...prev, status: 'APPLYING' }));
      
      // Atomic apply via guarded setter with bypass tag
      guardedSetCategories(generatedCats, { source: 'AI_GENERATION', genId });
      setConfig(prev => ({...prev, title: prompt}));
      
      setGenState({ status: 'COMPLETE', id: null, stage: '' });
      logger.info('aiGen_lifecycle_success', { genId });
      addToast('success', 'Board populated by AI.');
    } catch (e: any) {
      if (currentGenId.current === genId) {
        logger.error('aiGen_lifecycle_error', { genId, error: e.message });
        setGenState({ status: 'FAILED', id: null, stage: '' });
        if (snapshotRef.current) setCategories(snapshotRef.current);
        addToast('error', 'AI Generation failed. Please try a different topic.');
      }
    }
  };

  const handleAiRewriteCategory = async (cIdx: number) => {
    if (isLocked) return;
    soundService.playClick();
    if (!confirm('Rewrite entire category? Existing content will be lost.')) return;
    
    const genId = startAiGeneration(`Rewriting category: ${categories[cIdx].title}`);

    try {
      const cat = categories[cIdx];
      const newQs = await generateCategoryQuestions(config.title, cat.title, cat.questions.length, 'mixed', config.pointScale, genId);
      
      if (currentGenId.current !== genId) return;

      setGenState(prev => ({ ...prev, status: 'APPLYING' }));
      
      const newCats = [...categories];
      newCats[cIdx] = {
        ...cat,
        questions: newQs.map((nq, i) => ({
          ...nq,
          points: (i + 1) * config.pointScale,
          id: cat.questions[i]?.id || nq.id 
        }))
      };
      
      guardedSetCategories(newCats, { source: 'AI_GENERATION', genId });
      
      setGenState({ status: 'COMPLETE', id: null, stage: '' });
      addToast('success', `Category "${cat.title}" rewritten.`);
    } catch (e) {
      if (currentGenId.current === genId) {
        setGenState({ status: 'FAILED', id: null, stage: '' });
        if (snapshotRef.current) setCategories(snapshotRef.current);
        addToast('error', 'AI Failed to rewrite category.');
      }
    }
  };

  const handleMagicCell = async (cIdx: number, qIdx: number) => {
    if (isLocked) return;
    soundService.playClick();
    
    const genId = startAiGeneration('Generating single question...');

    try {
      const cat = categories[cIdx];
      const q = cat.questions[qIdx];
      const result = await generateSingleQuestion(config.title, q.points, cat.title, 'mixed', genId);
      
      if (currentGenId.current !== genId) return;

      setGenState(prev => ({ ...prev, status: 'APPLYING' }));
      
      const newCats = [...categories];
      newCats[cIdx] = {
        ...newCats[cIdx],
        questions: [...newCats[cIdx].questions]
      };
      newCats[cIdx].questions[qIdx] = { ...q, text: result.text, answer: result.answer };
      
      guardedSetCategories(newCats, { source: 'AI_GENERATION', genId });
      setGenState({ status: 'COMPLETE', id: null, stage: '' });
      addToast('success', 'Question generated.');
    } catch (e) {
      if (currentGenId.current === genId) {
        setGenState({ status: 'FAILED', id: null, stage: '' });
        addToast('error', 'Failed to generate question.');
      }
    }
  };

  const updateCell = (text: string, answer: string) => {
    if (!editCell || isLocked) return;
    soundService.playClick();
    const { cIdx, qIdx } = editCell;
    const newCats = [...categories];
    newCats[cIdx] = { ...newCats[cIdx], questions: [...newCats[cIdx].questions] };
    newCats[cIdx].questions[qIdx] = { ...newCats[cIdx].questions[qIdx], text, answer };
    guardedSetCategories(newCats);
    setEditCell(null);
  };

  const updateCatTitle = (cIdx: number, val: string) => {
    if (isLocked) return;
    const newCats = [...categories];
    newCats[cIdx] = { ...newCats[cIdx], title: val };
    guardedSetCategories(newCats);
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
                disabled={isLocked}
                value={config.title} onChange={e => setConfig(p => ({...p, title: e.target.value}))}
                className="w-full bg-black border border-zinc-700 p-3 rounded text-white focus:border-gold-500 outline-none disabled:opacity-50"
                placeholder="e.g. Science Night 2024" autoFocus
              />
              <p className="text-[10px] text-zinc-500 mt-1">This will be the main topic for AI generation.</p>
            </div>

            <div className="grid grid-cols-2 gap-8">
              {/* Board Config */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase text-zinc-400 font-bold border-b border-zinc-800 pb-1">Board Size</h3>
                <div className="flex justify-between items-center">
                    <label className="text-xs text-zinc-300">Categories (1-8)</label>
                    <div className="flex items-center gap-2 bg-black p-1 rounded border border-zinc-800">
                      <button disabled={isLocked} onClick={() => { soundService.playClick(); setConfig(p => ({...p, catCount: Math.max(1, p.catCount - 1)}))}} className="text-gold-500 hover:text-white p-1 disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                      <span className="text-sm font-mono text-white w-4 text-center">{config.catCount}</span>
                      <button disabled={isLocked} onClick={() => { soundService.playClick(); setConfig(p => ({...p, catCount: Math.min(8, p.catCount + 1)}))}} className="text-gold-500 hover:text-white p-1 disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                    </div>
                </div>
                <div className="flex justify-between items-center">
                    <label className="text-xs text-zinc-300">Rows (1-10)</label>
                    <div className="flex items-center gap-2 bg-black p-1 rounded border border-zinc-800">
                      <button disabled={isLocked} onClick={() => { soundService.playClick(); setConfig(p => ({...p, rowCount: Math.max(1, p.rowCount - 1)}))}} className="text-gold-500 hover:text-white p-1 disabled:opacity-30"><Minus className="w-3 h-3" /></button>
                      <span className="text-sm font-mono text-white w-4 text-center">{config.rowCount}</span>
                      <button disabled={isLocked} onClick={() => { soundService.playClick(); setConfig(p => ({...p, rowCount: Math.min(10, p.rowCount + 1)}))}} className="text-gold-500 hover:text-white p-1 disabled:opacity-30"><Plus className="w-3 h-3" /></button>
                    </div>
                </div>

                {/* Point Scale Config */}
                <h3 className="text-xs uppercase text-zinc-400 font-bold border-b border-zinc-800 pb-1 pt-2">Point System</h3>
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <label className="text-xs text-zinc-300">Point Scale</label>
                        <span className="text-[10px] text-zinc-600">Increment per row</span>
                    </div>
                    <div className="flex items-center gap-1 bg-black p-1 rounded border border-zinc-800">
                        {[10, 20, 25, 100].map(val => (
                            <button
                                key={val}
                                disabled={isLocked}
                                onClick={() => { soundService.playClick(); setConfig(p => ({...p, pointScale: val})); }}
                                className={`px-2 py-1 text-xs font-mono rounded disabled:opacity-50 ${config.pointScale === val ? 'bg-gold-600 text-black font-bold' : 'text-zinc-500 hover:text-white'}`}
                            >
                                {val}
                            </button>
                        ))}
                    </div>
                </div>
              </div>

              {/* Player Config */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-1">
                   <h3 className="text-xs uppercase text-zinc-400 font-bold flex items-center gap-2">
                     Contestants <span className="bg-zinc-800 text-zinc-500 px-1 rounded text-[10px]">{playerNames.length}/8</span>
                   </h3>
                   {playerNames.length < 8 && !isLocked && (
                     <button onClick={() => { soundService.playClick(); setPlayerNames([...playerNames, `Player ${playerNames.length + 1}`])}} className="text-[10px] text-gold-500 hover:text-white flex items-center gap-1">
                       <Plus className="w-3 h-3" /> ADD
                     </button>
                   )}
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                   {playerNames.map((name, idx) => (
                     <div key={idx} className="flex gap-2">
                        <input 
                            disabled={isLocked}
                            value={name} 
                            onChange={(e) => {
                                const newNames = [...playerNames];
                                newNames[idx] = e.target.value;
                                setPlayerNames(newNames);
                            }}
                            className="flex-1 bg-black border border-zinc-800 p-1.5 rounded text-white text-xs focus:border-gold-500 outline-none placeholder:text-zinc-700 disabled:opacity-50"
                            placeholder={`Player ${idx+1}`}
                        />
                        {playerNames.length > 1 && !isLocked && (
                            <button onClick={() => { soundService.playClick(); setPlayerNames(playerNames.filter((_, i) => i !== idx))}} className="text-zinc-600 hover:text-red-500 px-1">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                     </div>
                   ))}
                </div>
              </div>
            </div>
            
            {/* AI Generator In Config */}
            <div className="bg-zinc-950 p-4 rounded border border-zinc-800 relative overflow-hidden">
               {isLocked && (
                 <div className="absolute inset-0 bg-black/60 z-10 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in">
                    <Loader2 className="w-6 h-6 text-gold-500 animate-spin mb-2" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gold-500">{genState.stage}</span>
                 </div>
               )}
               <h3 className="text-xs uppercase text-gold-600 font-bold mb-2 flex items-center gap-2"><Wand2 className="w-3 h-3" /> Magic Generator</h3>
               <p className="text-[10px] text-zinc-500 mb-3">Skip manual entry and let AI build the entire board instantly.</p>
               <AiToolbar disabled={isLocked} onGenerate={(prompt, diff) => {
                  soundService.playClick();
                  setConfig(p => ({...p, title: prompt}));
                  
                  // Initialize board structure immediately to give visual feedback before AI starts filling
                  const newCats = Array.from({ length: config.catCount }).map((_, cI) => ({
                    id: Math.random().toString(),
                    title: `Category ${cI + 1}`,
                    questions: Array.from({ length: config.rowCount }).map((_, qI) => ({
                      id: Math.random().toString(),
                      text: '', answer: '', points: (qI + 1) * config.pointScale, isRevealed: false, isAnswered: false, isDoubleOrNothing: false
                    }))
                  }));
                  setCategories(newCats);
                  setStep('BUILDER');
                  handleAiFillBoard(prompt, diff);
               }} />
            </div>

          </div>

          <div className="flex gap-3 mt-8 pt-4 border-t border-zinc-800 flex-none">
             <button disabled={isLocked} onClick={() => { soundService.playClick(); onClose(); }} className="flex-1 py-3 rounded border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 text-sm disabled:opacity-30">Cancel</button>
             <button onClick={initBoard} disabled={!config.title || isLocked} className="flex-1 py-3 rounded bg-gold-600 text-black font-bold hover:bg-gold-500 disabled:opacity-50 text-sm flex items-center justify-center gap-2 uppercase tracking-wide">
                Start Building
             </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col animate-in fade-in duration-200">
      {/* HEADER */}
      <div className="h-16 bg-zinc-900 border-b border-gold-900/30 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button disabled={isLocked} onClick={() => { soundService.playClick(); onClose(); }} className="text-zinc-500 hover:text-white disabled:opacity-30"><X className="w-6 h-6" /></button>
          <input 
            disabled={isLocked}
            value={config.title} 
            onChange={e => setConfig(p => ({...p, title: e.target.value}))}
            className="bg-transparent text-xl font-serif text-gold-500 font-bold outline-none border-b border-transparent focus:border-gold-500 placeholder:text-zinc-700 disabled:opacity-50"
            placeholder="Template Title"
          />
        </div>
        <div className="flex items-center gap-3">
           <AiToolbar disabled={isLocked} onGenerate={handleAiFillBoard} />
           <button disabled={isLocked} onClick={handleSave} className="bg-gold-600 hover:bg-gold-500 text-black font-bold px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Save</button>
        </div>
      </div>

      {/* GENERATION OVERLAY */}
      {isLocked && (
        <div className="absolute inset-0 top-16 z-50 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-8 animate-in fade-in">
           <div className="bg-zinc-900 border border-gold-600/50 p-8 rounded-2xl shadow-2xl max-w-sm w-full">
              <Loader2 className="w-10 h-10 text-gold-500 animate-spin mx-auto mb-4" />
              <h3 className="text-white font-serif text-xl mb-2">AI Studio Working</h3>
              <p className="text-zinc-400 text-sm mb-6">{genState.stage}</p>
              <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                 <div className="h-full bg-gold-500 animate-[loading_2s_infinite]" />
              </div>
           </div>
        </div>
      )}

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
                  disabled={isLocked}
                  value={cat.title}
                  onChange={(e) => updateCatTitle(cIdx, e.target.value)}
                  className="w-full bg-gold-700 text-black font-bold text-center p-3 rounded uppercase text-sm border-b-4 border-gold-900 outline-none focus:bg-gold-600 disabled:opacity-80"
                />
                {!isLocked && (
                  <button 
                    onClick={() => handleAiRewriteCategory(cIdx)}
                    className="absolute top-1 right-1 p-1 bg-black/20 hover:bg-black/50 rounded text-black hover:text-white opacity-0 group-hover/header:opacity-100 transition-opacity"
                    title="AI Rewrite Category"
                  >
                    <Wand2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Rows */}
              {cat.questions.map((q, qIdx) => (
                <div 
                  key={q.id}
                  onClick={() => { if(!isLocked) { soundService.playSelect(); setEditCell({cIdx, qIdx}); } }}
                  className={`
                    bg-zinc-900 border border-zinc-800 hover:border-gold-500 text-gold-400 font-serif font-bold text-2xl flex-1 flex flex-col items-center justify-center rounded relative group transition-all
                    ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                  `}
                >
                  <span className={q.isDoubleOrNothing ? 'text-red-500' : ''}>{q.points}</span>
                  {q.isDoubleOrNothing && <div className="absolute top-1 right-1 text-[8px] bg-red-900 text-white px-1 rounded">2X</div>}
                  {(q.text && q.text !== 'Enter question text...') && (
                    <div className="absolute bottom-2 right-2 w-2 h-2 bg-green-500 rounded-full" title="Has Content" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* EDIT MODAL */}
      {editCell && !isLocked && (() => {
         const { cIdx, qIdx } = editCell;
         const q = categories[cIdx].questions[qIdx];
         return (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
             <div className="w-full max-w-lg bg-zinc-900 border border-gold-500/50 rounded-xl p-6 shadow-2xl">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="text-gold-500 font-bold">{categories[cIdx].title} // {q.points} Points</h3>
                  <button onClick={() => { soundService.playClick(); setEditCell(null); }} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
               </div>
               
               <div className="space-y-4">
                 <div>
                   <label className="text-xs uppercase text-zinc-500 font-bold flex justify-between">Question <span title="The text displayed to the host/players"><HelpCircle className="w-3 h-3 cursor-help" /></span></label>
                   <textarea 
                     id="edit-q-text"
                     defaultValue={q.text}
                     className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-24 focus:border-gold-500 outline-none"
                   />
                 </div>
                 <div>
                   <label className="text-xs uppercase text-zinc-500 font-bold flex justify-between">Answer <span title="Hidden until revealed by host"><HelpCircle className="w-3 h-3 cursor-help" /></span></label>
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
                         soundService.playClick();
                         const newCats = [...categories];
                         newCats[cIdx] = { ...newCats[cIdx], questions: [...newCats[cIdx].questions] };
                         newCats[cIdx].questions[qIdx] = { ...newCats[cIdx].questions[qIdx], isDoubleOrNothing: e.target.checked };
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
      
      <style>{`
        @keyframes loading {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
};

const AiToolbar: React.FC<{ disabled?: boolean, onGenerate: (p: string, d: Difficulty) => void }> = ({ disabled, onGenerate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [diff, setDiff] = useState<Difficulty>('mixed');

  if (!isOpen) {
    return (
      <button disabled={disabled} onClick={() => { soundService.playClick(); setIsOpen(true); }} className="text-gold-500 border border-gold-600/50 hover:bg-gold-900/20 px-3 py-2 rounded flex items-center gap-2 text-xs uppercase font-bold transition-all disabled:opacity-30">
        <Wand2 className="w-4 h-4" /> AI Generate
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-zinc-800 p-1 rounded border border-gold-500/30 animate-in slide-in-from-top-2">
      <input 
        disabled={disabled}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Topic for board..."
        className="bg-black text-white text-xs p-2 rounded w-48 border border-zinc-700 focus:border-gold-500 outline-none disabled:opacity-50"
      />
      <select 
        disabled={disabled}
        value={diff} 
        onChange={e => setDiff(e.target.value as Difficulty)}
        className="bg-black text-white text-xs p-2 rounded border border-zinc-700 outline-none disabled:opacity-50"
      >
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
        <option value="mixed">Mixed</option>
      </select>
      <button disabled={disabled || !prompt} onClick={() => { onGenerate(prompt, diff); setIsOpen(false); }} className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded disabled:opacity-30"><Wand2 className="w-3 h-3" /></button>
      <button disabled={disabled} onClick={() => { soundService.playClick(); setIsOpen(false); }} className="text-zinc-500 hover:text-white p-2 disabled:opacity-30"><X className="w-3 h-3" /></button>
    </div>
  );
};
