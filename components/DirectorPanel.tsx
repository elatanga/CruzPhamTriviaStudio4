
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Settings, Users, Grid, Edit, Save, X, RefreshCw, Wand2, MonitorOff, ExternalLink, RotateCcw, Play, Pause, Timer, Type, Layout, Star, Trash2, AlertTriangle, UserPlus, Check, BarChart3, Info, Hash, Clock, History, Copy, Trash, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { GameState, Question, Difficulty, Category, BoardViewSettings, Player, PlayEvent, AnalyticsEventType, GameAnalyticsEvent } from '../types';
import { generateSingleQuestion, generateCategoryQuestions } from '../services/geminiService';
import { logger } from '../services/logger';
import { soundService } from '../services/soundService';
import { normalizePlayerName } from '../services/utils';

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
  const [activeTab, setActiveTab] = useState<'GAME' | 'PLAYERS' | 'BOARD' | 'STATS'>('BOARD');
  const [editingQuestion, setEditingQuestion] = useState<{cIdx: number, qIdx: number} | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [confirmResetAllWildcards, setConfirmResetAllWildcards] = useState(false);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  // Add Player State
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');

  // Auto-scroll logs to bottom on new event if expanded
  useEffect(() => {
    if (logContainerRef.current && isLogsExpanded) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [gameState.events, isLogsExpanded]);

  // --- SELECTORS ---
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

  const activeQuestionInfo = useMemo(() => {
    if (!gameState.activeQuestionId) return null;
    const cat = gameState.categories.find(c => c.id === gameState.activeCategoryId);
    const q = cat?.questions.find(q => q.id === gameState.activeQuestionId);
    return { catTitle: cat?.title, points: q?.points, isRevealed: q?.isRevealed };
  }, [gameState.activeQuestionId, gameState.activeCategoryId, gameState.categories]);

  // --- ACTIONS ---

  const handleUpdateTitle = (title: string) => {
    onUpdateState({ ...gameState, showTitle: title });
  };

  const handleUpdatePlayer = (id: string, field: 'name' | 'score', value: string | number) => {
    const oldP = gameState.players.find(p => p.id === id);
    let finalValue = value;
    
    if (field === 'name') {
       finalValue = normalizePlayerName(value as string);
       // Skip update if empty
       if (!finalValue) return;
       emitGameEvent('PLAYER_EDITED', { actor: { role: 'director' }, context: { playerId: id, playerName: finalValue, before: oldP?.name } });
    }
    
    const newPlayers = gameState.players.map(p => 
      p.id === id ? { ...p, [field]: finalValue } : p
    );
    onUpdateState({ ...gameState, players: newPlayers });
  };

  const handleDeletePlayer = (p: Player) => {
    const ts = new Date().toISOString();
    try {
      logger.info("player_delete_click", { playerId: p.id, name: p.name, ts });
      
      if (!p.id) {
        logger.error("player_delete_failed", { playerId: "undefined", message: "Missing Player ID", ts });
        addToast('error', 'DELETE FAILED — RETRY');
        return;
      }

      soundService.playClick();
      if (!confirm(`Are you sure you want to permanently remove ${p.name}?`)) {
        return;
      }

      const updatedPlayers = (gameState.players || []).filter(x => x.id !== p.id);
      
      // If we deleted the selected player, move selection to someone else or null
      let newSelectedId = gameState.selectedPlayerId;
      if (gameState.selectedPlayerId === p.id) {
        newSelectedId = updatedPlayers.length > 0 ? updatedPlayers[0].id : null;
      }

      onUpdateState({
        ...gameState,
        players: updatedPlayers,
        selectedPlayerId: newSelectedId
      });

      emitGameEvent('PLAYER_REMOVED', { 
        actor: { role: 'director' }, 
        context: { playerName: p.name, playerId: p.id, note: 'Player removed from roster' } 
      });

      logger.info("player_delete_success", { playerId: p.id, ts: new Date().toISOString() });
      addToast('success', 'PLAYER REMOVED');
    } catch (err: any) {
      logger.error("player_delete_failed", { playerId: p.id, message: err.message, ts: new Date().toISOString() });
      addToast('error', 'DELETE FAILED — RETRY');
    }
  };

  const handleDirectorAddPlayer = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const finalName = normalizePlayerName(newPlayerName);
    
    if (!finalName || finalName.length < 2) {
      addToast('error', 'ENTER PLAYER NAME');
      logger.warn('director_player_add_skipped_empty_name', { input: newPlayerName });
      return;
    }

    if (gameState.players.length >= 8) {
      addToast('error', 'Maximum 8 players reached.');
      return;
    }

    let uniqueName = finalName;
    let count = 2;
    const existingNames = gameState.players.map(p => p.name.toUpperCase());
    while (existingNames.includes(uniqueName)) {
      uniqueName = `${finalName} ${count}`;
      count++;
    }

    const newPlayer: Player = { 
      id: crypto.randomUUID(), 
      name: uniqueName, 
      score: 0, 
      color: '#fff', 
      wildcardsUsed: 0, 
      wildcardActive: false, 
      stealsCount: 0 
    };

    soundService.playClick();
    const newPlayers = [...gameState.players, newPlayer];
    
    emitGameEvent('PLAYER_ADDED', {
       actor: { role: 'director' },
       context: { playerName: uniqueName, playerId: newPlayer.id, note: 'Contestant added via Producer Panel' }
    });

    onUpdateState({ 
      ...gameState, 
      players: newPlayers,
      selectedPlayerId: gameState.selectedPlayerId || newPlayer.id 
    });

    addToast('success', `Added ${uniqueName}`);
    setNewPlayerName('');
    setIsAddingPlayer(false);
  };

  const handleUseWildcard = (player: Player) => {
    soundService.playClick();
    const currentUsed = player.wildcardsUsed || 0;
    
    if (currentUsed >= 4) {
      addToast('error', 'Max wildcards (4) reached.');
      return;
    }

    const nextUsed = currentUsed + 1;
    const newPlayers = gameState.players.map(p => 
      p.id === player.id ? { ...p, wildcardsUsed: nextUsed } : p
    );
    
    emitGameEvent('WILDCARD_USED', {
      actor: { role: 'director' },
      context: { playerName: player.name, playerId: player.id, delta: nextUsed }
    });

    onUpdateState({ ...gameState, players: newPlayers });
    addToast('success', `${player.name}: Wildcard Used (${nextUsed}/4)`);
  };

  const handleResetWildcard = (player: Player) => {
    if (!player.wildcardsUsed || player.wildcardsUsed <= 0) return;
    
    soundService.playClick();
    const newPlayers = gameState.players.map(p => 
      p.id === player.id ? { ...p, wildcardsUsed: 0 } : p
    );
    
    emitGameEvent('WILDCARD_RESET', {
       actor: { role: 'director' },
       context: { playerName: player.name, playerId: player.id }
    });

    onUpdateState({ ...gameState, players: newPlayers });
    addToast('info', `Wildcards reset for ${player.name}`);
  };

  const handleResetAllWildcards = () => {
    if (!confirmResetAllWildcards) {
      soundService.playClick();
      setConfirmResetAllWildcards(true);
      setTimeout(() => setConfirmResetAllWildcards(false), 3000); 
      return;
    }

    soundService.playClick();
    const newPlayers = gameState.players.map(p => ({ ...p, wildcardsUsed: 0 }));
    onUpdateState({ ...gameState, players: newPlayers });
    
    emitGameEvent('WILDCARD_RESET', {
       actor: { role: 'director' },
       context: { note: 'Global bulk reset' }
    });

    addToast('success', 'All wildcards reset');
    setConfirmResetAllWildcards(false);
  };

  const handleUpdateCategoryTitle = (cIdx: number, title: string) => {
    const oldTitle = gameState.categories[cIdx].title;
    emitGameEvent('CATEGORY_RENAMED', {
       actor: { role: 'director' },
       context: { categoryIndex: cIdx, categoryName: title, before: oldTitle }
    });
    const newCats = [...gameState.categories];
    newCats[cIdx].title = title;
    onUpdateState({ ...gameState, categories: newCats });
  };

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
    soundService.playClick();
  };

  const updateTimer = (updates: Partial<typeof gameState.timer>) => {
    soundService.playClick();
    if (updates.duration) {
      emitGameEvent('TIMER_CONFIG_CHANGED', { actor: { role: 'director' }, context: { delta: updates.duration } });
    }
    onUpdateState({
      ...gameState,
      timer: { ...gameState.timer, ...updates }
    });
  };

  const startTimer = () => {
    emitGameEvent('TIMER_STARTED', { actor: { role: 'director' }, context: { points: gameState.timer.duration } });
    updateTimer({
      endTime: Date.now() + (gameState.timer.duration * 1000),
      isRunning: true
    });
  };

  const stopTimer = () => {
    emitGameEvent('TIMER_STOPPED', { actor: { role: 'director' } });
    updateTimer({ isRunning: false });
  };

  const resetTimer = () => {
    emitGameEvent('TIMER_RESET', { actor: { role: 'director' } });
    updateTimer({ endTime: null, isRunning: false });
  };

  const handleSaveQuestion = (cIdx: number, qIdx: number, q: Partial<Question>) => {
    soundService.playClick();
    const newCats = [...gameState.categories];
    const oldQ = newCats[cIdx].questions[qIdx];
    
    emitGameEvent('QUESTION_EDITED', {
       actor: { role: 'director' },
       context: { tileId: oldQ.id, categoryName: newCats[cIdx].title, points: oldQ.points }
    });

    const isUnvoiding = oldQ.isVoided && !q.isVoided && q.isVoided !== undefined;
    
    newCats[cIdx].questions[qIdx] = { 
      ...oldQ, 
      ...q,
      isVoided: q.isVoided !== undefined ? q.isVoided : oldQ.isVoided,
      isAnswered: isUnvoiding ? false : (q.isAnswered ?? oldQ.isAnswered),
      isRevealed: isUnvoiding ? false : (q.isRevealed ?? oldQ.isRevealed)
    };
    
    onUpdateState({ ...gameState, categories: newCats });
    setEditingQuestion(null);
  };

  const handleAiReplace = async (cIdx: number, qIdx: number, difficulty: Difficulty) => {
    soundService.playClick();
    setAiLoading(true);
    const cat = gameState.categories[cIdx];
    const q = cat.questions[qIdx];
    emitGameEvent('AI_TILE_REPLACE_START', { actor: { role: 'director' }, context: { tileId: q.id, points: q.points } });
    try {
      const result = await generateSingleQuestion(gameState.showTitle, q.points, cat.title, difficulty);
      emitGameEvent('AI_TILE_REPLACE_APPLIED', { actor: { role: 'director' }, context: { tileId: q.id, points: q.points } });
      handleSaveQuestion(cIdx, qIdx, {
        text: result.text,
        answer: result.answer,
        isVoided: false,
        isAnswered: false,
        isRevealed: false
      });
      addToast('success', 'AI Generation Complete');
    } catch (e: any) {
      emitGameEvent('AI_TILE_REPLACE_FAILED', { actor: { role: 'director' }, context: { tileId: q.id, message: e.message } });
      addToast('error', 'AI Failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiRewriteCategory = async (cIdx: number) => {
    soundService.playClick();
    if (!confirm('Rewrite category?')) return;
    setAiLoading(true);
    const cat = gameState.categories[cIdx];
    emitGameEvent('AI_CATEGORY_REPLACE_START', { actor: { role: 'director' }, context: { categoryIndex: cIdx, categoryName: cat.title } });
    try {
      const newQs = await generateCategoryQuestions(gameState.showTitle, cat.title, cat.questions.length, 'mixed');
      const newCats = [...gameState.categories];
      newCats[cIdx].questions = newQs.map((nq, i) => ({
        ...nq,
        points: (i + 1) * 100,
        id: cat.questions[i]?.id || nq.id
      }));
      emitGameEvent('AI_CATEGORY_REPLACE_APPLIED', { actor: { role: 'director' }, context: { categoryIndex: cIdx, categoryName: cat.title } });
      onUpdateState({ ...gameState, categories: newCats });
      addToast('success', 'Category Rewritten');
    } catch (e: any) {
      emitGameEvent('AI_CATEGORY_REPLACE_FAILED', { actor: { role: 'director' }, context: { categoryIndex: cIdx, message: e.message } });
      addToast('error', 'AI Failed.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownloadLogs = () => {
    try {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const datestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
      
      const header = `CRUZPHAM TRIVIA STUDIOS - FULL SESSION LOG\nSHOW: ${gameState.showTitle}\nEXPORTED: ${now.toISOString()}\n--------------------------------------------------\n\n`;
      
      const script = (gameState.events || []).map(ev => {
        const time = new Date(ev.ts).toLocaleTimeString([], { hour12: false });
        const details = Object.entries(ev.context)
           .filter(([_, v]) => v !== undefined)
           .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
           .join(', ');
        return `[${time}] ${ev.type} — ${details}`;
      }).join('\n');

      const blob = new Blob([header + script], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cruzpham-trivia-logs-${datestamp}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      addToast('success', 'Full log history exported.');
    } catch (e: any) {
      logger.error('log_download_failed', { message: e.message });
      addToast('error', 'Failed to generate log download.');
    }
  };

  const handleClearPlayLogs = () => {
    if (confirm('Clear the "Last 4 Plays" feed? This does not affect game scores.')) {
      onUpdateState({ ...gameState, lastPlays: [] });
      addToast('info', 'Play logs cleared.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addToast('success', 'Copied to clipboard');
  };

  // --- RENDER HELPERS ---
  const getEventColor = (type: AnalyticsEventType) => {
    if (type.includes('FAILED') || type === 'TILE_VOIDED' || type === 'PLAYER_REMOVED') return 'text-red-400';
    if (type.includes('AWARDED') || type.includes('STARTED') || type === 'PLAYER_ADDED') return 'text-green-400';
    if (type.includes('AI_')) return 'text-purple-400';
    if (type.includes('STOLEN')) return 'text-orange-400';
    if (type.includes('TIMER')) return 'text-blue-400';
    return 'text-zinc-500';
  };

  if (isPoppedOut) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4 bg-zinc-950">
        <ExternalLink className="w-16 h-16 text-gold-500" />
        <h2 className="text-2xl font-serif text-white">Director is Popped Out</h2>
        <div className="flex gap-3">
          <button type="button" onClick={onBringBack} className="bg-zinc-800 hover:bg-gold-600 hover:text-black text-white px-6 py-2 rounded font-bold uppercase tracking-wider transition-colors">Bring Back</button>
          {onClose && <button type="button" onClick={() => { soundService.playClick(); onClose(); }} className="border border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-white px-6 py-2 rounded font-bold uppercase tracking-wider transition-colors flex items-center gap-2"><X className="w-4 h-4" /> Close Panel</button>}
        </div>
      </div>
    );
  }

  // Analytics event visibility logic: Show last 4 if collapsed, all if expanded (newest at top)
  const events = gameState.events || [];
  const displayedEvents = isLogsExpanded 
    ? [...events].reverse() 
    : [...events].slice(-4).reverse();

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
          <button type="button" onClick={() => { soundService.playClick(); setActiveTab('STATS'); }} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 ${activeTab === 'STATS' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <BarChart3 className="w-4 h-4" /> Analytics
          </button>
          <button type="button" onClick={() => { soundService.playClick(); setActiveTab('GAME'); }} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 ${activeTab === 'GAME' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Settings className="w-4 h-4" /> Config
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          {onPopout && (
            <button type="button" onClick={() => { soundService.playClick(); onPopout(); }} className="flex items-center gap-2 text-xs font-bold uppercase text-gold-500 border border-gold-900/50 px-3 py-1.5 rounded hover:bg-gold-900/20">
              <ExternalLink className="w-3 h-3" /> Detach
            </button>
          )}
          {onClose && (
             <button type="button" onClick={() => { soundService.playClick(); onClose(); }} className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-400 hover:text-red-400 px-3 py-1.5 rounded hover:bg-zinc-900 transition-colors"><X className="w-4 h-4" /> Close</button>
          )}
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        
        {/* === ANALYTICS & STATS DASHBOARD === */}
        {activeTab === 'STATS' && (
          <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
             
             {/* TOP SECTION: SUMMARY & LAST PLAYS */}
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* METRICS COLUMN */}
                <div className="lg:col-span-1 space-y-4">
                  <h3 className="text-gold-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2 border-b border-zinc-800 pb-2">
                    <Info className="w-4 h-4" /> Summary Metrics
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg flex flex-col justify-center h-24">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Answered</p>
                      <span className="text-2xl font-black text-green-500">{boardStats.answered}</span>
                    </div>
                    <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg flex flex-col justify-center h-24">
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Voided</p>
                      <span className="text-2xl font-black text-red-500">{boardStats.voided}</span>
                    </div>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg flex flex-col justify-between h-24">
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Session Progress</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-zinc-950 h-2 rounded-full overflow-hidden">
                        <div className="bg-gold-500 h-full shadow-[0_0_8px_rgba(255,215,0,0.5)] transition-all duration-700" style={{ width: `${boardStats.progress}%` }} />
                      </div>
                      <span className="text-xs font-mono font-bold text-gold-500">{Math.round(boardStats.progress)}%</span>
                    </div>
                  </div>
                </div>

                {/* LAST 4 PLAYS PANEL */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <h3 className="text-gold-500 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                      <History className="w-4 h-4" /> Last 4 Plays
                    </h3>
                    <button onClick={handleClearPlayLogs} className="text-[9px] uppercase font-bold text-zinc-600 hover:text-zinc-400 flex items-center gap-1">
                      <Trash className="w-3 h-3" /> Clear Feed
                    </button>
                  </div>
                  
                  <div className="bg-black border border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-900 min-h-[160px]">
                    {(!gameState.lastPlays || gameState.lastPlays.length === 0) ? (
                      <div className="h-40 flex items-center justify-center text-zinc-700 italic text-xs">
                        No play data captured in this session yet.
                      </div>
                    ) : (
                      gameState.lastPlays.map((play) => {
                        const time = new Date(play.atMs).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const summary = `${play.action} | ${play.categoryName} / ${play.basePoints}`;
                        
                        return (
                          <div key={play.id} className="p-3 flex items-center justify-between group hover:bg-zinc-900/30 transition-colors animate-in slide-in-from-right-2">
                            <div className="flex items-center gap-4 min-w-0">
                              <span className="font-mono text-[10px] text-zinc-600 shrink-0">{time}</span>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-black uppercase px-1.5 rounded ${
                                    play.action === 'AWARD' ? 'bg-green-900/50 text-green-400' :
                                    play.action === 'STEAL' ? 'bg-orange-900/50 text-orange-400' :
                                    play.action === 'VOID' ? 'bg-red-900/50 text-red-400' : 'bg-zinc-800 text-zinc-400'
                                  }`}>
                                    {play.action}
                                  </span>
                                  <span className="text-[11px] font-bold text-zinc-300 truncate">
                                    {play.action === 'AWARD' && <><span className="text-white">{play.awardedPlayerName?.toUpperCase()}</span> <span className="text-green-500">+{play.effectivePoints}</span></>}
                                    {play.action === 'STEAL' && <><span className="text-white">{play.stealerPlayerName?.toUpperCase()}</span> <span className="text-orange-500">+{play.effectivePoints}</span> <span className="text-zinc-600 text-[10px]">(from {play.attemptedPlayerName})</span></>}
                                    {play.action === 'VOID' && <span className="text-red-500 italic">tile disabled</span>}
                                    {play.action === 'RETURN' && <span className="text-zinc-500">returned to board</span>}
                                  </span>
                                </div>
                                <span className="text-[9px] text-zinc-500 uppercase tracking-widest mt-0.5">
                                  {play.categoryName} / {play.basePoints} PTS {play.notes ? `(${play.notes})` : ''}
                                </span>
                              </div>
                            </div>
                            <button 
                              onClick={() => copyToClipboard(summary)} 
                              className="p-1.5 rounded text-zinc-700 hover:text-gold-500 opacity-0 group-hover:opacity-100 transition-all"
                              title="Copy summary"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
             </div>

             {/* FULL TELEMETRY SECTION */}
             <div className="space-y-4 pt-4">
                <div className="flex justify-between items-center px-1">
                   <h4 className="text-[10px] uppercase font-black text-zinc-500 tracking-widest flex items-center gap-2">
                      <Clock className="w-3 h-3" /> System Event Telemetry
                   </h4>
                   <div className="flex gap-4">
                      <button onClick={handleDownloadLogs} className="text-[10px] uppercase font-bold text-zinc-500 hover:text-gold-500 flex items-center gap-1 transition-colors">
                        <Download className="w-3 h-3" /> Export Script
                      </button>
                      <button 
                        onClick={() => { soundService.playClick(); setIsLogsExpanded(!isLogsExpanded); }}
                        className="text-[10px] uppercase font-bold text-gold-600 hover:text-gold-400 flex items-center gap-1 transition-colors"
                      >
                        {isLogsExpanded ? <><ChevronUp className="w-3 h-3" /> Collapse feed</> : <><ChevronDown className="w-3 h-3" /> Expand history</>}
                      </button>
                   </div>
                </div>
                
                <div 
                  ref={logContainerRef}
                  className={`bg-black border border-zinc-800/50 rounded-lg transition-all duration-300 shadow-inner ${isLogsExpanded ? 'max-h-[40vh] p-3 overflow-y-auto' : 'max-h-[120px] p-2 overflow-hidden'}`}
                >
                   {events.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-zinc-700 italic text-xs py-8">
                         Initializing telemetry... Waiting for session activity.
                      </div>
                   ) : (
                      <div className="space-y-1.5">
                        {displayedEvents.map(ev => (
                           <div key={ev.id} className="font-mono text-[10px] border-b border-zinc-900/40 pb-1.5 flex gap-3 animate-in slide-in-from-top-1 group">
                              <span className="text-zinc-600 shrink-0 font-bold select-none">{new Date(ev.ts).toLocaleTimeString([], { hour12: false })}</span>
                              <span className={`font-black shrink-0 uppercase tracking-tighter w-24 truncate ${getEventColor(ev.type)}`}>{ev.type.replace(/_/g, ' ')}</span>
                              <span className="text-zinc-400 group-hover:text-zinc-300 transition-colors truncate">
                                {ev.context.playerName ? <span className="text-gold-500 font-bold">{ev.context.playerName.toUpperCase()} </span> : ''}
                                {ev.context.delta ? <span className={ev.context.delta > 0 ? 'text-green-500' : 'text-red-500'}>({ev.context.delta > 0 ? '+' : ''}{ev.context.delta}) </span> : ''}
                                {ev.context.categoryName ? <span className="opacity-60">| {ev.context.categoryName} </span> : ''}
                                {ev.context.note || ev.context.message || ''}
                              </span>
                           </div>
                        ))}
                      </div>
                   )}
                </div>
             </div>

          </div>
        )}

        {/* === BOARD EDITOR === */}
        {activeTab === 'BOARD' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                   <div className="text-gold-500"><Timer className="w-5 h-5" /></div>
                   <div>
                     <p className="text-xs font-bold uppercase text-zinc-400">Timer Control</p>
                     <div className="flex gap-1 mt-1">
                       {[15, 30, 60].map(d => (
                         <button key={d} type="button" onClick={() => updateTimer({ duration: d })} className={`px-2 py-0.5 text-[10px] rounded border ${gameState.timer.duration === d ? 'bg-gold-600 text-black border-gold-600' : 'bg-black text-zinc-400 border-zinc-800'}`}>{d}s</button>
                       ))}
                     </div>
                   </div>
                </div>
                <div className="flex items-center gap-2">
                  {!gameState.timer.isRunning ? <button type="button" onClick={startTimer} className="bg-green-600 hover:bg-green-500 text-white p-2 rounded-full"><Play className="w-4 h-4" /></button> : <button type="button" onClick={stopTimer} className="bg-yellow-600 hover:bg-yellow-500 text-black p-2 rounded-full"><Pause className="w-4 h-4" /></button>}
                  <button type="button" onClick={resetTimer} className="bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded-full"><RotateCcw className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-lg flex flex-col gap-4">
                 <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Layout className="w-4 h-4 text-gold-500" /><span className="text-xs font-bold uppercase text-zinc-400 tracking-wider">Board View settings</span></div></div>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1"><Type className="w-3 h-3" /> Board Font</label>
                       <div className="flex bg-black p-1 rounded gap-1 border border-zinc-800">
                          {[0.85, 1.0, 1.15, 1.25, 1.35].map((scale, i) => (
                             <button key={scale} type="button" onClick={() => updateViewSettings({ boardFontScale: scale })} className={`flex-1 py-1 text-[9px] font-bold rounded ${gameState.viewSettings?.boardFontScale === scale ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}>{['XS', 'S', 'M', 'L', 'XL'][i]}</button>
                          ))}
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1"><Grid className="w-3 h-3" /> Tile Size</label>
                       <div className="flex bg-black p-1 rounded gap-1 border border-zinc-800">
                          {[0.85, 1.0, 1.15].map((scale, i) => (
                             <button key={scale} type="button" onClick={() => updateViewSettings({ tileScale: scale })} className={`flex-1 py-1 text-[9px] font-bold rounded ${gameState.viewSettings?.tileScale === scale ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}>{['Compact', 'Default', 'Large'][i]}</button>
                          ))}
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold text-zinc-500 uppercase flex items-center gap-1"><Users className="w-3 h-3" /> Scoreboard</label>
                       <div className="flex bg-black p-1 rounded gap-1 border border-zinc-800">
                          {[0.9, 1.0, 1.2, 1.4].map((scale, i) => (
                             <button key={scale} type="button" onClick={() => updateViewSettings({ scoreboardScale: scale })} className={`flex-1 py-1 text-[9px] font-bold rounded ${gameState.viewSettings?.scoreboardScale === scale ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}>{['XS', 'Default', 'Large', 'XL'][i]}</button>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
               <h3 className="text-gold-500 font-bold uppercase tracking-widest text-sm">Live Board Control</h3>
               {gameState.activeQuestionId && <button type="button" onClick={() => { soundService.playClick(); onUpdateState({...gameState, activeQuestionId: null, activeCategoryId: null}); }} className="bg-red-900/50 text-red-200 border border-red-800 px-3 py-1 rounded text-xs font-bold uppercase flex items-center gap-2 hover:bg-red-900"><MonitorOff className="w-3 h-3" /> Force Close Active Q</button>}
            </div>
            
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gameState.categories.length}, minmax(180px, 1fr))` }}>
              {gameState.categories.map((cat, cIdx) => (
                <div key={cat.id} className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <input value={cat.title} onChange={e => handleUpdateCategoryTitle(cIdx, e.target.value)} className="bg-zinc-900 text-gold-400 font-bold text-xs p-2 rounded w-full border border-transparent focus:border-gold-500 outline-none" />
                    <button type="button" onClick={() => handleAiRewriteCategory(cIdx)} className="text-zinc-600 hover:text-purple-400" title="AI Rewrite Category"><Wand2 className="w-3 h-3" /></button>
                  </div>
                  {cat.questions.map((q, qIdx) => (
                    <div key={q.id} onClick={() => { soundService.playClick(); setEditingQuestion({cIdx, qIdx}); }} className={`p-3 rounded border flex flex-col gap-1 cursor-pointer transition-all hover:brightness-110 relative ${q.isVoided ? 'bg-red-900/20 border-red-800' : q.isAnswered ? 'bg-zinc-900 border-zinc-800 opacity-60' : 'bg-zinc-800 border-zinc-700'}`}>
                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500"><span>{q.points}</span>{q.isVoided && <span className="text-red-500 font-bold uppercase">Void</span>}{q.isDoubleOrNothing && <span className="text-gold-500 font-bold">2x</span>}</div>
                      <p className="text-xs text-zinc-300 line-clamp-2 leading-tight font-bold">{q.text}</p>
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
                 <button onClick={handleResetAllWildcards} className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase border transition-all ${confirmResetAllWildcards ? 'bg-red-600 border-red-500 text-white animate-pulse' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'}`}><RotateCcw className="w-3 h-3" /> {confirmResetAllWildcards ? 'Confirm Reset All' : 'Reset Wildcards'}</button>
               </div>
             </div>
             <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
               <table className="w-full text-left text-sm">
                 <thead className="bg-black text-zinc-500 uppercase font-mono text-xs">
                   <tr><th className="p-3">Name</th><th className="p-3">Score</th><th className="p-3 text-center">Steals</th><th className="p-3 text-center">Wildcard</th><th className="p-3 text-right">Actions</th></tr>
                 </thead>
                 <tbody className="divide-y divide-zinc-800">
                   {gameState.players.map(p => (
                     <tr key={p.id} className="hover:bg-zinc-800/50">
                       <td className="p-3"><input value={p.name.toUpperCase()} onChange={e => handleUpdatePlayer(p.id, 'name', e.target.value)} className="bg-transparent text-white font-bold outline-none border-b border-transparent focus:border-gold-500 w-full" /></td>
                       <td className="p-3"><input type="number" value={p.score} onChange={e => handleUpdatePlayer(p.id, 'score', parseInt(e.target.value) || 0)} className="bg-transparent text-gold-400 font-mono outline-none border-b border-transparent focus:border-gold-500 w-24" /></td>
                       <td className="p-3 text-center"><span className="text-purple-300 font-mono font-bold">{p.stealsCount || 0}</span></td>
                       <td className="p-3 flex items-center justify-center gap-3">
                          <button type="button" onClick={() => handleUseWildcard(p)} disabled={(p.wildcardsUsed || 0) >= 4} className={`flex items-center gap-2 px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${(p.wildcardsUsed || 0) >= 4 ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' : 'bg-gold-600/20 text-gold-500 hover:bg-gold-600/40 border border-gold-600/50'}`}><Star className={`w-3 h-3 ${(p.wildcardsUsed || 0) >= 4 ? 'text-zinc-500' : 'text-gold-500 fill-gold-500'}`} />{ (p.wildcardsUsed || 0) >= 4 ? 'MAX' : 'Use' }</button>
                          <button type="button" onClick={() => handleResetWildcard(p)} disabled={!p.wildcardsUsed} className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-zinc-700 disabled:opacity-30"><RotateCcw className="w-3 h-3" /></button>
                       </td>
                       <td className="p-3 text-right"><button type="button" onClick={() => handleDeletePlayer(p)} className="text-zinc-600 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button></td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>
          </div>
        )}

        {/* === CONFIG EDITOR === */}
        {activeTab === 'GAME' && (
          <div className="max-w-xl mx-auto space-y-6">
             <h3 className="text-gold-500 font-bold uppercase tracking-widest text-sm">Production Settings</h3>
             <div className="space-y-2"><label className="text-xs uppercase text-zinc-500 font-bold">Show Title</label><input value={gameState.showTitle} onChange={e => handleUpdateTitle(e.target.value)} className="w-full bg-black border border-zinc-800 p-3 rounded text-white focus:border-gold-500 outline-none font-bold" /></div>
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
              <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2"><div><h3 className="text-gold-500 font-bold">{cat.title} // {q.points}</h3>{q.isVoided && <span className="text-red-500 text-xs font-bold uppercase tracking-wider">Voided</span>}</div><button type="button" onClick={() => { soundService.playClick(); setEditingQuestion(null); }} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button></div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                <div><label className="text-xs uppercase text-zinc-500 font-bold">Question</label><textarea id="dir-q-text" defaultValue={q.text} className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-24 focus:border-gold-500 outline-none font-bold" /></div>
                <div><label className="text-xs uppercase text-zinc-500 font-bold">Answer</label><textarea id="dir-q-answer" defaultValue={q.answer} className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-16 focus:border-gold-500 outline-none font-bold" /></div>
                <div className="bg-zinc-950 p-3 rounded border border-zinc-800"><p className="text-xs text-zinc-500 uppercase font-bold mb-2 flex items-center gap-2"><Wand2 className="w-3 h-3" /> AI Replace</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={async () => handleAiReplace(cIdx, qIdx, 'easy')} disabled={aiLoading} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded">Easy</button>
                    <button type="button" onClick={async () => handleAiReplace(cIdx, qIdx, 'medium')} disabled={aiLoading} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded">Med</button>
                    <button type="button" onClick={async () => handleAiReplace(cIdx, qIdx, 'hard')} disabled={aiLoading} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-2 rounded">Hard</button>
                  </div>
                  {aiLoading && <div className="mt-2 text-center text-xs text-gold-500 animate-pulse">Generating...</div>}
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
                <button type="button" onClick={() => { soundService.playClick(); setEditingQuestion(null); }} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">Cancel</button>
                <button type="button" onClick={() => { const txt = (document.getElementById('dir-q-text') as HTMLTextAreaElement).value; const ans = (document.getElementById('dir-q-answer') as HTMLTextAreaElement).value; handleSaveQuestion(cIdx, qIdx, { text: txt, answer: ans, isVoided: false }); }} className="bg-gold-600 hover:bg-gold-500 text-black font-bold px-6 py-2 rounded flex items-center gap-2"><Save className="w-4 h-4" />{q.isVoided ? 'Replace & Restore' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
