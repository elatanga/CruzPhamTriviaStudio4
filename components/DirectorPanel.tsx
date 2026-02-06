import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Settings, Users, Grid, Edit, Save, X, RefreshCw, Wand2, ExternalLink, RotateCcw, Play, Pause, Layout, Star, Trash2, AlertTriangle, UserPlus, Check, BarChart3, Info, Hash, Clock, History, Copy, Trash, Download, Sparkles, Sliders, Loader2, Minus, Plus, ShieldAlert, Activity, Terminal, RotateCw } from 'lucide-react';
import { GameState, Question, Difficulty, Category, BoardViewSettings, Player, AnalyticsEventType, GameAnalyticsEvent } from '../types';
import { generateSingleQuestion, generateCategoryQuestions } from '../services/geminiService';
import { logger } from '../services/logger';
import { soundService } from '../services/soundService';
import { normalizePlayerName, applyAiCategoryPreservePoints, restoreTile, restoreAllTiles, rescalePoints } from '../services/utils';
import { DirectorAiRegenerator } from './DirectorAiRegenerator';
import { DirectorSettingsPanel } from './DirectorSettingsPanel';
import { DirectorAnalytics } from './DirectorAnalytics';
import { DirectorLiveEventLog } from './DirectorLiveEventLog';

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
  const [activeTab, setActiveTab] = useState<'GAME' | 'PLAYERS' | 'BOARD' | 'ANALYTICS' | 'SETTINGS'>('BOARD');
  const [editingQuestion, setEditingQuestion] = useState<{cIdx: number, qIdx: number} | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  
  const [tileAiDifficulty, setTileAiDifficulty] = useState<Difficulty>("mixed");
  const [tileAiLoading, setTileAiLoading] = useState(false);
  const tileAiGenIdRef = useRef<string | null>(null);
  
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  // Derive current point scale from the first tile of row 1 (deterministic index 0)
  const currentPointScale = useMemo(() => {
    if (!gameState.categories || gameState.categories.length === 0) return 100;
    return gameState.categories[0].questions[0]?.points || 100;
  }, [gameState.categories]);

  // --- HANDLERS ---

  const handleRestoreTileAction = (cIdx: number, qIdx: number) => {
    const cat = gameState.categories[cIdx];
    const q = cat.questions[qIdx];
    
    soundService.playClick();
    const nextCategories = restoreTile(gameState.categories, cIdx, qIdx);

    if (nextCategories !== gameState.categories) {
      emitGameEvent('TILE_RESTORED', {
        actor: { role: 'director' },
        context: { 
          tileId: q.id, 
          categoryName: cat.title, 
          points: q.points,
          categoryIndex: cIdx,
          rowIndex: qIdx
        }
      });
      onUpdateState({ ...gameState, categories: nextCategories });
      addToast('success', 'Tile restored to active state.');
    }
  };

  const handleRestoreAllTilesAction = () => {
    const timestamp = new Date().toISOString();
    logger.info('director_restore_all_click', { ts: timestamp });

    if (!confirm('Restore all answered tiles?')) return;
    
    try {
      soundService.playClick();
      const { nextCategories, restoredCount } = restoreAllTiles(gameState.categories);

      if (restoredCount > 0) {
        emitGameEvent('BOARD_RESTORED_ALL', {
          actor: { role: 'director' },
          context: { note: 'Global board reset applied', restoredCount }
        });
        
        onUpdateState({ ...gameState, categories: nextCategories });
        addToast('success', 'All tiles restored.');
        logger.info('director_restore_all_applied', { ts: new Date().toISOString(), restoredCount });
      } else {
        addToast('info', 'No played tiles to restore.');
        logger.info('director_restore_all_noop', { ts: new Date().toISOString() });
      }
    } catch (err: any) {
      logger.error('director_restore_all_failed', { ts: new Date().toISOString(), message: err.message });
      addToast('error', 'Bulk restore failed.');
    }
  };

  const handleRescalePointsAction = (newScale: number) => {
    const fromScale = currentPointScale;
    if (fromScale === newScale) return;

    logger.info('director_point_scale_change_click', { ts: new Date().toISOString(), from: fromScale, to: newScale });

    try {
      soundService.playClick();
      const nextCategories = rescalePoints(gameState.categories, newScale);

      emitGameEvent('POINT_SCALE_CHANGED', {
        actor: { role: 'director' },
        context: { fromScale, toScale: newScale, before: fromScale, after: newScale }
      });

      onUpdateState({ ...gameState, categories: nextCategories });
      addToast('info', `Points rescaled to ${newScale} increment.`);
      logger.info('director_point_scale_change_applied', { ts: new Date().toISOString(), to: newScale });
    } catch (err: any) {
      logger.error('director_point_scale_change_failed', { ts: new Date().toISOString(), message: err.message });
      addToast('error', 'Failed to rescale points.');
    }
  };

  const handleUpdatePlayer = (id: string, field: keyof Player, value: any) => {
    try {
      const p = gameState.players.find(x => x.id === id);
      if (!p) return;

      if (field === 'name') {
        emitGameEvent('PLAYER_EDITED', {
          actor: { role: 'director' },
          context: { playerId: id, playerName: value, before: p.name }
        });
      } else if (field === 'score') {
        const delta = value - p.score;
        emitGameEvent('SCORE_ADJUSTED', {
          actor: { role: 'director' },
          context: { playerId: id, playerName: p.name, delta, points: value }
        });
      }

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
    emitGameEvent('WILDCARD_RESET', { 
      actor: { role: 'director' }, 
      context: { playerId: id, playerName: p.name } 
    });

    handleUpdatePlayer(id, 'wildcardsUsed', 0);
  };

  const handleResetAllWildcards = () => {
    soundService.playClick();
    const nextPlayers = gameState.players.map(p => ({ ...p, wildcardsUsed: 0 }));
    emitGameEvent('WILDCARD_RESET', { 
      actor: { role: 'director' }, 
      context: { note: 'Global Reset Applied' } 
    });
    onUpdateState({ ...gameState, players: nextPlayers });
    setConfirmResetAll(false);
    addToast('info', 'All Wildcards Reset');
  };

  const handleRemovePlayer = (id: string) => {
    const p = gameState.players.find(x => x.id === id);
    if (p && confirm(`Permanently remove ${p.name}?`)) {
      soundService.playClick();
      emitGameEvent('PLAYER_REMOVED', { 
        actor: { role: 'director' }, 
        context: { playerId: id, playerName: p.name } 
      });

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
    const newP: Player = { 
      id: crypto.randomUUID(), 
      name, 
      score: 0, 
      color: '#fff',
      wildcardsUsed: 0,
      wildcardActive: false,
      stealsCount: 0
    };

    emitGameEvent('PLAYER_ADDED', { 
      actor: { role: 'director' }, 
      context: { playerId: newP.id, playerName: newP.name } 
    });
    
    onUpdateState({ 
      ...gameState, 
      players: [...gameState.players, newP],
      selectedPlayerId: gameState.selectedPlayerId || newP.id
    });
    
    setNewPlayerName('');
    setIsAddingPlayer(false);
    addToast('success', `Added ${name}`);
  };

  const handleTileAiRegen = async (cIdx: number, qIdx: number, difficulty: Difficulty) => {
    if (tileAiLoading) return;
    const genId = crypto.randomUUID();
    tileAiGenIdRef.current = genId;
    const cat = gameState.categories[cIdx];
    const q = cat.questions[qIdx];
    setTileAiLoading(true);
    soundService.playClick();
    try {
      const result = await generateSingleQuestion(gameState.showTitle || "General Trivia", q.points, cat.title, difficulty, genId);
      if (tileAiGenIdRef.current !== genId) return;
      const nextCategories = [...gameState.categories];
      const nextQs = [...nextCategories[cIdx].questions];
      nextQs[qIdx] = { ...q, text: result.text, answer: result.answer };
      nextCategories[cIdx] = { ...cat, questions: nextQs };
      emitGameEvent('AI_TILE_REPLACE_APPLIED', { 
        actor: { role: 'director' }, 
        context: { tileId: q.id, categoryName: cat.title, points: q.points, difficulty } 
      });
      onUpdateState({ ...gameState, categories: nextCategories });
      addToast('success', 'Question generated.');
    } catch (e: any) {
      addToast('error', 'Failed to generate question.');
    } finally {
      if (tileAiGenIdRef.current === genId) setTileAiLoading(false);
    }
  };

  const handleAiRegenTile = async (cIdx: number, qIdx: number, difficulty: Difficulty = 'mixed') => {
    if (aiLoading) return;
    const cat = gameState.categories[cIdx];
    const q = cat.questions[qIdx];
    const genId = crypto.randomUUID();
    setAiLoading(true);
    soundService.playClick();
    try {
      const result = await generateSingleQuestion(gameState.showTitle || "General Trivia", q.points, cat.title, difficulty, genId);
      const nextCategories = [...gameState.categories];
      const nextQs = [...nextCategories[cIdx].questions];
      nextQs[qIdx] = { ...nextQs[qIdx], text: result.text, answer: result.answer };
      nextCategories[cIdx] = { ...nextCategories[cIdx], questions: nextQs };
      emitGameEvent('AI_TILE_REPLACE_APPLIED', { 
        actor: { role: 'director' }, 
        context: { tileId: q.id, categoryName: cat.title, points: q.points, difficulty } 
      });
      onUpdateState({ ...gameState, categories: nextCategories });
      addToast('success', 'Tile updated via AI.');
    } catch (e: any) {
      addToast('error', `AI Failed: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiRewriteCategory = async (cIdx: number) => {
    if (aiLoading) return;
    const genId = crypto.randomUUID();
    const cat = gameState.categories[cIdx];
    setAiLoading(true);
    soundService.playClick();
    try {
      const newQs = await generateCategoryQuestions(gameState.showTitle || "General Trivia", cat.title, cat.questions.length, 'mixed', currentPointScale, genId);
      const nextCategories = [...gameState.categories];
      nextCategories[cIdx] = applyAiCategoryPreservePoints(cat, newQs);
      emitGameEvent('AI_CATEGORY_REPLACE_APPLIED', { 
        actor: { role: 'director' }, 
        context: { categoryIndex: cIdx, categoryName: cat.title, difficulty: 'mixed' } 
      });
      onUpdateState({ ...gameState, categories: nextCategories });
      addToast('success', `${cat.title} updated.`);
    } catch (e: any) {
      addToast('error', `AI rewrite failed: ${e.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCategoryRename = (cIdx: number, title: string) => {
    const nextCategories = gameState.categories.map((c, i) => i === cIdx ? { ...c, title } : c);
    onUpdateState({ ...gameState, categories: nextCategories });
  };

  const emitCategoryRename = (cIdx: number, title: string) => {
    emitGameEvent('CATEGORY_RENAMED', { actor: { role: 'director' }, context: { categoryIndex: cIdx, categoryName: title } });
  };

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
          <button onClick={() => setActiveTab('ANALYTICS')} className={`px-4 py-2 text-xs font-bold uppercase rounded flex items-center gap-2 ${activeTab === 'ANALYTICS' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:bg-zinc-900'}`}>
            <BarChart3 className="w-4 h-4" /> Analytics
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

      <div className="flex-1 overflow-hidden relative p-4">
        {activeTab === 'SETTINGS' && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <DirectorSettingsPanel 
              settings={gameState.viewSettings} 
              onUpdateSettings={(u) => {
                onUpdateState({ ...gameState, viewSettings: { ...gameState.viewSettings, ...u } });
                emitGameEvent('VIEW_SETTINGS_CHANGED', { actor: { role: 'director' }, context: { after: u } });
              }} 
            />
          </div>
        )}

        {activeTab === 'ANALYTICS' && (
          <div className="h-full flex flex-col lg:flex-row gap-6">
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <DirectorAnalytics gameState={gameState} addToast={addToast} />
            </div>
            <div className="w-full lg:w-[450px] shrink-0 h-[400px] lg:h-full">
              <div className="flex items-center gap-2 mb-3 ml-1">
                 <Terminal className="w-4 h-4 text-gold-500" />
                 <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Live Event Log</h4>
              </div>
              <DirectorLiveEventLog 
                events={gameState.events || []} 
                players={gameState.players} 
                categories={gameState.categories} 
              />
            </div>
          </div>
        )}

        {activeTab === 'PLAYERS' && (
          <div className="h-full overflow-y-auto custom-scrollbar space-y-6 animate-in fade-in duration-300 max-w-7xl mx-auto">
            <div className="flex justify-between items-center bg-zinc-900/40 p-5 rounded-2xl border border-zinc-800 shadow-lg">
              <div>
                <h3 className="text-gold-500 font-black uppercase tracking-widest text-xs flex items-center gap-2">
                  <Users className="w-4 h-4" /> Contestant Management
                </h3>
                <p className="text-[10px] text-zinc-500 uppercase font-bold mt-1 tracking-wider">Live roster overrides for game session</p>
              </div>
              <div className="flex gap-2">
                {!confirmResetAll ? (
                  <button onClick={() => setConfirmResetAll(true)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-black px-4 py-2.5 rounded-xl text-[10px] flex items-center gap-2 uppercase transition-all">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset All Wildcards
                  </button>
                ) : (
                  <button onClick={handleResetAllWildcards} className="bg-red-600 hover:bg-red-500 text-white font-black px-4 py-2.5 rounded-xl text-[10px] flex items-center gap-2 uppercase animate-pulse shadow-lg shadow-red-900/20">
                    <AlertTriangle className="w-3.5 h-3.5" /> Click to Confirm Reset All
                  </button>
                )}
                <button onClick={() => setIsAddingPlayer(true)} disabled={(gameState.players || []).length >= 8} className="bg-gold-600 hover:bg-gold-500 text-black font-black px-5 py-2.5 rounded-xl text-[10px] flex items-center gap-2 uppercase disabled:opacity-30 transition-all shadow-xl shadow-gold-900/10 active:scale-95">
                  <UserPlus className="w-4 h-4" /> Add Player
                </button>
              </div>
            </div>

            {isAddingPlayer && (
              <div className="bg-zinc-900 p-5 rounded-2xl border border-gold-500/30 flex gap-3 animate-in slide-in-from-top-2 shadow-2xl">
                <input autoFocus value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreatePlayer()} placeholder="ENTER PLAYER NAME" className="flex-1 bg-black border border-zinc-700 p-3 rounded-xl text-sm text-white outline-none focus:border-gold-500 font-black uppercase placeholder:text-zinc-800 tracking-tight" />
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
                  {(gameState.players || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-zinc-600 uppercase font-black tracking-widest text-xs">
                        No contestants registered
                      </td>
                    </tr>
                  ) : (
                    (gameState.players || []).map(p => (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="p-5">
                          <input value={p.name} onChange={e => handleUpdatePlayer(p.id, 'name', normalizePlayerName(e.target.value))} className="bg-transparent border-b border-transparent focus:border-gold-500 outline-none font-black text-sm text-white w-full uppercase tracking-tight transition-all py-1" placeholder="NAME REQUIRED" />
                        </td>
                        <td className="p-5">
                          <div className="flex items-center gap-3">
                            <button onClick={() => handleUpdatePlayer(p.id, 'score', p.score - 100)} className="p-2 bg-black rounded-lg hover:text-red-500 text-zinc-600 transition-colors border border-zinc-800 active:scale-90" title="Subtract 100"><Minus className="w-4 h-4"/></button>
                            <span className="font-mono text-gold-500 font-black min-w-[5rem] text-center text-xl drop-shadow-md select-none">{p.score}</span>
                            <button onClick={() => handleUpdatePlayer(p.id, 'score', p.score + 100)} className="p-2 bg-black rounded-lg hover:text-green-500 text-zinc-600 transition-colors border border-zinc-800 active:scale-90" title="Add 100"><Plus className="w-4 h-4"/></button>
                          </div>
                        </td>
                        <td className="p-5">
                          <div className="flex items-center gap-2">
                             <button disabled={(p.wildcardsUsed || 0) >= 4} onClick={() => handleUseWildcard(p.id)} title="Increment Wildcard Usage" className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase flex items-center gap-2 transition-all active:scale-95 ${(p.wildcardsUsed || 0) >= 4 ? 'bg-zinc-800 border-zinc-700 text-zinc-600 cursor-not-allowed' : 'bg-gold-600/10 border-gold-600/30 text-gold-500 hover:bg-gold-600 hover:text-black'}`}>
                               <Star className={`w-3 h-3 ${(p.wildcardsUsed || 0) > 0 ? 'fill-current' : ''}`} /> 
                               {(p.wildcardsUsed || 0) >= 4 ? 'MAX 4 USED' : `${p.wildcardsUsed || 0}/4`}
                             </button>
                             <button disabled={(p.wildcardsUsed || 0) === 0} onClick={() => handleResetWildcards(p.id)} title="Reset Wildcards" className="p-2 text-zinc-600 hover:text-red-500 disabled:opacity-0 transition-all">
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
                          <button onClick={() => handleRemovePlayer(p.id)} className="p-3 text-zinc-800 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 rounded-xl" title="Delete Contestant">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'BOARD' && (
          <div className="h-full overflow-y-auto custom-scrollbar space-y-6 animate-in fade-in duration-300">
            {/* Global Controls Section */}
            <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800 flex flex-wrap items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-6">
                <div>
                   <h3 className="text-[10px] font-black uppercase text-gold-500 tracking-widest flex items-center gap-2 mb-2">
                     <RotateCw className="w-3.5 h-3.5" /> Board Operations
                   </h3>
                   <button onClick={handleRestoreAllTilesAction} className="bg-gold-600/10 hover:bg-gold-600 text-gold-500 hover:text-black border border-gold-600/30 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95">
                     Restore All Tiles
                   </button>
                </div>
                <div className="h-10 w-px bg-zinc-800" />
                <div>
                   <h3 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest flex items-center gap-2 mb-2">
                     <Layout className="w-3.5 h-3.5" /> Point Scale (Current: {currentPointScale})
                   </h3>
                   <div className="flex gap-1 bg-black p-1 rounded-lg border border-zinc-800">
                     {[10, 20, 25, 50, 100].map(scale => (
                        <button 
                          key={scale} 
                          onClick={() => handleRescalePointsAction(scale)} 
                          className={`px-3 py-1 rounded text-[9px] font-black uppercase transition-all ${currentPointScale === scale ? 'bg-gold-600 text-black' : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900'}`}
                        >
                          {scale}
                        </button>
                     ))}
                   </div>
                </div>
              </div>
            </div>

            <DirectorAiRegenerator gameState={gameState} onUpdateState={onUpdateState} emitGameEvent={emitGameEvent} addToast={addToast} />
            
            <div className="grid gap-4 pb-20" style={{ gridTemplateColumns: `repeat(${gameState.categories.length}, minmax(180px, 1fr))` }}>
              {gameState.categories.map((cat, cIdx) => (
                <div key={cat.id} className="space-y-3">
                  <div className="group relative">
                    <input value={cat.title} onChange={e => handleCategoryRename(cIdx, e.target.value)} onBlur={e => emitCategoryRename(cIdx, e.target.value)} className="bg-zinc-900 text-gold-400 font-bold text-xs p-2 rounded w-full border border-transparent focus:border-gold-500 outline-none pr-8" />
                    <button onClick={() => handleAiRewriteCategory(cIdx)} className="absolute right-1 top-1 p-1 text-zinc-600 hover:text-purple-400 transition-colors" title="Regenerate this category only"><Wand2 className="w-3.5 h-3.5" /></button>
                  </div>
                  {cat.questions.map((q, qIdx) => (
                    <div key={q.id} onClick={() => setEditingQuestion({cIdx, qIdx})} className={`p-3 rounded border flex flex-col gap-1 cursor-pointer transition-all hover:brightness-110 relative group ${q.isVoided ? 'bg-red-900/20 border-red-800' : q.isAnswered ? 'bg-zinc-900 border-zinc-800 opacity-60' : 'bg-zinc-800 border-zinc-700'}`}>
                      <div className="flex justify-between items-center text-[10px] font-mono text-zinc-500">
                        <span>{q.points}</span>
                        {q.isDoubleOrNothing && <span className="text-gold-500 font-bold">2x</span>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleAiRegenTile(cIdx, qIdx); }} disabled={aiLoading} className="absolute top-1 right-1 p-1 text-zinc-600 hover:text-purple-400 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0 active:scale-90" title="Quick AI Generate">
                        {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      </button>
                      <p className="text-xs text-zinc-300 line-clamp-2 leading-tight font-bold">{q.text}</p>
                      <div className="mt-2 pt-2 border-t border-zinc-700/40 flex items-center justify-between">
                        <p className={`text-[10px] leading-tight font-roboto-bold ${q.answer ? 'text-gold-400' : 'text-zinc-600 italic'}`}>{q.answer || '(MISSING)'}</p>
                        {(q.isAnswered || q.isVoided) && <span className="text-[7px] uppercase font-black px-1 py-0.5 rounded bg-zinc-950 text-zinc-500">Played</span>}
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
        const isPlayed = q.isAnswered || q.isVoided;
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-zinc-900 border border-gold-500/50 rounded-xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2">
                <div><h3 className="text-gold-500 font-bold">{cat.title} // {q.points}</h3></div>
                <button onClick={() => setEditingQuestion(null)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                
                {isPlayed && (
                  <div className="bg-gold-600/10 border border-gold-600/30 p-4 rounded-xl flex items-center justify-between mb-4">
                    <div>
                      <h4 className="text-[10px] uppercase font-black text-gold-500 tracking-widest">Question Played</h4>
                      <p className="text-[9px] text-zinc-500 uppercase font-bold mt-0.5">Restore to make this tile available on board again.</p>
                    </div>
                    <button onClick={() => { handleRestoreTileAction(cIdx, qIdx); setEditingQuestion(null); }} className="bg-gold-600 hover:bg-gold-500 text-black px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-gold-900/20 flex items-center gap-2">
                      <RotateCw className="w-3 h-3" /> Restore Tile
                    </button>
                  </div>
                )}

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
                        <button key={d} onClick={() => setTileAiDifficulty(d)} className={`py-1.5 text-[8px] font-black rounded uppercase transition-all ${tileAiDifficulty === d ? 'bg-purple-600 text-white' : 'text-zinc-600 hover:text-zinc-400'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => handleTileAiRegen(cIdx, qIdx, tileAiDifficulty)} disabled={tileAiLoading} className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-purple-900/20">
                      Regen
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase text-zinc-500 font-bold">Question</label>
                  <textarea key={`text-${q.text}`} id="dir-q-text" defaultValue={q.text} className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-24 focus:border-gold-500 outline-none font-bold" />
                </div>
                <div>
                  <label className="text-xs uppercase text-zinc-500 font-bold">Answer</label>
                  <textarea key={`ans-${q.answer}`} id="dir-q-answer" defaultValue={q.answer} className="w-full bg-black border border-zinc-700 text-white p-3 rounded mt-1 h-16 focus:border-gold-500 outline-none font-bold" />
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
                   nQs[qIdx] = { ...nQs[qIdx], text: txt, answer: ans };
                   nextCategories[cIdx] = { ...nCat, questions: nQs };
                   onUpdateState({ ...gameState, categories: nextCategories });
                   emitGameEvent('QUESTION_EDITED', { actor: { role: 'director' }, context: { tileId: q.id, categoryName: cat.title, points: q.points } });
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