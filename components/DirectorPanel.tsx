
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Settings, Users, Grid, Edit, Save, X, RefreshCw, Wand2, MonitorOff, ExternalLink, RotateCcw, Play, Pause, Timer, Type, Layout, Star, Trash2, AlertTriangle, UserPlus, Check, BarChart3, Info, Hash, Clock, History, Copy, Trash, Download, ChevronDown, ChevronUp, Sparkles, Sliders, Loader2, Minus, Plus, ShieldAlert } from 'lucide-react';
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
  
  // Per-tile AI state
  const [tileAiDifficulty, setTileAiDifficulty] = useState<Difficulty>("mixed");
  const [tileAiLoading, setTileAiLoading] = useState(false);
  const tileAiGenIdRef = useRef<string | null>(null);
  const tileSnapshotRef = useRef<Category[] | null>(null);
  
  const [processingWildcards, setProcessingWildcards] = useState<Set<string>>(new Set());
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  // --- CLEANUP ON MODAL CLOSE ---
  useEffect(() => {
    if (editingQuestion === null) {
      setTileAiLoading(false);
      tileAiGenIdRef.current = null;
      tileSnapshotRef.current = null;
    }
  }, [editingQuestion]);

  // --- AUDIT LOGS ---
  useEffect(() => {
    if (activeTab === 'PLAYERS') {
      const count = gameState.players?.length || 0;
      logger.info('director_players_render', { count });
      if (count === 0) {
        logger.warn('director_players_missing', { count: 0 });
      }
    }
  }, [activeTab, gameState.players?.length]);

  // --- ACTIONS ---

  const handleUpdatePlayer = (id: string, field: keyof Player, value: any) => {
    try {
      logger.info('director_player_update', { playerId: id, field });
      const nextPlayers = gameState.players.map(p => 
        p.id === id ? { ...p, [field]: value } : p
      );
      onUpdateState({ ...gameState, players: nextPlayers });
    } catch (e: any) {
      logger.error('director_player_update_failed', { error: e.message, playerId: id });
      addToast('error', 'Failed to update contestant');
    }
  };

  const handleUseWildcard = (id: string) => {
    const p = gameState.players.find(x => x.id === id);
    if (!p) return;
    
    const used = p.wildcardsUsed || 0;
    if (used >= 4) {
      addToast('error', 'Player reached maximum wildcards');
      return;
    }

    soundService.playClick();
    const nextUsed = used + 1;
    logger.info('director_wildcard_use', { playerId: id, count: nextUsed });
    
    emitGameEvent('WILDCARD_USED', { 
      actor: { role: 'director' }, 
      context: { playerId: id, playerName: p.name, after: nextUsed } 
    });

    handleUpdatePlayer(id, 'wildcardsUsed', nextUsed);
  };

  const handleResetWildcards = (id: string) => {
    const p = gameState.players.find(x => x.id === id);
    if (!p) return;

    soundService.playClick();
    logger.info('director_wildcard_reset', { playerId: id });
    
    emitGameEvent('WILDCARD_RESET', { 
      actor: { role: 'director' }, 
      context: { playerId: id, playerName: p.name } 
    });

    handleUpdatePlayer(id, 'wildcardsUsed', 0);
  };

  const handleResetAllWildcards = () => {
    soundService.playClick();
    logger.info('director_wildcard_reset_all');
    
    const nextPlayers = gameState.players.map(p => ({ ...p, wildcardsUsed: 0 }));
    onUpdateState({ ...gameState, players: nextPlayers });
    
    emitGameEvent('WILDCARD_RESET', { actor: { role: 'director' }, context: { note: 'Reset All Players' } });
    setConfirmResetAll(false);
    addToast('info', 'All Wildcards Reset');
  };

  const handleRemovePlayer = (id: string) => {
    const p = gameState.players.find(x => x.id === id);
    if (p && confirm(`Permanently remove ${p.name}?`)) {
      soundService.playClick();
      logger.info('director_player_update', { playerId: id, field: 'removed' });
      const nextPlayers = gameState.players.filter(x => x.id !== id);
      const nextSelection = gameState.selectedPlayerId === id ? (nextPlayers[0]?.id || null) : gameState.selectedPlayerId;
      onUpdateState({ ...gameState, players: nextPlayers, selectedPlayerId: nextSelection });
      addToast('info', `Removed ${p.name}`);
    }
  };

  const handleCreatePlayer = () => {
    const name = normalizePlayerName(newPlayerName);
    if (!name) {
      addToast('error', 'Enter a valid name');
      return;
    }
    if (gameState.players.length >= 8) {
      addToast('error', 'Production limit: 8 Contestants max');
      return;
    }

    soundService.playClick();
    logger.info('director_player_update', { playerId: 'new', field: 'added' });
    
    const newP: Player = { 
      id: crypto.randomUUID(), 
      name, 
      score: 0, 
      color: '#fff',
      wildcardsUsed: 0,
      wildcardActive: false,
      stealsCount: 0
    };
    
    onUpdateState({ 
      ...gameState, 
      players: [...gameState.players, newP],
      selectedPlayerId: gameState.selectedPlayerId || newP.id
    });
    
    setNewPlayerName('');
    setIsAddingPlayer(false);
    addToast('success', `Added ${name}`);
  };

  const handleUpdateViewSettings = (updates: Partial<BoardViewSettings>) => {
    // Audit Settings Change
    logger.info('director_view_settings_changed', { 
      changedKeys: Object.keys(updates),
      genId: crypto.randomUUID()
    });

    onUpdateState({
      ...gameState,
      viewSettings: {
        ...gameState.viewSettings,
        ...updates,
        updatedAt: new Date().toISOString()
      }
    });

    emitGameEvent('VIEW_SETTINGS_CHANGED', { 
      actor: { role: 'director' }, 
      context: { after: updates } 
    });
  };

  /**
   * REFINED TILE AI REGEN HANDLER
   * - Preserves metadata flags (id, points, state)
   * - Provides snapshot rollback (effectively no commit on fail)
   * - PII-safe structured logging
   * - Race rule enforcement via tileAiGenIdRef
   */
  const handleTileAiRegen = async (cIdx: number, qIdx: number, difficulty: Difficulty) => {
    if (tileAiLoading) return;

    const genId = crypto.randomUUID();
    tileAiGenIdRef.current = genId;
    tileSnapshotRef.current = [...gameState.categories];

    const tsStart = new Date().toISOString();
    const cat = gameState.categories[cIdx];
    const q = cat.questions[qIdx];

    logger.info('director_tile_ai_regen_start', {
      ts: tsStart,
      genId,
      catId: cat.id,
      tileId: q.id,
      points: q.points,
      difficulty
    });

    setTileAiLoading(true);
    soundService.playClick();

    try {
      const result = await generateSingleQuestion(
        gameState.showTitle || "General Trivia",
        q.points,
        cat.title,
        difficulty,
        genId
      );

      // RACE CONDITION CHECK
      if (tileAiGenIdRef.current !== genId) {
        logger.warn('director_tile_ai_regen_stale', { genId, current: tileAiGenIdRef.current });
        return;
      }

      const nextCategories = [...gameState.categories];
      const nextQs = [...nextCategories[cIdx].questions];

      // PRESERVATION LOCK: Updates text/answer but keeps existing object metadata/id
      nextQs[qIdx] = {
        ...q, 
        text: result.text,
        answer: result.answer
      };

      nextCategories[cIdx] = { ...cat, questions: nextQs };

      onUpdateState({ ...gameState, categories: nextCategories });

      logger.info('director_tile_ai_regen_success', { 
        ts: new Date().toISOString(), 
        genId, 
        tileId: q.id 
      });
      addToast('success', 'Question generated.');
    } catch (e: any) {
      // Rollback: No updateState call preserves existing board
      logger.error('director_tile_ai_regen_failed', {
        ts: new Date().toISOString(),
        genId,
        tileId: q.id,
        message: e.message
      });
      addToast('error', 'Failed to generate question.');
    } finally {
      if (tileAiGenIdRef.current === genId) {
        setTileAiLoading(false);
      }
    }
  };

  const handleAiRegenTile = async (cIdx: number, qIdx: number, difficulty: Difficulty = 'mixed') => {
    if (aiLoading) return;
    
    const cat = gameState.categories[cIdx];
    const q = cat.questions[qIdx];
    const genId = crypto.randomUUID();
    
    logger.info('director_tile_ai_regen_start', { 
      tileId: q.id, 
      catId: cat.id, 
      points: q.points, 
      difficulty: difficulty
    });

    setAiLoading(true);
    soundService.playClick();

    try {
      const result = await generateSingleQuestion(
        gameState.showTitle || "General Trivia",
        q.points,
        cat.title,
        difficulty,
        genId
      );

      const nextCategories = [...gameState.categories];
      const nextQs = [...nextCategories[cIdx].questions];
      
      // Preserve ID, Points, and State Flags strictly
      nextQs[qIdx] = { 
        ...nextQs[qIdx], 
        text: result.text, 
        answer: result.answer 
      };
      
      nextCategories[cIdx] = { ...nextCategories[cIdx], questions: nextQs };

      onUpdateState({ ...gameState, categories: nextCategories });
      
      logger.info('director_tile_ai_regen_success', { tileId: q.id, genId });
      addToast('success', 'Tile updated via AI.');
    } catch (e: any) {
      logger.error('director_tile_ai_regen_failed', { tileId: q.id, error: e.message, genId });
      addToast('error', `AI Failed: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiRewriteCategory = async (cIdx: number) => {
    if (aiLoading) return;
    
    const genId = crypto.randomUUID();
    const cat = gameState.categories[cIdx];
    
    // Log masked prompt data
    const promptSnippet = (gameState.showTitle || "General Trivia").substring(0, 20) + "...";
    logger.info('ai_category_regen_start', { 
      genId, 
      categoryId: cat.id, 
      promptLen: (gameState.showTitle || "").length, 
      promptSnippet,
      difficulty: 'mixed'
    });

    setAiLoading(true);
    soundService.playClick();
    
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
      
      logger.info('ai_category_regen_success', { 
        genId, 
        categoryId: cat.id, 
        preservedPoints: true 
      });
      addToast('success', `${cat.title} updated.`);
    } catch (e: any) {
      // ROLLBACK ON FAILURE
      logger.error('ai_category_regen_failed', { 
        genId, 
        categoryId: cat.id, 
        error: e.message 
      });
      
      addToast('error', `AI rewrite failed: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  // --- RENDERING ---

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-white relative">
      <div className="flex-none h-14 border-b border-zinc-800 flex items-center px-4 justify-between bg-black">
        <div className="flex items-center gap-1">
          <button onClick={() => setActiveTab('BOARD')} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 ${activeTab === 'BOARD' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Grid className="w-4 h-4" /> Board
          </button>
          <button onClick={() => setActiveTab('PLAYERS')} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 ${activeTab === 'PLAYERS' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Users className="w-4 h-4" /> Players
          </button>
          <button onClick={() => setActiveTab('SETTINGS')} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 ${activeTab === 'SETTINGS' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <Sliders className="w-4 h-4" /> Settings
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
            onUpdateSettings={handleUpdateViewSettings} 
          />
        )}

        {activeTab === 'PLAYERS' && (
          <div className="space-y-6 animate-in fade-in duration-300 max-w-7xl mx-auto">
            <div className="flex justify-between items-center bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800 shadow-lg">
              <div>
                <h3 className="text-gold-500 font-black uppercase tracking-widest text-xs flex items-center gap-2">
                  <Users className="w-4 h-4" /> Contestant Management
                </h3>
                <p className="text-[10px] text-zinc-500 uppercase font-bold mt-1 tracking-wider">Live roster overrides for game session</p>
              </div>
              <div className="flex gap-2">
                {!confirmResetAll ? (
                  <button 
                    onClick={() => setConfirmResetAll(true)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black px-4 py-2.5 rounded-xl text-[10px] flex items-center gap-2 uppercase transition-all"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset All Wildcards
                  </button>
                ) : (
                  <button 
                    onClick={handleResetAllWildcards}
                    className="bg-red-600 hover:bg-red-500 text-white font-black px-4 py-2.5 rounded-xl text-[10px] flex items-center gap-2 uppercase animate-pulse shadow-lg shadow-red-900/20"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" /> Click to Confirm Reset All
                  </button>
                )}
                <button 
                  onClick={() => setIsAddingPlayer(true)}
                  disabled={(gameState.players || []).length >= 8}
                  className="bg-gold-600 hover:bg-gold-500 text-black font-black px-5 py-2.5 rounded-xl text-[10px] flex items-center gap-2 uppercase disabled:opacity-30 transition-all shadow-xl shadow-gold-900/10 active:scale-95"
                >
                  <UserPlus className="w-4 h-4" /> Add Player
                </button>
              </div>
            </div>

            {isAddingPlayer && (
              <div className="bg-zinc-900 p-5 rounded-2xl border border-gold-500/30 flex gap-3 animate-in slide-in-from-top-2 shadow-2xl">
                <input 
                  autoFocus
                  value={newPlayerName}
                  onChange={e => setNewPlayerName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreatePlayer()}
                  placeholder="ENTER PLAYER NAME"
                  className="flex-1 bg-black border border-zinc-700 p-3 rounded-xl text-sm text-white outline-none focus:border-gold-500 font-black uppercase placeholder:text-zinc-800 tracking-tight"
                />
                <button onClick={handleCreatePlayer} className="bg-green-600 hover:bg-green-500 px-4 rounded-xl text-white transition-colors shadow-lg shadow-green-900/20"><Check className="check-icon w-5 h-5"/></button>
                <button onClick={() => setIsAddingPlayer(false)} className="bg-zinc-800 hover:bg-zinc-700 px-4 rounded-xl text-zinc-400 transition-colors border border-zinc-700"><X className="w-5 h-5"/></button>
              </div>
            )}

            <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm">
              <table className="w-full text-left border-collapse">
                <thead className="bg-black/60 text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">
                  <tr>
                    <th className="p-5 border-b border-zinc-800">Contestant Name</th>
                    <th className="p-5 border-b border-zinc-800">Live Score</th>
                    <th className="p-5 border-b border-zinc-800">Wildcards</th>
                    <th className="p-5 border-b border-zinc-800">Steals</th>
                    <th className="p-5 border-b border-zinc-800 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {(gameState.players || []).map(p => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="p-5">
                        <input 
                          value={p.name}
                          onChange={e => handleUpdatePlayer(p.id, 'name', normalizePlayerName(e.target.value))}
                          className="bg-transparent border-b border-transparent focus:border-gold-500 outline-none font-black text-sm text-white w-full uppercase tracking-tight transition-all py-1"
                          placeholder="NAME REQUIRED"
                        />
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => handleUpdatePlayer(p.id, 'score', p.score - 100)}
                            className="p-2 bg-black rounded-lg hover:text-red-500 text-zinc-600 transition-colors border border-zinc-800 active:scale-90"
                            title="Subtract 100"
                          ><Minus className="w-4 h-4"/></button>
                          <span className="font-mono text-gold-500 font-black min-w-[5rem] text-center text-xl drop-shadow-md select-none">{p.score}</span>
                          <button 
                            onClick={() => handleUpdatePlayer(p.id, 'score', p.score + 100)}
                            className="p-2 bg-black rounded-lg hover:text-green-500 text-zinc-600 transition-colors border border-zinc-800 active:scale-90"
                            title="Add 100"
                          ><Plus className="w-4 h-4"/></button>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2">
                           <button 
                             disabled={(p.wildcardsUsed || 0) >= 4}
                             onClick={() => handleUseWildcard(p.id)}
                             title="Increment Wildcard Usage"
                             className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase flex items-center gap-2 transition-all active:scale-95 ${(p.wildcardsUsed || 0) >= 4 ? 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed' : 'bg-gold-600/10 border-gold-600/30 text-gold-500 hover:bg-gold-600 hover:text-black'}`}
                           >
                             <Star className={`w-3 h-3 ${(p.wildcardsUsed || 0) > 0 ? 'fill-current' : ''}`} /> 
                             {(p.wildcardsUsed || 0) >= 4 ? 'MAX 4 USED' : `${p.wildcardsUsed || 0}/4`}
                           </button>
                           <button 
                             disabled={(p.wildcardsUsed || 0) === 0}
                             onClick={() => handleResetWildcards(p.id)}
                             title="Reset Wildcards"
                             className="p-2 text-zinc-600 hover:text-red-500 disabled:opacity-0 transition-all"
                           >
                             <RotateCcw className="w-4 h-4" />
                           </button>
                        </div>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center gap-2 text-purple-400">
                          <ShieldAlert className="w-4 h-4" />
                          <span className="font-mono font-black text-sm">{p.stealsCount || 0}</span>
                        </div>
                      </td>
                      <td className="p-5 text-right">
                        <button 
                          /* Fix: Replace undefined 'id' with 'p.id' */
                          onClick={() => handleRemovePlayer(p.id)}
                          className="p-3 text-zinc-800 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 rounded-xl"
                          title="Delete Contestant"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(!gameState.players || gameState.players.length === 0) && (
                    <tr>
                      <td colSpan={5} className="p-16 text-center text-zinc-700 italic text-[11px] uppercase font-black tracking-[0.3em] bg-black/20">
                        No contestants registered for this session
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'BOARD' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <DirectorAiRegenerator gameState={gameState} onUpdateState={onUpdateState} addToast={addToast} />
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gameState.categories.length}, minmax(180px, 1fr))` }}>
              {gameState.categories.map((cat, cIdx) => (
                <div key={cat.id} className="space-y-3">
                  <div className="group relative">
                    <input value={cat.title} onChange={e => onUpdateState({...gameState, categories: gameState.categories.map((c, i) => i === cIdx ? {...c, title: e.target.value} : c)})} className="bg-zinc-900 text-gold-400 font-bold text-xs p-2 rounded w-full border border-transparent focus:border-gold-500 outline-none pr-8" />
                    <button onClick={() => handleAiRewriteCategory(cIdx)} className="absolute right-1 top-1 p-1 text-zinc-600 hover:text-purple-400 transition-colors" title="Regenerate this category only"><Wand2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {cat.questions.map((q, qIdx) => (
                    <div key={q.id} onClick={() => setEditingQuestion({cIdx, qIdx})} className={`p-3 rounded border flex flex-col gap-1 cursor-pointer transition-all hover:brightness-110 relative group ${q.isVoided ? 'bg-red-900/20 border-red-800' : q.isAnswered ? 'bg-zinc-900 border-zinc-800 opacity-60' : 'bg-zinc-800 border-zinc-700'}`}>
                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                        <span>{q.points}</span>
                        {q.isDoubleOrNothing && <span className="text-gold-500 font-bold">2x</span>}
                      </div>

                      {/* QUICK AI REGEN BUTTON */}
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleAiRegenTile(cIdx, qIdx); }}
                        disabled={aiLoading}
                        className="absolute top-1 right-1 p-1 text-zinc-600 hover:text-purple-400 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0 active:scale-90"
                        title="Quick AI Generate"
                      >
                        {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      </button>

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
                
                {/* COMPACT AI REGEN SECTION */}
                <div className="p-4 bg-purple-900/10 border border-purple-500/20 rounded-xl mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] uppercase text-purple-400 font-black tracking-widest flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5" /> AI Regen Tile
                    </h4>
                    {tileAiLoading && <Loader2 className="w-3 h-3 text-purple-500 animate-spin" />}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 grid grid-cols-4 gap-1 bg-black/40 p-1 rounded-lg border border-zinc-800">
                      {(['easy', 'medium', 'hard', 'mixed'] as Difficulty[]).map(d => (
                        <button 
                          key={d}
                          onClick={() => setTileAiDifficulty(d)}
                          className={`py-1.5 text-[8px] font-black rounded uppercase transition-all ${tileAiDifficulty === d ? 'bg-purple-600 text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={() => handleTileAiRegen(cIdx, qIdx, tileAiDifficulty)}
                      disabled={tileAiLoading}
                      className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-purple-900/20"
                    >
                      Regen
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase text-zinc-500 font-bold">Question</label>
                  <textarea 
                    key={`text-${q.text}`}
                    id="dir-q-text" 
                    defaultValue={q.text} 
                    className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-24 focus:border-gold-500 outline-none font-bold" 
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-zinc-500 font-bold">Answer</label>
                  <textarea 
                    key={`ans-${q.answer}`}
                    id="dir-q-answer" 
                    defaultValue={q.answer} 
                    className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-16 focus:border-gold-500 outline-none font-bold" 
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-800">
                <button onClick={() => setEditingQuestion(null)} className="px-4 py-2 text-zinc-400 hover:text-white text-sm">Cancel</button>
                <button onClick={() => { 
                   const txt = (document.getElementById('dir-q-text') as HTMLTextAreaElement).value; 
                   const ans = (document.getElementById('dir-q-answer') as HTMLTextAreaElement).value; 
                   
                   const nextCategories = [...gameState.categories];
                   const nCat = nextCategories[cIdx];
                   const nQs = [...nCat.questions];
                   nQs[qIdx] = { ...nQs[qIdx], text: txt, answer: ans, isVoided: false };
                   nextCategories[cIdx] = { ...nCat, questions: nQs };
                   
                   onUpdateState({ ...gameState, categories: nextCategories });
                   setEditingQuestion(null);
                   addToast('success', 'Tile updated.');
                }} className="bg-gold-600 hover:bg-gold-500 text-black font-bold px-6 py-2 rounded flex items-center gap-2"><Save className="w-4 h-4" />Save Changes</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
