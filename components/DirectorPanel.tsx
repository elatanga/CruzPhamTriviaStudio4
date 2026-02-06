
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Settings, Users, Grid, Edit, Save, X, RefreshCw, Wand2, MonitorOff, ExternalLink, RotateCcw, Play, Pause, Timer, Type, Layout, Star, Trash2, AlertTriangle, UserPlus, Check, BarChart3, Info, Hash, Clock, History, Copy, Trash, Download, ChevronDown, ChevronUp, Sparkles, Sliders, Loader2 } from 'lucide-react';
import { GameState, Question, Difficulty, Category, BoardViewSettings, Player, PlayEvent, AnalyticsEventType, GameAnalyticsEvent } from '../types';
import { generateSingleQuestion, generateCategoryQuestions } from '../services/geminiService';
import { logger } from '../services/logger';
import { soundService } from '../services/soundService';
import { normalizePlayerName, applyAiCategoryPreservePoints } from '../services/utils';
import { DirectorAiRegenerator } from './DirectorAiRegenerator';
import { DirectorSettingsPanel } from './DirectorSettingsPanel';

interface Props {
  gameState: GameState;
  onUpdateState: (newState: GameState) => void;
  emitGameEvent: (type: AnalyticsEventType, payload: Partial<GameAnalyticsEvent>) => void;
  onPopout?: () => void;
  isPoppedOut?: boolean;
  onBringBack?: () => void;
  addToast: (type: any, msg: string) => void;
  onClose?: () => void;
}

export const DirectorPanel: React.FC<Props> = ({ 
  gameState, onUpdateState, emitGameEvent, onPopout, isPoppedOut, onBringBack, addToast, onClose 
}) => {
  const [activeTab, setActiveTab] = useState<'GAME' | 'PLAYERS' | 'BOARD' | 'STATS' | 'SETTINGS'>('BOARD');
  const [editingQuestion, setEditingQuestion] = useState<{cIdx: number, qIdx: number} | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [confirmResetAllWildcards, setConfirmResetAllWildcards] = useState(false);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  const [processingWildcards, setProcessingWildcards] = useState<Set<string>>(new Set());
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');

  useEffect(() => {
    if (logContainerRef.current && isLogsExpanded) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [gameState.events, isLogsExpanded]);

  const boardStats = useMemo(() => {
    const allQs = (gameState.categories || []).flatMap(c => c.questions);
    const total = allQs.length;
    const answered = allQs.filter(q => q.isAnswered).length;
    const voided = allQs.filter(q => q.isVoided).length;
    const doubles = allQs.filter(q => q.isDoubleOrNothing).length;
    const remaining = total - (answered + voided);
    const progress = total > 0 ? (answered / total) * 100 : 0;
    return { total, answered, voided, remaining, progress, doubles };
  }, [gameState.categories]);

  // --- AI ACTIONS ---

  const handleAiRewriteCategory = async (cIdx: number) => {
    if (aiLoading) return;
    soundService.playClick();
    const cat = gameState.categories[cIdx];
    const genId = crypto.randomUUID();
    
    setAiLoading(true);
    addToast('info', `AI is rewriting ${cat.title}...`);
    
    logger.info('director_ai_category_regen_start', { categoryId: cat.id, categoryName: cat.title, genId });
    emitGameEvent('AI_CATEGORY_REPLACE_START', { actor: { role: 'director' }, context: { categoryIndex: cIdx, categoryName: cat.title } });

    try {
      const newQs = await generateCategoryQuestions(
        gameState.showTitle || "General Trivia", 
        cat.title, 
        cat.questions.length, 
        'mixed', 
        100, 
        genId
      );

      const nextCategories = [...gameState.categories];
      nextCategories[cIdx] = applyAiCategoryPreservePoints(cat, newQs);

      onUpdateState({ ...gameState, categories: nextCategories });
      
      logger.info('director_ai_category_regen_success', { categoryId: cat.id, preservedPointScale: true, genId });
      emitGameEvent('AI_CATEGORY_REPLACE_APPLIED', { actor: { role: 'director' }, context: { categoryIndex: cIdx } });
      addToast('success', `${cat.title} updated.`);
    } catch (e: any) {
      logger.error('director_ai_category_regen_failed', { categoryId: cat.id, error: e.message, genId });
      emitGameEvent('AI_CATEGORY_REPLACE_FAILED', { actor: { role: 'director' }, context: { note: e.message } });
      addToast('error', 'AI rewrite failed.');
    } finally {
      setAiLoading(false);
    }
  };

  // --- SETTINGS ACTIONS ---

  const updateViewSettings = (updates: Partial<BoardViewSettings>) => {
    emitGameEvent('VIEW_SETTINGS_CHANGED', { actor: { role: 'director' }, context: { after: updates } });
    onUpdateState({
      ...gameState,
      viewSettings: {
        ...gameState.viewSettings,
        ...updates,
        updatedAt: new Date().toISOString()
      }
    });
  };

  const handleUpdatePlayer = (id: string, field: 'name' | 'score', value: string | number) => {
    const oldP = gameState.players.find(p => p.id === id);
    let finalValue = value;
    if (field === 'name') {
       finalValue = normalizePlayerName(value as string);
       if (!finalValue) return;
       emitGameEvent('PLAYER_EDITED', { actor: { role: 'director' }, context: { playerId: id, playerName: finalValue, before: oldP?.name } });
    }
    const newPlayers = gameState.players.map(p => p.id === id ? { ...p, [field]: finalValue } : p);
    onUpdateState({ ...gameState, players: newPlayers });
  };

  const handleUseWildcard = async (playerId: string) => {
    const targetPlayer = gameState.players.find(p => p.id === playerId);
    if (!targetPlayer) return;
    const nextCount = Math.min(4, (targetPlayer.wildcardsUsed || 0) + 1);
    setProcessingWildcards(prev => new Set(prev).add(playerId));
    soundService.playClick();
    onUpdateState({ ...gameState, players: gameState.players.map(p => p.id === playerId ? { ...p, wildcardsUsed: nextCount } : p) });
    emitGameEvent('WILDCARD_USED', { actor: { role: 'director' }, context: { playerName: targetPlayer.name, playerId: targetPlayer.id, delta: nextCount } });
    setProcessingWildcards(prev => { const n = new Set(prev); n.delete(playerId); return n; });
  };

  const handleUpdateCategoryTitle = (cIdx: number, val: string) => {
    const nextCategories = [...gameState.categories];
    nextCategories[cIdx] = { ...nextCategories[cIdx], title: val };
    onUpdateState({ ...gameState, categories: nextCategories });
  };

  const handleDirectorAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = normalizePlayerName(newPlayerName);
    if (!finalName) return;
    
    let uniqueName = finalName;
    let count = 2;
    const existingNames = gameState.players.map(p => p.name.toUpperCase());
    while (existingNames.includes(uniqueName)) {
      uniqueName = `${finalName} ${count}`;
      count++;
    }
    
    const newPlayer: Player = { id: crypto.randomUUID(), name: uniqueName, score: 0, color: '#fff', wildcardsUsed: 0, wildcardActive: false, stealsCount: 0 };
    onUpdateState({ ...gameState, players: [...gameState.players, newPlayer] });
    emitGameEvent('PLAYER_ADDED', { actor: { role: 'director' }, context: { playerName: uniqueName, playerId: newPlayer.id } });
    setNewPlayerName('');
    setIsAddingPlayer(false);
    addToast('success', `Added ${uniqueName}`);
  };

  const handleResetAllWildcards = () => {
    if (!confirmResetAllWildcards) {
      setConfirmResetAllWildcards(true);
      setTimeout(() => setConfirmResetAllWildcards(false), 3000);
      return;
    }
    onUpdateState({
      ...gameState,
      players: gameState.players.map(p => ({ ...p, wildcardsUsed: 0, wildcardActive: false }))
    });
    emitGameEvent('WILDCARD_RESET', { actor: { role: 'director' } });
    setConfirmResetAllWildcards(false);
    addToast('info', 'All wildcards reset.');
  };

  const handleDeletePlayer = (player: Player) => {
    if (confirm(`Remove ${player.name} from the game?`)) {
      const nextPlayers = gameState.players.filter(p => p.id !== player.id);
      let nextSelectedId = gameState.selectedPlayerId;
      if (nextSelectedId === player.id) {
        nextSelectedId = nextPlayers.length > 0 ? nextPlayers[0].id : null;
      }
      onUpdateState({ ...gameState, players: nextPlayers, selectedPlayerId: nextSelectedId });
      emitGameEvent('PLAYER_REMOVED', { actor: { role: 'director' }, context: { playerName: player.name, playerId: player.id } });
      addToast('info', `${player.name} removed.`);
    }
  };

  const handleSaveQuestion = (cIdx: number, qIdx: number, updates: Partial<Question>) => {
    const nextCategories = [...gameState.categories];
    const cat = nextCategories[cIdx];
    const nextQs = [...cat.questions];
    const oldQ = nextQs[qIdx];
    nextQs[qIdx] = { ...oldQ, ...updates };
    nextCategories[cIdx] = { ...cat, questions: nextQs };
    
    onUpdateState({ ...gameState, categories: nextCategories });
    emitGameEvent('QUESTION_EDITED', { 
      actor: { role: 'director' }, 
      context: { 
        tileId: oldQ.id, 
        categoryName: cat.title,
        before: { text: oldQ.text, answer: oldQ.answer },
        after: { text: updates.text, answer: updates.answer }
      } 
    });
    setEditingQuestion(null);
    addToast('success', 'Tile updated.');
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-white relative">
      <div className="flex-none h-14 border-b border-zinc-800 flex items-center px-4 justify-between bg-black">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button onClick={() => setActiveTab('BOARD')} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 shrink-0 ${activeTab === 'BOARD' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Grid className="w-4 h-4" /> Board
          </button>
          <button onClick={() => setActiveTab('PLAYERS')} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 shrink-0 ${activeTab === 'PLAYERS' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Users className="w-4 h-4" /> Players
          </button>
          <button onClick={() => setActiveTab('SETTINGS')} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 shrink-0 ${activeTab === 'SETTINGS' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Sliders className="w-4 h-4" /> Settings
          </button>
          <button onClick={() => setActiveTab('STATS')} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 shrink-0 ${activeTab === 'STATS' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <BarChart3 className="w-4 h-4" /> Analytics
          </button>
        </div>
        <div className="flex items-center gap-2">
          {onPopout && <button onClick={onPopout} className="hidden md:flex items-center gap-2 text-xs font-bold uppercase text-gold-500 border border-gold-900/50 px-3 py-1.5 rounded hover:bg-gold-900/20"><ExternalLink className="w-3 h-3" /> Detach</button>}
          {onClose && <button onClick={onClose} className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded hover:bg-zinc-900 transition-colors"><X className="w-4 h-4" /> Close</button>}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        {activeTab === 'SETTINGS' && (
          <DirectorSettingsPanel 
            settings={gameState.viewSettings} 
            onUpdateSettings={updateViewSettings} 
          />
        )}

        {activeTab === 'BOARD' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <DirectorAiRegenerator gameState={gameState} onUpdateState={onUpdateState} addToast={addToast} />
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gameState.categories.length}, minmax(180px, 1fr))` }}>
              {gameState.categories.map((cat, cIdx) => (
                <div key={cat.id} className="space-y-3">
                  <div className="group relative">
                    <input value={cat.title} onChange={e => handleUpdateCategoryTitle(cIdx, e.target.value)} className="bg-zinc-900 text-gold-400 font-bold text-xs p-2 rounded w-full border border-transparent focus:border-gold-500 outline-none pr-8" />
                    <button onClick={() => handleAiRewriteCategory(cIdx)} className="absolute right-1 top-1 p-1 text-zinc-600 hover:text-purple-400 transition-colors" title="Regenerate this category only"><Wand2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {cat.questions.map((q, qIdx) => (
                    <div key={q.id} onClick={() => setEditingQuestion({cIdx, qIdx})} className={`p-3 rounded border flex flex-col gap-1 cursor-pointer transition-all hover:brightness-110 relative ${q.isVoided ? 'bg-red-900/20 border-red-800' : q.isAnswered ? 'bg-zinc-900 border-zinc-800 opacity-60' : 'bg-zinc-800 border-zinc-700'}`}>
                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500"><span>{q.points}</span>{q.isVoided && <span className="text-red-500 font-bold uppercase">Void</span>}{q.isDoubleOrNothing && <span className="text-gold-500 font-bold">2x</span>}</div>
                      <p className="text-xs text-zinc-300 line-clamp-2 leading-tight font-bold">{q.text}</p>
                      <div className="mt-2 pt-2 border-t border-zinc-700/40">
                        <span className="text-[9px] text-zinc-500 uppercase font-black block tracking-widest leading-none mb-1">Answer</span>
                        <p className={`text-[10px] leading-tight font-roboto-bold ${q.answer ? 'text-gold-400' : 'text-zinc-600 italic'}`}>{q.answer || '(MISSING)'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'PLAYERS' && (
          <div className="max-w-4xl mx-auto space-y-4">
             <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
               <h3 className="text-gold-500 font-bold uppercase tracking-widest text-sm">Contestant Management</h3>
               <div className="flex items-center gap-2">
                 {!isAddingPlayer ? (
                   <button onClick={() => { if(gameState.players.length < 8) { soundService.playClick(); setIsAddingPlayer(true); }}} disabled={gameState.players.length >= 8} className="flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase bg-zinc-900 border border-zinc-700 text-gold-500 hover:text-gold-400 disabled:opacity-50 disabled:cursor-not-allowed"><UserPlus className="w-3 h-3" /> Add Player</button>
                 ) : (
                   <form onSubmit={handleDirectorAddPlayer} className="flex items-center gap-2 bg-black p-1 rounded border border-gold-500 animate-in slide-in-from-right-2">
                     <input autoFocus value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} placeholder="PLAYER NAME" className="bg-transparent text-xs text-white px-2 py-1 outline-none w-32 uppercase" />
                     <button type="submit" className="p-1 text-green-500 hover:text-green-400"><Check className="w-4 h-4" /></button>
                     <button type="button" onClick={() => setIsAddingPlayer(false)} className="p-1 text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
                   </form>
                 )}
                 <button onClick={handleResetAllWildcards} className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase border transition-all ${confirmResetAllWildcards ? 'bg-red-600 border-red-500 text-white animate-pulse' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'}`}><RotateCcw className="w-3 h-3" /> {confirmResetAllWildcards ? 'Click to Confirm Reset All' : 'Reset All Wildcards'}</button>
               </div>
             </div>
             <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
               <table className="w-full text-left text-sm">
                 <thead className="bg-black text-zinc-500 uppercase font-mono text-xs">
                   <tr><th className="p-3">Name</th><th className="p-3">Score</th><th className="p-3 text-center">Steals</th><th className="p-3 text-center">Wildcard</th><th className="p-3 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-zinc-800">
                   {gameState.players.map(p => (
                     <tr key={p.id} className="hover:bg-zinc-800/50 transition-colors">
                       <td className="p-3"><input value={p.name.toUpperCase()} onChange={e => handleUpdatePlayer(p.id, 'name', e.target.value)} className="bg-transparent text-white font-bold outline-none border-b border-transparent focus:border-gold-500 w-full" /></td>
                       <td className="p-3"><input type="number" value={p.score} onChange={e => handleUpdatePlayer(p.id, 'score', parseInt(e.target.value) || 0)} className="bg-transparent text-gold-400 font-mono outline-none border-b border-transparent focus:border-gold-500 w-24" /></td>
                       <td className="p-3 text-center"><span className="text-purple-300 font-mono font-bold">{p.stealsCount || 0}</span></td>
                       <td className="p-3">
                          <div className="flex items-center justify-center gap-3">
                            <button onClick={() => handleUseWildcard(p.id)} disabled={(p.wildcardsUsed || 0) >= 4 || processingWildcards.has(p.id)} className={`flex items-center gap-2 px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${(p.wildcardsUsed || 0) >= 4 ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' : 'bg-gold-600/20 text-gold-500 hover:bg-gold-600/40 border border-gold-600/50'}`}>
                              {processingWildcards.has(p.id) ? <RefreshCw className="w-3 h-3 animate-spin"/> : <Star className={`w-3 h-3 ${(p.wildcardsUsed || 0) >= 4 ? 'text-zinc-500' : 'text-gold-500 fill-gold-500'}`} />}
                              { (p.wildcardsUsed || 0) >= 4 ? 'MAX 4 USED' : `${p.wildcardsUsed || 0}/4` }
                            </button>
                          </div>
                       </td>
                       <td className="p-3 text-right"><button onClick={() => handleDeletePlayer(p)} className="text-zinc-600 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button></td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        )}
      </div>

      {editingQuestion && (() => {
        const { cIdx, qIdx } = editingQuestion;
        const cat = gameState.categories[cIdx];
        const q = cat.questions[qIdx];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-zinc-900 border border-gold-500/50 rounded-xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2"><div><h3 className="text-gold-500 font-bold">{cat.title} // {q.points}</h3></div><button onClick={() => setEditingQuestion(null)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button></div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                <div><label className="text-xs uppercase text-zinc-500 font-bold">Question</label><textarea id="dir-q-text" defaultValue={q.text} className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-24 focus:border-gold-500 outline-none font-bold" /></div>
                <div><label className="text-xs uppercase text-zinc-500 font-bold">Answer</label><textarea id="dir-q-answer" defaultValue={q.answer} className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-16 focus:border-gold-500 outline-none font-bold" /></div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
                <button onClick={() => setEditingQuestion(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">Cancel</button>
                <button onClick={() => { const txt = (document.getElementById('dir-q-text') as HTMLTextAreaElement).value; const ans = (document.getElementById('dir-q-answer') as HTMLTextAreaElement).value; handleSaveQuestion(cIdx, qIdx, { text: txt, answer: ans, isVoided: false }); }} className="bg-gold-600 hover:bg-gold-500 text-black font-bold px-6 py-2 rounded flex items-center gap-2"><Save className="w-4 h-4" />Save Changes</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
