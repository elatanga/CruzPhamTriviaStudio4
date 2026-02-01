import React, { useState, useEffect, useRef } from 'react';
import { Save, X, Wand2, RefreshCw, Loader2, Download, Upload, Plus, Minus, Trash2, HelpCircle, AlertCircle, Maximize2, Minimize2, RotateCcw, Sparkles, Hash, LogOut } from 'lucide-react';
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
  onLogout?: () => void;
  addToast: (type: any, msg: string) => void;
}

export const TemplateBuilder: React.FC<Props> = ({ showId, initialTemplate, onClose, onSave, onLogout, addToast }) => {
  // --- STATE MACHINE ---
  const [genState, setGenState] = useState<GenerationState>({ status: 'IDLE', id: null, stage: '' });
  const [step, setStep] = useState<'CONFIG' | 'BUILDER'>(initialTemplate ? 'BUILDER' : 'CONFIG');
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoFit, setIsAutoFit] = useState(true);
  
  // Snapshots for rollback
  const snapshotRef = useRef<Category[] | null>(null);
  const currentGenId = useRef<string | null>(null);

  // Config & AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiDifficulty, setAiDifficulty] = useState<Difficulty>('mixed');
  
  // COERCION & INITIALIZATION: Ensure pointScale is valid
  const getSafePointScale = (val?: number) => {
    const allowed = [10, 20, 25, 50, 100];
    if (val && allowed.includes(val)) return val;
    if (val !== undefined) {
      logger.warn("point_increment_invalid_coerced", { rawValue: val, coercedValue: 100 });
    }
    return 100;
  };

  const [config, setConfig] = useState({
    title: initialTemplate?.topic || '',
    catCount: initialTemplate?.categories.length || 4,
    rowCount: initialTemplate?.config?.rowCount || 5,
    pointScale: getSafePointScale(initialTemplate?.config?.pointScale)
  });

  // Player Names State
  const [playerNames, setPlayerNames] = useState<string[]>(
    initialTemplate?.config?.playerNames || 
    (initialTemplate?.config?.playerCount ? Array.from({length: initialTemplate.config.playerCount}).map((_, i) => `Player ${i+1}`) : ['Player 1', 'Player 2', 'Player 3', 'Player 4'])
  );

  // Builder State
  const [categories, setCategories] = useState<Category[]>(initialTemplate?.categories || []);
  const [editCell, setEditCell] = useState<{cIdx: number, qIdx: number} | null>(null);
  
  const isLocked = genState.status === 'GENERATING' || genState.status === 'APPLYING' || isSaving;

  // Log render mode and config load
  useEffect(() => {
    logger.info("builder_preview_rendered", { 
      showId, 
      templateId: initialTemplate?.id, 
      mode: initialTemplate ? "edit" : "create" 
    });
    
    if (step === 'BUILDER') {
      logger.info("builder_save_button_visible", { placement: "top_right_under_logout" });
    }
  }, [step, initialTemplate, showId]);

  // --- MUTATION GUARDS ---
  
  const guardedSetCategories = (
    updater: Category[] | ((prev: Category[]) => Category[]), 
    meta?: { source: string; genId?: string }
  ) => {
    const isAiApply = meta?.source === 'AI_GENERATION' && meta?.genId === currentGenId.current;
    
    if (isLocked && !isAiApply) {
      logger.warn('Mutation blocked during generation lock', { 
        status: genState.status, 
        source: meta?.source || 'USER'
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
    logger.info("template_builder_settings_change", { 
      rows: config.rowCount, 
      categories: config.catCount, 
      playersCount: playerNames.length, 
      pointScale: config.pointScale 
    });
  };

  const handleResetBuilder = () => {
    if (isLocked) return;
    if (confirm('Reset entire builder? Manual changes will be lost.')) {
      soundService.playClick();
      setCategories([]);
      setStep('CONFIG');
      logger.info("template_builder_reset");
    }
  };

  const handlePointScaleChange = (val: number) => {
    soundService.playClick();
    const oldVal = config.pointScale;
    setConfig(p => ({ ...p, pointScale: val }));
    
    // ATOMIC UPDATE: Recompute points for all tiles immediately
    setCategories(prev => prev.map(cat => ({
      ...cat,
      questions: cat.questions.map((q, qIdx) => ({
        ...q,
        points: (qIdx + 1) * val
      }))
    })));

    logger.info("point_increment_changed", { 
      from: oldVal, 
      to: val, 
      showId, 
      templateId: initialTemplate?.id,
      atIso: new Date().toISOString()
    });
    
    logger.info("preview_points_recomputed", { 
      increment: val, 
      rows: config.rowCount, 
      categories: config.catCount, 
      atIso: new Date().toISOString() 
    });
  };

  // --- ACTIONS ---

  const handleSave = async () => {
    if (isLocked || isSaving) return;
    soundService.playClick();
    
    logger.info("template_save_clicked", { 
      showId, 
      templateId: initialTemplate?.id, 
      hasAiData: aiPrompt.length > 0, 
      categories: categories.length, 
      rows: categories[0]?.questions.length || 0, 
      pointIncrement: config.pointScale,
      atIso: new Date().toISOString()
    });

    setIsSaving(true);
    
    try {
      await new Promise(r => setTimeout(r, 400));

      const validatedCategories = categories.map(cat => {
        if (cat.questions.some(q => q.isDoubleOrNothing)) return cat;
        const lucky = Math.floor(Math.random() * cat.questions.length);
        return {
          ...cat,
          questions: cat.questions.map((q, i) => ({...q, isDoubleOrNothing: i === lucky}))
        };
      });

      let savedTemplateId: string;

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
        savedTemplateId = initialTemplate.id;
      } else {
        const result = dataService.createTemplate(showId, config.title, {
          playerCount: playerNames.length,
          playerNames: playerNames,
          categoryCount: validatedCategories.length,
          rowCount: validatedCategories[0]?.questions.length || config.rowCount,
          pointScale: config.pointScale
        }, validatedCategories);
        savedTemplateId = result.id;
      }
      
      logger.info("template_save_success", { templateId: savedTemplateId, atIso: new Date().toISOString() });
      addToast('success', 'Template saved successfully.');
      onSave();
    } catch (e: any) {
      logger.error("template_save_failed", { 
        message: e.message, 
        code: e.message === 'LIMIT_REACHED' ? 'ERR_LIMIT_REACHED' : 'ERR_UNKNOWN', 
        atIso: new Date().toISOString() 
      });
      addToast('error', 'Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const startAiGeneration = (stage: string) => {
    const genId = crypto.randomUUID();
    currentGenId.current = genId;
    snapshotRef.current = [...categories];
    setGenState({ status: 'GENERATING', id: genId, stage });
    return genId;
  };

  const handleAiFillBoard = async (prompt: string, difficulty: Difficulty) => {
    if (!prompt.trim() || isLocked) return;
    
    logger.info("template_ai_generate_start", { 
      templateId: initialTemplate?.id, 
      showId, 
      difficulty, 
      scope: 'FULL_BOARD', 
      rows: config.rowCount, 
      categories: config.catCount 
    });

    const genId = startAiGeneration('Populating entire board...');
    try {
      const generatedCats = await generateTriviaGame(prompt, difficulty, config.catCount, config.rowCount, config.pointScale, genId);
      if (currentGenId.current !== genId) return;
      setGenState(prev => ({ ...prev, status: 'APPLYING' }));
      
      guardedSetCategories(generatedCats, { source: 'AI_GENERATION', genId });
      setConfig(prev => ({...prev, title: prompt}));
      
      setGenState({ status: 'COMPLETE', id: null, stage: '' });
      logger.info("template_ai_generate_success", { generatedCount: generatedCats.length * config.rowCount, difficulty, scope: 'FULL_BOARD' });
      addToast('success', 'Board populated by AI.');
    } catch (e: any) {
      if (currentGenId.current === genId) {
        logger.error("template_ai_generate_fail", { difficulty, scope: 'FULL_BOARD', message: e.message });
        setGenState({ status: 'FAILED', id: null, stage: '' });
        if (snapshotRef.current) setCategories(snapshotRef.current);
        addToast('error', 'AI Generation failed.');
      }
    }
  };

  const handleAiRewriteCategory = async (cIdx: number) => {
    if (isLocked) return;
    soundService.playClick();
    
    const scope = 'CATEGORY_REWRITE';
    logger.info("template_ai_generate_start", { difficulty: aiDifficulty, scope, categories: 1 });

    const genId = startAiGeneration(`Rewriting category: ${categories[cIdx].title}`);
    try {
      const cat = categories[cIdx];
      const newQs = await generateCategoryQuestions(config.topic || config.title, cat.title, cat.questions.length, aiDifficulty, config.pointScale, genId);
      if (currentGenId.current !== genId) return;
      setGenState(prev => ({ ...prev, status: 'APPLYING' }));
      const newCats = [...categories];
      newCats[cIdx] = {
        ...cat,
        questions: newQs.map((nq, i) => ({ ...nq, points: (i + 1) * config.pointScale, id: cat.questions[i]?.id || nq.id }))
      };
      guardedSetCategories(newCats, { source: 'AI_GENERATION', genId });
      setGenState({ status: 'COMPLETE', id: null, stage: '' });
      logger.info("template_ai_generate_success", { generatedCount: newQs.length, difficulty: aiDifficulty, scope });
      addToast('success', `Category rewritten.`);
    } catch (e: any) {
      if (currentGenId.current === genId) {
        logger.error("template_ai_generate_fail", { difficulty: aiDifficulty, scope, message: e.message });
        setGenState({ status: 'FAILED', id: null, stage: '' });
        addToast('error', 'AI Failed to rewrite category.');
      }
    }
  };

  const handleMagicCell = async (cIdx: number, qIdx: number) => {
    if (isLocked) return;
    soundService.playClick();
    
    const scope = 'SINGLE_TILE';
    logger.info("template_ai_generate_start", { difficulty: aiDifficulty, scope });

    const genId = startAiGeneration('Generating question...');
    try {
      const cat = categories[cIdx];
      const q = cat.questions[qIdx];
      const result = await generateSingleQuestion(config.title, q.points, cat.title, aiDifficulty, genId);
      if (currentGenId.current !== genId) return;
      setGenState(prev => ({ ...prev, status: 'APPLYING' }));
      const newCats = [...categories];
      newCats[cIdx] = { ...newCats[cIdx], questions: [...newCats[cIdx].questions] };
      newCats[cIdx].questions[qIdx] = { ...q, text: result.text, answer: result.answer };
      guardedSetCategories(newCats, { source: 'AI_GENERATION', genId });
      setGenState({ status: 'COMPLETE', id: null, stage: '' });
      logger.info("template_ai_generate_success", { generatedCount: 1, difficulty: aiDifficulty, scope });
      addToast('success', 'Question generated.');
    } catch (e: any) {
      if (currentGenId.current === genId) {
        logger.error("template_ai_generate_fail", { difficulty: aiDifficulty, scope, message: e.message });
        setGenState({ status: 'FAILED', id: null, stage: '' });
        addToast('error', 'Failed to generate question.');
      }
    }
  };

  const updateCell = (text: string, answer: string) => {
    if (!editCell || isLocked) return;
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
      <div className="template-builder font-roboto font-bold fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-zinc-900 border border-gold-600 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
          
          <div className="flex-none p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
             <h2 className="text-2xl font-serif text-white">New Template Configuration</h2>
             <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar pb-32">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Left Column: Manual Config */}
              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] uppercase text-gold-500 font-black mb-2 tracking-widest">Show or Game Topic</label>
                  <input 
                    disabled={isLocked}
                    value={config.title} onChange={e => setConfig(p => ({...p, title: e.target.value}))}
                    className="w-full bg-black border border-zinc-700 p-4 rounded text-white focus:border-gold-500 outline-none disabled:opacity-50 text-lg font-roboto font-bold"
                    placeholder="e.g. Science Night 2024" autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-[10px] uppercase text-zinc-400 font-black border-b border-zinc-800 pb-1 tracking-widest">Dimensions</h3>
                    <div className="flex justify-between items-center text-xs text-zinc-300 font-bold">
                        <label>Categories</label>
                        <div className="flex items-center gap-2 bg-black p-1 rounded border border-zinc-800">
                          <button disabled={isLocked} onClick={() => setConfig(p => ({...p, catCount: Math.max(1, p.catCount - 1)}))} className="p-1"><Minus className="w-3 h-3 text-gold-500" /></button>
                          <span className="w-4 text-center text-white font-mono">{config.catCount}</span>
                          <button disabled={isLocked} onClick={() => setConfig(p => ({...p, catCount: Math.min(8, p.catCount + 1)}))} className="p-1"><Plus className="w-3 h-3 text-gold-500" /></button>
                        </div>
                    </div>
                    <div className="flex justify-between items-center text-xs text-zinc-300 font-bold">
                        <label>Rows</label>
                        <div className="flex items-center gap-2 bg-black p-1 rounded border border-zinc-800">
                          <button disabled={isLocked} onClick={() => setConfig(p => ({...p, rowCount: Math.max(1, p.rowCount - 1)}))} className="p-1"><Minus className="w-3 h-3 text-gold-500" /></button>
                          <span className="w-4 text-center text-white font-mono">{config.rowCount}</span>
                          <button disabled={isLocked} onClick={() => setConfig(p => ({...p, rowCount: Math.min(10, p.rowCount + 1)}))} className="p-1"><Plus className="w-3 h-3 text-gold-500" /></button>
                        </div>
                    </div>

                    <div className="space-y-2 mt-4">
                       <label className="text-[10px] uppercase text-zinc-500 font-black tracking-widest block">Points Increment</label>
                       <div className="flex flex-wrap gap-1">
                          {[10, 20, 25, 50, 100].map(val => (
                             <button
                                key={val}
                                type="button"
                                disabled={isLocked}
                                onClick={() => handlePointScaleChange(val)}
                                className={`flex-1 min-w-[40px] py-2 rounded text-[10px] font-bold border transition-all ${config.pointScale === val ? 'bg-gold-600 border-gold-500 text-black' : 'bg-black border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                             >
                                {val}
                             </button>
                          ))}
                       </div>
                       <p className="text-[9px] text-zinc-500 font-mono italic">Range: {config.pointScale} - {config.pointScale * config.rowCount} pts</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-1">
                       <h3 className="text-[10px] uppercase text-zinc-400 font-black tracking-widest">Contestants</h3>
                       <button onClick={() => setPlayerNames([...playerNames, `Player ${playerNames.length + 1}`])} className="text-[10px] text-gold-500 hover:text-white font-bold"><Plus className="w-3 h-3 inline" /> ADD</button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                       {playerNames.map((name, idx) => (
                         <div key={idx} className="flex gap-2">
                            <input value={name} onChange={(e) => { const n = [...playerNames]; n[idx] = e.target.value; setPlayerNames(n); }} className="flex-1 bg-black border border-zinc-800 p-2 rounded text-white text-xs font-roboto font-bold" />
                            <button onClick={() => setPlayerNames(playerNames.filter((_, i) => i !== idx))} className="text-zinc-600 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                   <button onClick={initBoard} disabled={!config.title || isLocked} className="w-full py-4 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 font-roboto font-bold hover:bg-zinc-700 hover:text-white transition-all uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                     Manually Create Board Structure
                   </button>
                </div>
              </div>

              {/* Right Column: AI Generation */}
              <div className="bg-black/40 border border-purple-500/20 rounded-xl p-6 space-y-6 flex flex-col relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <Sparkles className="w-24 h-24 text-purple-500" />
                 </div>
                 
                 <div>
                    <h3 className="text-sm uppercase text-purple-400 font-roboto font-bold flex items-center gap-2 tracking-widest mb-1">
                      <Sparkles className="w-4 h-4" /> AI Magic Studio
                    </h3>
                    <p className="text-xs text-zinc-500 leading-relaxed font-bold">Skip manual entry. Generate a full board based on your topic and difficulty settings instantly.</p>
                 </div>

                 <div className="space-y-4 relative z-10">
                    <div>
                       <label className="block text-[10px] uppercase text-zinc-500 font-black mb-1.5">Topic for AI</label>
                       <input 
                         value={aiPrompt}
                         onChange={e => setAiPrompt(e.target.value)}
                         placeholder="Enter topic (e.g. 90s Pop Culture)"
                         className="w-full bg-zinc-900 border border-zinc-800 p-3 rounded text-white text-sm outline-none focus:border-purple-500 font-roboto font-bold"
                       />
                    </div>

                    <div>
                       <label className="block text-[10px] uppercase text-zinc-500 font-black mb-1.5">Select Difficulty</label>
                       <div className="grid grid-cols-4 gap-2">
                          {(['easy', 'medium', 'hard', 'mixed'] as Difficulty[]).map(d => (
                             <button
                               key={d}
                               type="button"
                               onClick={() => setAiDifficulty(d)}
                               className={`py-2 rounded text-[10px] font-roboto font-bold uppercase border transition-all ${aiDifficulty === d ? 'bg-purple-600 border-purple-400 text-white shadow-lg' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-600'}`}
                             >
                               {d}
                             </button>
                          ))}
                       </div>
                    </div>

                    <button 
                      onClick={() => {
                        if (aiPrompt) {
                          soundService.playClick();
                          // Preview board structure
                          const newCats = Array.from({ length: config.catCount }).map((_, cI) => ({
                            id: Math.random().toString(),
                            title: `AI Generating...`,
                            questions: Array.from({ length: config.rowCount }).map((_, qI) => ({
                              id: Math.random().toString(),
                              text: '', answer: '', points: (qI + 1) * config.pointScale, isRevealed: false, isAnswered: false, isDoubleOrNothing: false
                            }))
                          }));
                          setCategories(newCats);
                          setStep('BUILDER');
                          handleAiFillBoard(aiPrompt, aiDifficulty);
                        }
                      }}
                      disabled={!aiPrompt || isLocked}
                      className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-roboto font-bold rounded shadow-xl flex items-center justify-center gap-3 transition-all disabled:opacity-30 uppercase tracking-widest text-sm"
                    >
                      <Sparkles className="w-5 h-5" /> Generate Full Board
                    </button>
                 </div>
              </div>
            </div>
          </div>

          <div className="flex-none p-6 border-t border-zinc-800 bg-zinc-950/50 flex gap-4">
             <button onClick={onClose} className="flex-1 py-4 rounded border border-zinc-800 text-zinc-500 font-roboto font-bold uppercase tracking-widest text-xs hover:bg-zinc-900 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="template-builder font-roboto font-bold fixed inset-0 z-50 bg-black flex flex-col animate-in fade-in duration-200">
      {/* TOOLBAR */}
      <div className="h-16 bg-zinc-900 border-b border-gold-900/30 flex items-center justify-between px-4 md:px-6 shrink-0 shadow-lg relative z-50">
        <div className="flex items-center gap-4 min-w-0">
          <button disabled={isLocked} onClick={onClose} className="text-zinc-500 hover:text-white shrink-0"><X className="w-6 h-6" /></button>
          <div className="hidden lg:block h-8 w-px bg-zinc-800" />
          <input 
            disabled={isLocked}
            value={config.title} 
            onChange={e => setConfig(p => ({...p, title: e.target.value}))}
            className="bg-transparent text-lg md:text-xl text-gold-500 font-roboto font-bold outline-none border-b border-transparent focus:border-gold-500 placeholder:text-zinc-700 disabled:opacity-50 truncate"
            placeholder="Template Title"
          />
        </div>
        
        {/* NEW TOP-RIGHT ACTION CLUSTER: LOGOUT & SAVE STACK */}
        <div className="flex flex-col items-end gap-1.5 shrink-0 py-2 relative z-50">
           <button 
             onClick={() => { soundService.playClick(); onClose(); onLogout?.(); }}
             className="text-[10px] uppercase font-black text-red-500 hover:text-red-400 flex items-center gap-1 transition-colors px-1"
           >
             <LogOut className="w-3 h-3" /> Logout Producer
           </button>
           
           <button 
             disabled={isLocked || isSaving} 
             onClick={handleSave} 
             className="bg-gold-600 hover:bg-gold-500 text-black font-roboto font-bold px-5 py-1.5 rounded flex items-center gap-2 shadow-lg transition-transform active:scale-95 whitespace-nowrap"
           >
             {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
             <span className="uppercase text-[11px] tracking-wider">Save Template</span>
           </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* SIDEBAR: Controls */}
        <aside className="hidden lg:flex flex-col w-72 bg-zinc-950 border-r border-zinc-800 p-5 shrink-0 space-y-8 custom-scrollbar overflow-y-auto pb-24">
           {/* Magic Studio Controls */}
           <div className="bg-purple-950/10 border border-purple-500/20 p-4 rounded-xl space-y-4">
              <h4 className="text-[11px] text-purple-400 uppercase font-roboto font-bold tracking-widest flex items-center gap-2">
                 <Sparkles className="w-3.5 h-3.5" /> Magic Studio
              </h4>
              
              <div className="space-y-1.5">
                 <label className="text-[9px] uppercase text-zinc-500 font-black">AI Topic</label>
                 <input 
                   disabled={isLocked}
                   value={aiPrompt}
                   onChange={e => setAiPrompt(e.target.value)}
                   placeholder="Enter board topic..."
                   className="w-full bg-black border border-zinc-800 p-2 rounded text-xs text-white outline-none focus:border-purple-500 font-roboto font-bold"
                 />
              </div>

              <div className="space-y-1.5">
                 <label className="text-[9px] uppercase text-zinc-500 font-black">Difficulty</label>
                 <div className="grid grid-cols-2 gap-1.5">
                    {(['easy', 'medium', 'hard', 'mixed'] as Difficulty[]).map(d => (
                       <button
                         key={d}
                         onClick={() => setAiDifficulty(d)}
                         className={`py-1.5 rounded text-[9px] font-roboto font-bold uppercase border ${aiDifficulty === d ? 'bg-purple-600 border-purple-400 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}
                       >
                         {d}
                       </button>
                    ))}
                 </div>
              </div>

              <button 
                onClick={() => handleAiFillBoard(aiPrompt, aiDifficulty)}
                disabled={!aiPrompt || isLocked}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-roboto font-bold rounded text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
              >
                <Wand2 className="w-4 h-4" /> Re-populate All
              </button>
           </div>

           <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 border-b border-zinc-900 pb-1 font-roboto font-bold">Board Parameters</h4>
              <div className="space-y-4">
                 <div className="flex justify-between items-center text-xs text-zinc-400 font-bold">
                    <span>Point Increment</span>
                    <select 
                      value={config.pointScale} 
                      onChange={e => handlePointScaleChange(parseInt(e.target.value))} 
                      className="bg-black border border-zinc-800 rounded p-1 text-gold-500 outline-none font-roboto font-bold"
                    >
                       {[10, 20, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400 font-bold">Auto-fit Grid</span>
                    <button onClick={() => setIsAutoFit(!isAutoFit)} className={`p-1 rounded ${isAutoFit ? 'text-gold-500 bg-gold-950/30' : 'text-zinc-600 bg-zinc-900'}`}>
                       {isAutoFit ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                 </div>
              </div>
           </div>

           <div>
              <h4 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 border-b border-zinc-900 pb-1 font-roboto font-bold">Management</h4>
              <div className="space-y-2">
                 <button onClick={() => setStep('CONFIG')} className="w-full text-left p-2.5 rounded hover:bg-zinc-900 text-[10px] font-roboto font-bold uppercase text-zinc-300 flex items-center gap-2 transition-colors">
                    <Hash className="w-3.5 h-3.5" /> Adjust Structure
                 </button>
                 <button onClick={handleResetBuilder} className="w-full text-left p-2.5 rounded hover:bg-red-950/20 text-[10px] font-roboto font-bold uppercase text-zinc-300 flex items-center gap-2 transition-colors">
                    <RotateCcw className="w-3.5 h-3.5 text-red-500" /> Reset Board
                 </button>
              </div>
           </div>
        </aside>

        {/* MAIN: PREVIEW GRID - pt-8 added to clear the top-right cluster on smaller screens if needed */}
        <main className="flex-1 overflow-auto p-4 md:p-8 custom-scrollbar bg-zinc-950/50 relative pb-12 pt-12 lg:pt-8">
          <div className="flex items-center justify-between mb-4 border-b border-zinc-900 pb-2">
             <div className="flex items-center gap-2">
                <span className="text-xs font-roboto font-bold text-zinc-500 uppercase tracking-widest">Live Builder Preview</span>
             </div>
          </div>

          <div 
             className={`grid gap-2 mx-auto transition-transform duration-300 ${isAutoFit ? 'max-w-6xl' : ''}`}
             style={{ 
               gridTemplateColumns: `repeat(${categories.length}, minmax(120px, 1fr))`,
               transformOrigin: 'top center'
             }}
          >
            {categories.map((cat, cIdx) => (
              <div key={cat.id} className="flex flex-col gap-2">
                <div className="relative group/header">
                  <input 
                    disabled={isLocked}
                    value={cat.title}
                    onChange={(e) => updateCatTitle(cIdx, e.target.value)}
                    className="w-full bg-gold-700 text-black font-roboto font-bold text-center p-2 rounded uppercase text-[clamp(10px,1.2vw,14px)] border-b-2 border-gold-900 outline-none focus:bg-gold-600 transition-colors"
                  />
                  {!isLocked && (
                    <button 
                      onClick={() => handleAiRewriteCategory(cIdx)}
                      className="absolute -top-1 -right-1 p-1 bg-purple-600 rounded-full text-white opacity-0 group-hover/header:opacity-100 transition-opacity shadow-lg"
                      title="AI Regenerate Category"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {cat.questions.map((q, qIdx) => (
                  <div 
                    key={q.id}
                    onClick={() => { if(!isLocked) { soundService.playSelect(); setEditCell({cIdx, qIdx}); } }}
                    className={`
                      bg-zinc-900 border border-zinc-800 hover:border-gold-500 text-gold-400 font-roboto font-bold flex-1 flex flex-col items-center justify-center rounded min-h-[52px] relative group transition-all
                      ${isLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer active:scale-95 shadow-md hover:shadow-gold-500/10'}
                    `}
                  >
                    <span className={`text-[clamp(12px,1.8vw,18px)] font-roboto font-bold ${q.isDoubleOrNothing ? 'text-red-500' : ''}`}>{q.points}</span>
                    {q.isDoubleOrNothing && <div className="absolute top-0.5 right-0.5 text-[7px] bg-red-900 text-white px-0.5 rounded font-roboto font-bold">2X</div>}
                    {(q.text && q.text !== 'Enter question text...') && (
                      <div className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-green-500 rounded-full" />
                    )}
                    
                    {!isLocked && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleMagicCell(cIdx, qIdx); }}
                        className="absolute bottom-1 left-1 p-0.5 bg-purple-900/50 rounded text-purple-200 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Quick AI Generate"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </main>
      </div>

      {/* GENERATION OVERLAY */}
      {isLocked && genState.status === 'GENERATING' && (
        <div className="absolute inset-0 z-[70] bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in">
           <div className="bg-zinc-900 border border-gold-600/50 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
              <Loader2 className="w-10 h-10 text-gold-500 animate-spin mx-auto mb-4" />
              <h3 className="text-white text-lg mb-2 uppercase font-roboto font-bold tracking-widest">AI Studio Working</h3>
              <p className="text-zinc-400 text-[10px] mb-6 uppercase tracking-widest font-roboto font-bold">{genState.stage}</p>
           </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editCell && !isLocked && (() => {
         const { cIdx, qIdx } = editCell;
         const q = categories[cIdx].questions[qIdx];
         return (
           <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
             <div className="w-full max-w-lg bg-zinc-900 border border-gold-500/50 rounded-xl p-6 shadow-2xl">
               <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-gold-500 font-roboto font-bold uppercase text-sm tracking-widest">{categories[cIdx].title}</h3>
                    <p className="text-zinc-500 text-[10px] font-roboto font-bold uppercase mt-0.5">{q.points} Points // Index {qIdx+1}</p>
                  </div>
                  <button onClick={() => setEditCell(null)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
               </div>
               <div className="space-y-4">
                 <div>
                   <label className="text-[10px] uppercase text-zinc-500 font-roboto font-bold mb-1 block">Question Prompt</label>
                   <textarea id="edit-q-text" defaultValue={q.text} className="w-full bg-black border border-zinc-700 text-white p-3 rounded focus:border-gold-500 outline-none min-h-[100px] text-sm font-roboto font-bold" />
                 </div>
                 <div>
                   <label className="text-[10px] uppercase text-zinc-500 font-roboto font-bold mb-1 block">Revealed Answer</label>
                   <textarea id="edit-q-answer" defaultValue={q.answer} className="w-full bg-black border border-zinc-700 text-white p-3 rounded focus:border-gold-500 outline-none min-h-[60px] text-sm font-roboto font-bold" />
                 </div>
                 <div className="flex items-center gap-2 p-3 bg-zinc-950 rounded border border-zinc-800">
                    <input 
                      type="checkbox" id="edit-q-double" defaultChecked={q.isDoubleOrNothing}
                      onChange={(e) => {
                         const n = [...categories];
                         n[cIdx].questions[qIdx] = { ...n[cIdx].questions[qIdx], isDoubleOrNothing: e.target.checked };
                         setCategories(n);
                      }}
                      className="accent-gold-600 w-4 h-4"
                    />
                    <label htmlFor="edit-q-double" className="text-xs text-red-500 font-roboto font-bold uppercase">Double Or Nothing Tile</label>
                 </div>
               </div>
               <div className="flex justify-between items-center mt-8 pt-4 border-t border-zinc-800">
                 <button onClick={() => handleMagicCell(cIdx, qIdx)} className="text-purple-400 hover:text-purple-300 flex items-center gap-2 text-[10px] uppercase font-roboto font-bold group">
                   <Sparkles className="w-4 h-4 group-hover:scale-110 transition-transform" /> AI Regen Tile
                 </button>
                 <button onClick={() => {
                   const txt = (document.getElementById('edit-q-text') as HTMLTextAreaElement).value;
                   const ans = (document.getElementById('edit-q-answer') as HTMLTextAreaElement).value;
                   updateCell(txt, ans);
                 }} className="bg-gold-600 hover:bg-gold-500 text-black font-roboto font-bold px-6 py-2 rounded text-xs uppercase tracking-widest shadow-lg shadow-gold-900/20">Update Tile</button>
               </div>
             </div>
           </div>
         );
      })()}

      <style>{`
        .template-builder .grid-item { min-height: 52px; }
        .template-builder input, .template-builder textarea, .template-builder select, .template-builder button { font-family: "Roboto", system-ui, sans-serif; font-weight: 700; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #FFD700; }
      `}</style>
    </div>
  );
};