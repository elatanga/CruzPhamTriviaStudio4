
import React, { useState } from 'react';
import { Settings, Users, Grid, Edit, Save, X, RefreshCw, Wand2, MonitorOff, ExternalLink, RotateCcw, Play, Pause, Timer, Type, Layout, Star } from 'lucide-react';
import { GameState, Question, Difficulty, Category, BoardViewSettings, Player } from '../types';
import { generateSingleQuestion, generateCategoryQuestions } from '../services/geminiService';
import { logger } from '../services/logger';
import { soundService } from '../services/soundService';

interface Props {
  gameState: GameState;
  onUpdateState: (newState: GameState) => void;
  onPopout?: () => void;
  isPoppedOut?: boolean;
  onBringBack?: () => void;
  addToast: (type: any, msg: string) => void;
  onClose?: () => void;
}

export const DirectorPanel: React.FC<Props> = ({ 
  gameState, onUpdateState, onPopout, isPoppedOut, onBringBack, addToast, onClose 
}) => {
  const [activeTab, setActiveTab] = useState<'GAME' | 'PLAYERS' | 'BOARD'>('BOARD');
  const [editingQuestion, setEditingQuestion] = useState<{cIdx: number, qIdx: number} | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // --- ACTIONS ---

  const handleUpdateTitle = (title: string) => {
    onUpdateState({ ...gameState, showTitle: title });
  };

  const handleUpdatePlayer = (id: string, field: 'name' | 'score', value: string | number) => {
    const newPlayers = gameState.players.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    );
    onUpdateState({ ...gameState, players: newPlayers });
  };

  const handleUseWildcard = (player: Player) => {
    soundService.playClick();
    const currentUsed = player.wildcardsUsed || 0;
    
    // Hard Limit Enforcement: Max 4
    if (currentUsed >= 4) {
      addToast('error', 'Max wildcards (4) reached for this player.');
      logger.warn('wildcard_use_blocked_max', { playerId: player.id, wildcardsUsed: currentUsed });
      return;
    }

    const nextUsed = currentUsed + 1;

    const newPlayers = gameState.players.map(p => 
      p.id === player.id ? { ...p, wildcardsUsed: nextUsed } : p
    );
    
    onUpdateState({ ...gameState, players: newPlayers });
    logger.info('wildcard_use_applied', { playerId: player.id, wildcardsUsed: nextUsed });
    addToast('success', `${player.name}: Wildcard Used (${nextUsed}/4)`);
  };

  const handleUpdateCategoryTitle = (cIdx: number, title: string) => {
    const newCats = [...gameState.categories];
    newCats[cIdx].title = title;
    onUpdateState({ ...gameState, categories: newCats });
  };

  // View Settings Actions
  const updateViewSettings = (updates: Partial<BoardViewSettings>) => {
    onUpdateState({
      ...gameState,
      viewSettings: {
        ...gameState.viewSettings,
        ...updates,
        updatedAt: new Date().toISOString()
      }
    });
    soundService.playClick();
  };

  // Timer Actions
  const updateTimer = (updates: Partial<typeof gameState.timer>) => {
    soundService.playClick();
    onUpdateState({
      ...gameState,
      timer: { ...gameState.timer, ...updates }
    });
  };

  const startTimer = () => {
    updateTimer({
      endTime: Date.now() + (gameState.timer.duration * 1000),
      isRunning: true
    });
  };

  const stopTimer = () => {
    updateTimer({ isRunning: false });
  };

  const resetTimer = () => {
    updateTimer({ endTime: null, isRunning: false });
  };

  const handleSaveQuestion = (cIdx: number, qIdx: number, q: Partial<Question>) => {
    soundService.playClick();
    const newCats = [...gameState.categories];
    const oldQ = newCats[cIdx].questions[qIdx];
    
    // Check if replacing a voided question -> unlock it
    const isUnvoiding = oldQ.isVoided && !q.isVoided && q.isVoided !== undefined;
    
    newCats[cIdx].questions[qIdx] = { 
      ...oldQ, 
      ...q,
      // If we are actively saving from editor, ensure it's playable if previously voided and user wants to replace
      isVoided: q.isVoided !== undefined ? q.isVoided : oldQ.isVoided,
      // If we unvoid, we must also reset the game flags
      isAnswered: isUnvoiding ? false : (q.isAnswered ?? oldQ.isAnswered),
      isRevealed: isUnvoiding ? false : (q.isRevealed ?? oldQ.isRevealed)
    };
    
    onUpdateState({ ...gameState, categories: newCats });
    setEditingQuestion(null);
    logger.info('directorEditSuccess', { type: 'question', id: oldQ.id });
    if (isUnvoiding) {
      addToast('success', 'Question replaced and unlocked.');
      logger.info('voidReplaceApplied', { id: oldQ.id });
    } else {
      addToast('success', 'Question updated.');
    }
  };

  const handleAiReplace = async (cIdx: number, qIdx: number, difficulty: Difficulty) => {
    soundService.playClick();
    setAiLoading(true);
    try {
      const cat = gameState.categories[cIdx];
      const q = cat.questions[qIdx];
      const result = await generateSingleQuestion(gameState.showTitle, q.points, cat.title, difficulty);
      
      handleSaveQuestion(cIdx, qIdx, {
        text: result.text,
        answer: result.answer,
        // Implicitly unvoid if it was void
        isVoided: false,
        isAnswered: false,
        isRevealed: false
      });
      addToast('success', 'Question generated by AI.');
    } catch (e) {
      addToast('error', 'AI Failed.');
      logger.error('directorEditFail', { error: e });
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiRewriteCategory = async (cIdx: number) => {
    soundService.playClick();
    if (!confirm('Rewrite entire category? Existing questions will be lost.')) return;
    setAiLoading(true);
    try {
      const cat = gameState.categories[cIdx];
      const newQs = await generateCategoryQuestions(gameState.showTitle, cat.title, cat.questions.length, 'mixed');
      
      const newCats = [...gameState.categories];
      newCats[cIdx].questions = newQs.map((nq, i) => ({
        ...nq,
        points: (i + 1) * 100, // Enforce points
        id: cat.questions[i]?.id || nq.id // Keep ID if exists to prevent react key issues
      }));
      
      onUpdateState({ ...gameState, categories: newCats });
      addToast('success', 'Category rewritten.');
    } catch (e) {
      addToast('error', 'AI Failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const forceCloseDirector = () => {
    soundService.playClick();
    setEditingQuestion(null);
    addToast('info', 'Director UI reset.');
  };

  // --- RENDER ---

  if (isPoppedOut) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4 bg-zinc-950">
        <ExternalLink className="w-16 h-16 text-gold-500" />
        <h2 className="text-2xl font-serif text-white">Director is Popped Out</h2>
        <p className="max-w-xs text-center text-sm">Controls are active in the separate window. Close that window or click below to return control here.</p>
        <div className="flex gap-3">
          <button 
            type="button"
            onClick={onBringBack}
            className="bg-zinc-800 hover:bg-gold-600 hover:text-black text-white px-6 py-2 rounded font-bold uppercase tracking-wider transition-colors"
          >
            Bring Back
          </button>
          {onClose && (
            <button 
              type="button"
              onClick={() => { soundService.playClick(); onClose(); }}
              className="border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white px-6 py-2 rounded font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Close Panel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-white relative">
      {/* TOOLBAR */}
      <div className="flex-none h-14 border-b border-zinc-800 flex items-center px-4 justify-between bg-black">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => { soundService.playClick(); setActiveTab('BOARD'); }} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 ${activeTab === 'BOARD' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Grid className="w-4 h-4" /> Board
          </button>
          <button type="button" onClick={() => { soundService.playClick(); setActiveTab('PLAYERS'); }} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 ${activeTab === 'PLAYERS' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Users className="w-4 h-4" /> Players
          </button>
          <button type="button" onClick={() => { soundService.playClick(); setActiveTab('GAME'); }} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 ${activeTab === 'GAME' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Settings className="w-4 h-4" /> Config
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button type="button" onClick={forceCloseDirector} className="p-2 text-zinc-600 hover:text-red-500" title="Force Reset UI">
             <RotateCcw className="w-4 h-4" />
          </button>
          {onPopout && (
            <button type="button" onClick={() => { soundService.playClick(); onPopout(); }} className="flex items-center gap-2 text-xs font-bold uppercase text-gold-500 border border-gold-900/50 px-3 py-1.5 rounded hover:bg-gold-900/20">
              <ExternalLink className="w-3 h-3" /> Detach
            </button>
          )}
          {onClose && (
             <>
               <div className="w-px h-6 bg-zinc-800 mx-2" />
               <button 
                 type="button"
                 onClick={() => { soundService.playClick(); onClose(); }}
                 className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded hover:bg-zinc-900 transition-colors"
               >
                 <X className="w-4 h-4" /> Close
               </button>
             </>
          )}
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        
        {/* === BOARD EDITOR === */}
        {activeTab === 'BOARD' && (
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Timer Control Panel */}
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                   <div className="text-gold-500"><Timer className="w-5 h-5" /></div>
                   <div>
                     <p className="text-xs font-bold uppercase text-zinc-400">Timer Control</p>
                     <div className="flex gap-1 mt-1">
                       {[15, 30, 60].map(d => (
                         <button 
                           key={d}
                           type="button"
                           onClick={() => updateTimer({ duration: d })}
                           className={`px-2 py-0.5 text-[10px] rounded border ${gameState.timer.duration === d ? 'bg-gold-600 text-black border-gold-600' : 'bg-black text-zinc-400 border-zinc-800'}`}
                         >
                           {d}s
                         </button>
                       ))}
                     </div>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                  {!gameState.timer.isRunning ? (
                     <button type="button" onClick={startTimer} className="bg-green-600 hover:bg-green-500 text-white p-2 rounded-full"><Play className="w-4 h-4" /></button>
                  ) : (
                     <button type="button" onClick={stopTimer} className="bg-yellow-600 hover:bg-yellow-500 text-black p-2 rounded-full"><Pause className="w-4 h-4" /></button>
                  )}
                  <button type="button" onClick={resetTimer} className="bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded-full"><RotateCcw className="w-4 h-4" /></button>
                </div>
              </div>

              {/* View/Scale Control Panel */}
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col gap-4">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <Layout className="w-4 h-4 text-gold-500" />
                       <span className="text-xs font-bold uppercase text-zinc-400 tracking-wider">Board View settings</span>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Font Scale */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1"><Type className="w-3 h-3" /> Board Font</label>
                       <div className="flex bg-black p-1 rounded gap-1 border border-zinc-800">
                          { [0.85, 1.0, 1.15, 1.25, 1.35].map((scale, i) => (
                             <button 
                                key={scale} 
                                type="button"
                                onClick={() => updateViewSettings({ boardFontScale: scale })}
                                className={`flex-1 py-1 text-[9px] font-bold rounded ${gameState.viewSettings?.boardFontScale === scale ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}
                             >
                                {['XS', 'S', 'M', 'L', 'XL'][i]}
                             </button>
                          ))}
                       </div>
                    </div>

                    {/* Tile Scale */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1"><Grid className="w-3 h-3" /> Tile Size</label>
                       <div className="flex bg-black p-1 rounded gap-1 border border-zinc-800">
                          { [0.85, 1.0, 1.15].map((scale, i) => (
                             <button 
                                key={scale} 
                                type="button"
                                onClick={() => updateViewSettings({ tileScale: scale })}
                                className={`flex-1 py-1 text-[9px] font-bold rounded ${gameState.viewSettings?.tileScale === scale ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}
                             >
                                {['Compact', 'Default', 'Large'][i]}
                             </button>
                          ))}
                       </div>
                    </div>

                    {/* Scoreboard Scale */}
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1"><Users className="w-3 h-3" /> Scoreboard</label>
                       <div className="flex bg-black p-1 rounded gap-1 border border-zinc-800">
                          { [0.9, 1.0, 1.2, 1.4].map((scale, i) => (
                             <button 
                                key={scale} 
                                type="button"
                                onClick={() => updateViewSettings({ scoreboardScale: scale })}
                                className={`flex-1 py-1 text-[9px] font-bold rounded ${gameState.viewSettings?.scoreboardScale === scale ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}
                             >
                                {['XS', 'Default', 'Large', 'XL'][i]}
                             </button>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
               <h3 className="text-gold-500 font-bold uppercase tracking-widest text-sm">Live Board Control</h3>
               {gameState.activeQuestionId && (
                 <button 
                   type="button"
                   onClick={() => { soundService.playClick(); onUpdateState({...gameState, activeQuestionId: null, activeCategoryId: null}); }} 
                   className="bg-red-900/50 text-red-200 border border-red-800 px-3 py-1 rounded text-xs font-bold uppercase flex items-center gap-2 hover:bg-red-900"
                 >
                   <MonitorOff className="w-3 h-3" /> Force Close Active Q
                 </button>
               )}
            </div>
            
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gameState.categories.length}, minmax(180px, 1fr))` }}>
              {gameState.categories.map((cat, cIdx) => (
                <div key={cat.id} className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <input 
                      value={cat.title} 
                      onChange={e => handleUpdateCategoryTitle(cIdx, e.target.value)}
                      className="bg-zinc-900 text-gold-400 font-bold text-xs p-2 rounded w-full border border-transparent focus:border-gold-500 outline-none"
                    />
                    <button type="button" onClick={() => handleAiRewriteCategory(cIdx)} className="text-zinc-600 hover:text-purple-400" title="AI Rewrite Category"><Wand2 className="w-3 h-3" /></button>
                  </div>
                  {cat.questions.map((q, qIdx) => (
                    <div 
                      key={q.id}
                      onClick={() => { soundService.playClick(); setEditingQuestion({cIdx, qIdx}); }}
                      className={`
                        p-3 rounded border flex flex-col gap-1 cursor-pointer transition-all hover:brightness-110 relative
                        ${q.isVoided ? 'bg-red-900/20 border-red-800' : q.isAnswered ? 'bg-zinc-900 border-zinc-800 opacity-60' : 'bg-zinc-800 border-zinc-700'}
                      `}
                    >
                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                        <span>{q.points}</span>
                        {q.isVoided && <span className="text-red-500 font-bold">VOID</span>}
                        {q.isDoubleOrNothing && <span className="text-gold-500 font-bold">2x</span>}
                      </div>
                      <p className="text-xs text-zinc-300 line-clamp-2 leading-tight font-bold">{q.text}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{q.answer}</p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === PLAYERS EDITOR === */}
        {activeTab === 'PLAYERS' && (
          <div className="max-w-3xl mx-auto space-y-4">
             <h3 className="text-gold-500 font-bold uppercase tracking-widest text-sm mb-4">Contestant Management</h3>
             <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
               <table className="w-full text-left text-sm">
                 <thead className="bg-black text-zinc-500 uppercase font-mono text-xs">
                   <tr>
                     <th className="p-3">Name</th>
                     <th className="p-3">Score</th>
                     <th className="p-3 text-center">Steals</th>
                     <th className="p-3 text-center">Wildcard</th>
                     <th className="p-3 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-zinc-800">
                   {gameState.players.map(p => {
                     const used = p.wildcardsUsed || 0;
                     const steals = p.stealsCount || 0;
                     const isMaxed = used >= 4;

                     return (
                       <tr key={p.id} className="hover:bg-zinc-800/50">
                         <td className="p-3">
                           <input 
                             value={p.name} 
                             onChange={e => handleUpdatePlayer(p.id, 'name', e.target.value)}
                             className="bg-transparent text-white font-bold outline-none border-b border-transparent focus:border-gold-500 w-full"
                           />
                         </td>
                         <td className="p-3">
                           <input 
                             type="number"
                             value={p.score} 
                             onChange={e => handleUpdatePlayer(p.id, 'score', parseInt(e.target.value) || 0)}
                             className="bg-transparent text-gold-400 font-mono outline-none border-b border-transparent focus:border-gold-500 w-24"
                           />
                         </td>
                         <td className="p-3 text-center">
                           <span className="text-purple-300 font-mono font-bold">{steals}</span>
                         </td>
                         <td className="p-3 flex items-center justify-center gap-3">
                            <button
                              type="button"
                              onClick={() => !isMaxed && handleUseWildcard(p)}
                              disabled={isMaxed}
                              className={`
                                flex items-center gap-2 px-3 py-1 rounded text-[10px] font-bold uppercase transition-all
                                ${isMaxed 
                                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700' 
                                  : 'bg-gold-600/20 text-gold-500 hover:bg-gold-600/40 border border-gold-600/50'}
                              `}
                              title={isMaxed ? "Limit Reached" : "Increment Wildcard Usage"}
                            >
                              <Star className={`w-3 h-3 ${isMaxed ? 'text-zinc-500' : 'text-gold-500 fill-gold-500'}`} />
                              {isMaxed ? 'MAX 4 USED' : 'Use Wildcard'}
                            </button>
                            <span className={`text-[10px] font-bold font-mono ${isMaxed ? 'text-red-500' : 'text-zinc-500'}`}>
                              {used}/4
                            </span>
                         </td>
                         <td className="p-3 text-right">
                           <button 
                              type="button"
                              onClick={() => {
                                if(confirm('Remove player?')) {
                                  soundService.playClick();
                                  onUpdateState({...gameState, players: gameState.players.filter(x => x.id !== p.id)});
                                }
                              }}
                              className="text-zinc-600 hover:text-red-500 p-1"
                           >
                             <X className="w-4 h-4" />
                           </button>
                         </td>
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
               {gameState.players.length === 0 && <div className="p-4 text-center text-zinc-600">No players.</div>}
             </div>
          </div>
        )}

        {/* === CONFIG EDITOR === */}
        {activeTab === 'GAME' && (
          <div className="max-w-xl mx-auto space-y-6">
             <h3 className="text-gold-500 font-bold uppercase tracking-widest text-sm">Production Settings</h3>
             <div className="space-y-2">
               <label className="text-xs uppercase text-zinc-500 font-bold">Show Title</label>
               <input 
                 value={gameState.showTitle}
                 onChange={e => handleUpdateTitle(e.target.value)}
                 className="w-full bg-black border border-zinc-800 p-3 rounded text-white focus:border-gold-500 outline-none font-bold"
               />
             </div>
             <div className="p-4 bg-zinc-900 rounded border border-zinc-800 text-xs text-zinc-400">
               <p className="mb-2 font-bold text-zinc-300">Session Info</p>
               <p>Game Started: {gameState.isGameStarted ? 'Yes' : 'No'}</p>
               <p>Questions Remaining: {gameState.categories.reduce((acc, c) => acc + c.questions.filter(q => !q.isAnswered && !q.isVoided).length, 0)}</p>
             </div>
          </div>
        )}

      </div>

      {/* QUESTION EDIT MODAL */}
      {editingQuestion && (() => {
        const { cIdx, qIdx } = editingQuestion;
        const cat = gameState.categories[cIdx];
        const q = cat.questions[qIdx];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-zinc-900 border border-gold-500/50 rounded-xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2">
                <div>
                  <h3 className="text-gold-500 font-bold">{cat.title} // {q.points}</h3>
                  {q.isVoided && <span className="text-red-500 text-xs font-bold uppercase tracking-wider">Currently Voided</span>}
                </div>
                <button type="button" onClick={() => { soundService.playClick(); setEditingQuestion(null); }} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                <div>
                  <label className="text-xs uppercase text-zinc-500 font-bold">Question Text</label>
                  <textarea 
                    id="dir-q-text"
                    defaultValue={q.text}
                    className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-24 focus:border-gold-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-zinc-500 font-bold">Answer</label>
                  <textarea 
                    id="dir-q-answer"
                    defaultValue={q.answer}
                    className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-16 focus:border-gold-500 outline-none font-bold"
                  />
                </div>
                
                {/* AI Tools */}
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
                  <p className="text-xs text-zinc-500 uppercase font-bold mb-2 flex items-center gap-2">
                    <Wand2 className="w-3 h-3" /> AI Replacement
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleAiReplace(cIdx, qIdx, 'easy')} disabled={aiLoading} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded">Easy</button>
                    <button type="button" onClick={() => handleAiReplace(cIdx, qIdx, 'medium')} disabled={aiLoading} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded">Med</button>
                    <button type="button" onClick={() => handleAiReplace(cIdx, qIdx, 'hard')} disabled={aiLoading} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded">Hard</button>
                  </div>
                  {aiLoading && <div className="mt-2 text-center text-xs text-gold-500 animate-pulse">Generating...</div>}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
                <button type="button" onClick={() => { soundService.playClick(); setEditingQuestion(null); }} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">Cancel</button>
                <button 
                  type="button"
                  onClick={() => {
                     const txt = (document.getElementById('dir-q-text') as HTMLTextAreaElement).value;
                     const ans = (document.getElementById('dir-q-answer') as HTMLTextAreaElement).value;
                     
                     // Prepare update object
                     const updates: Partial<Question> = { text: txt, answer: ans };
                     
                     // If the question was voided, explicitly reset the state to unlock it
                     if (q.isVoided) {
                        updates.isVoided = false;
                        updates.isAnswered = false;
                        updates.isRevealed = false;
                     }
                     
                     handleSaveQuestion(cIdx, qIdx, updates);
                  }}
                  className="bg-gold-600 hover:bg-gold-500 text-black font-bold px-6 py-2 rounded flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {q.isVoided ? 'Replace & Unlock' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
