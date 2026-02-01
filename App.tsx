import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AppShell } from './components/AppShell';
import { ToastContainer } from './components/Toast';
import { LoginScreen } from './components/LoginScreen';
import { ShowSelection } from './components/ShowSelection';
import { TemplateDashboard } from './components/TemplateDashboard';
import { GameBoard } from './components/GameBoard';
import { Scoreboard } from './components/Scoreboard';
import { QuestionModal } from './components/QuestionModal';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { DirectorPanel } from './components/DirectorPanel';
import { AdminPanel } from './components/AdminPanel';
import { ConfirmationModal } from './components/ConfirmationModal';
import { authService } from './services/authService';
import { dataService } from './services/dataService';
import { GameState, Category, Player, ToastMessage, Question, Show, GameTemplate, UserRole, Session, BoardViewSettings, PlayEvent } from './types';
import { soundService } from './services/soundService';
import { logger } from './services/logger';
import { Monitor, Grid, Shield, Copy, Loader2, ExternalLink, Power } from 'lucide-react';

const App: React.FC = () => {
  // App Boot State
  const [isConfigured, setIsConfigured] = useState(false);
  const [authChecked, setAuthChecked] = useState(false); 
  
  const [bootstrapToken, setBootstrapToken] = useState<string | null>(null);

  const [session, setSession] = useState<{ id: string; username: string; role: UserRole } | null>(null);
  const [activeShow, setActiveShow] = useState<Show | null>(null);

  // --- VIEW STATE ---
  const [viewMode, setViewMode] = useState<'BOARD' | 'DIRECTOR' | 'ADMIN'>('BOARD');
  const [isPopoutView, setIsPopoutView] = useState(false); 
  const [isDirectorPoppedOut, setIsDirectorPoppedOut] = useState(false); 
  const directorWindowRef = useRef<Window | null>(null);

  // --- MODALS ---
  const [showEndGameConfirm, setShowEndGameConfirm] = useState(false);

  // --- ADMIN NOTIFICATIONS ---
  const [pendingRequests, setPendingRequests] = useState(0);

  // --- GAME STATE ---
  const [gameState, setGameState] = useState<GameState>({
    showTitle: '',
    isGameStarted: false,
    categories: [],
    players: [],
    activeQuestionId: null,
    activeCategoryId: null,
    selectedPlayerId: null,
    history: [],
    timer: {
      duration: 30,
      endTime: null,
      isRunning: false
    },
    viewSettings: {
      boardFontScale: 1.0,
      tileScale: 1.0,
      scoreboardScale: 1.0,
      updatedAt: new Date().toISOString()
    },
    lastPlays: []
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Layout Logging
  useEffect(() => {
    const logLayout = () => {
      const isCompact = window.innerWidth < 1024;
      logger.info("layout_mode", { compact: isCompact, width: window.innerWidth, height: window.innerHeight });
    };
    logLayout();
    window.addEventListener('resize', logLayout);
    return () => window.removeEventListener('resize', logLayout);
  }, []);

  // --- PERSISTENCE & SYNC ---
  const saveGameState = (state: GameState) => {
    localStorage.setItem('cruzpham_gamestate', JSON.stringify(state));
    setGameState(state);
  };

  const handleStorageChange = useCallback((e: StorageEvent) => {
    if (e.key === 'cruzpham_gamestate' && e.newValue) {
      setGameState(JSON.parse(e.newValue));
    }
  }, []);

  // Use Ref to access latest state in event listeners without re-binding
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // UI State Persistence Effect
  useEffect(() => {
    if (session) {
      const uiState = {
        activeShowId: activeShow?.id || null,
        viewMode: viewMode
      };
      localStorage.setItem('cruzpham_ui_state', JSON.stringify(uiState));
    }
  }, [activeShow, viewMode, session]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const tagName = active?.tagName.toLowerCase();
      const isInput = tagName === 'input' || tagName === 'textarea' || (active as HTMLElement)?.isContentEditable;
      if (isInput) return;

      const state = gameStateRef.current;

      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault(); 
        if (state.players.length === 0) return;
        const currentIdx = state.players.findIndex(p => p.id === state.selectedPlayerId);
        let newIdx = currentIdx === -1 ? 0 : currentIdx;
        if (e.code === 'ArrowUp') {
          newIdx = currentIdx - 1;
          if (newIdx < 0) newIdx = state.players.length - 1;
        } else {
          newIdx = currentIdx + 1;
          if (newIdx >= state.players.length) newIdx = 0;
        }
        const newId = state.players[newIdx].id;
        if (newId !== state.selectedPlayerId) {
          soundService.playSelect();
          saveGameState({ ...state, selectedPlayerId: newId });
        }
        return;
      }

      if (['=', '+', '-', '_'].includes(e.key)) {
         if (!state.selectedPlayerId) return;
         const delta = (e.key === '=' || e.key === '+') ? 100 : -100;
         soundService.playClick();
         saveGameState({
           ...state,
           players: state.players.map(p => p.id === state.selectedPlayerId ? { ...p, score: p.score + delta } : p)
         });
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Admin Polling
  useEffect(() => {
    let interval: number;
    if (session?.role === 'ADMIN' || session?.role === 'MASTER_ADMIN') {
        const check = () => {
            const reqs = authService.getRequests();
            const pending = reqs.filter(r => r.status === 'PENDING').length;
            setPendingRequests(prev => {
                if (pending > prev) {
                    soundService.playToast('info');
                    addToast('info', `New Request: ${pending} Pending`);
                }
                return pending;
            });
        };
        check(); 
        interval = window.setInterval(check, 30000); 
    }
    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'director') {
      setIsPopoutView(true);
      setViewMode('DIRECTOR');
      document.title = "Director Panel - CRUZPHAM STUDIOS";
    }

    window.addEventListener('storage', handleStorageChange);

    const initializeApp = async () => {
       try {
         const status = await authService.getBootstrapStatus();
         setIsConfigured(status.masterReady);

         if (status.masterReady) {
            const storedSessionId = localStorage.getItem('cruzpham_active_session_id');
            if (storedSessionId) {
               const result = await authService.restoreSession(storedSessionId);
               if (result.success && result.session) {
                  setSession({ id: result.session.id, username: result.session.username, role: result.session.role });
                  try {
                    const uiStateRaw = localStorage.getItem('cruzpham_ui_state');
                    if (uiStateRaw) {
                      const uiState = JSON.parse(uiStateRaw);
                      if (uiState.activeShowId) {
                        const restoredShow = dataService.getShowById(uiState.activeShowId);
                        if (restoredShow) setActiveShow(restoredShow);
                      }
                      if (uiState.viewMode) setViewMode(uiState.viewMode);
                    }
                  } catch (e) { logger.warn('hydrateUIStateFailed'); }
               } else {
                 localStorage.removeItem('cruzpham_active_session_id');
                 localStorage.removeItem('cruzpham_ui_state');
               }
            }
         }
         
         const savedState = localStorage.getItem('cruzpham_gamestate');
         if (savedState) {
           const parsed = JSON.parse(savedState);
           if (!parsed.viewSettings) {
             parsed.viewSettings = { boardFontScale: 1.0, tileScale: 1.0, scoreboardScale: 1.0, updatedAt: new Date().toISOString() };
           } else if (parsed.viewSettings.scoreboardScale === undefined) {
             parsed.viewSettings.scoreboardScale = 1.0;
           }
           if (!parsed.lastPlays) {
             parsed.lastPlays = [];
           }
           setGameState(parsed);
           if (parsed.showTitle && !activeShow) {
              setActiveShow(prev => prev || { id: 'restored-ghost', userId: 'restored', title: parsed.showTitle, createdAt: '' });
           }
         }
       } catch (e) {
         console.error("System Initialization Failed", e);
       } finally { setAuthChecked(true); }
    };
    initializeApp();
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const addToast = (type: ToastMessage['type'], message: string) => {
    setToasts(prev => [...prev, { id: Math.random().toString(), type, message }]);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // --- ACTIONS ---

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await authService.bootstrapMasterAdmin('admin');
      setBootstrapToken(token);
      setIsConfigured(true);
      addToast('success', 'Master Admin Created Successfully');
    } catch (e: any) {
      addToast('error', e.message);
      if (e.code === 'ERR_BOOTSTRAP_COMPLETE') setTimeout(() => window.location.reload(), 2000);
    }
  };

  const handlePopout = () => {
    const width = 1024;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    const win = window.open(window.location.href + (window.location.href.includes('?') ? '&' : '?') + 'view=director', 'CruzPhamDirector', `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if (win) {
      directorWindowRef.current = win;
      setIsDirectorPoppedOut(true);
      addToast('info', 'Director Panel detached.');
    } else {
      addToast('error', 'Popout blocked. Please allow popups.');
    }
  };

  const handleBringBack = () => {
    if (directorWindowRef.current) {
        directorWindowRef.current.close();
        directorWindowRef.current = null;
    }
    setIsDirectorPoppedOut(false);
  };

  const handleLoginSuccess = (newSession: Session) => {
    setSession({ id: newSession.id, username: newSession.username, role: newSession.role });
    localStorage.setItem('cruzpham_active_session_id', newSession.id);
    addToast('success', 'Welcome to CruzPham Trivia Studios!');
  };

  const handleLogout = () => {
    if (session) {
      authService.logout(session.id);
      setSession(null);
      setActiveShow(null);
      localStorage.removeItem('cruzpham_active_session_id');
      localStorage.removeItem('cruzpham_ui_state');
      localStorage.removeItem('cruzpham_gamestate');
      setViewMode('BOARD');
    }
  };

  // --- GAME LOGIC ---

  const handlePlayTemplate = (template: GameTemplate) => {
    const initCategories = template.categories.map(cat => {
      const hasDouble = cat.questions.some(q => q.isDoubleOrNothing);
      const luckyIndex = !hasDouble ? Math.floor(Math.random() * cat.questions.length) : -1;
      return {
        ...cat,
        questions: cat.questions.map((q, idx) => ({
          ...q,
          isAnswered: false,
          isRevealed: false,
          isVoided: false,
          isDoubleOrNothing: hasDouble ? (q.isDoubleOrNothing || false) : (idx === luckyIndex)
        }))
      };
    });

    const initPlayers: Player[] = (template.config.playerNames || []).map(name => ({
      id: crypto.randomUUID(), name, score: 0, color: '#ffffff', wildcardsUsed: 0, wildcardActive: false, stealsCount: 0
    }));

    if (initPlayers.length === 0 && template.config.playerCount > 0) {
      for (let i = 0; i < template.config.playerCount; i++) {
        initPlayers.push({ id: crypto.randomUUID(), name: `Player ${i + 1}`, score: 0, color: '#ffffff', wildcardsUsed: 0, wildcardActive: false, stealsCount: 0 });
      }
    }

    const newState: GameState = {
      ...gameState,
      showTitle: activeShow?.title || '',
      isGameStarted: true,
      categories: initCategories,
      players: initPlayers,
      activeQuestionId: null,
      activeCategoryId: null,
      selectedPlayerId: initPlayers.length > 0 ? initPlayers[0].id : null,
      history: [`Started: ${template.topic}`],
      timer: { duration: 30, endTime: null, isRunning: false },
      viewSettings: gameState.viewSettings || { boardFontScale: 1.0, tileScale: 1.0, scoreboardScale: 1.0, updatedAt: new Date().toISOString() },
      lastPlays: []
    };
    saveGameState(newState);
    if (viewMode !== 'BOARD') setViewMode('BOARD');
  };

  const handleEndGame = () => {
    if (isDirectorPoppedOut) handleBringBack();
    const newState: GameState = {
      ...gameState,
      isGameStarted: false,
      activeQuestionId: null,
      activeCategoryId: null,
      timer: { ...gameState.timer, endTime: null, isRunning: false },
      lastPlays: []
    };
    saveGameState(newState);
    setViewMode('BOARD');
    setShowEndGameConfirm(false);
    addToast('info', 'Game Session Ended');
  };

  const handleSelectQuestion = (catId: string, qId: string) => {
    saveGameState({ ...gameState, activeCategoryId: catId, activeQuestionId: qId });
  };

  const handleQuestionClose = (action: 'return' | 'void' | 'award' | 'steal', targetPlayerId?: string) => {
    const current = gameStateRef.current;
    const catIdx = current.categories.findIndex(c => c.id === current.activeCategoryId);
    const activeCat = current.categories[catIdx];
    const qIdx = activeCat?.questions.findIndex(q => q.id === current.activeQuestionId);
    const activeQ = activeCat?.questions[qIdx];

    if (!activeCat || !activeQ) {
       // Emergency escape if metadata is missing, close the modal at least
       saveGameState({ ...current, activeQuestionId: null, activeCategoryId: null });
       return;
    }

    logger.info("question_close_action", { action, qId: activeQ.id, targetPlayerId });

    const points = (activeQ.isDoubleOrNothing ? activeQ.points * 2 : activeQ.points);

    const newCategories = current.categories.map(c => {
      if (c.id !== current.activeCategoryId) return c;
      return {
        ...c,
        questions: c.questions.map(q => {
          if (q.id !== current.activeQuestionId) return q;
          return {
            ...q,
            isRevealed: false, 
            isAnswered: action === 'award' || action === 'steal',
            isVoided: action === 'void'
          };
        })
      };
    });

    let newPlayers = [...current.players];
    let awardedPlayerName = '';
    let stealerPlayerName = '';
    const attemptedPlayer = current.players.find(p => p.id === current.selectedPlayerId);

    if ((action === 'award' || action === 'steal') && targetPlayerId) {
      newPlayers = newPlayers.map(p => {
        if (p.id === targetPlayerId) {
          const isSteal = action === 'steal';
          const newStealsCount = isSteal ? (p.stealsCount || 0) + 1 : (p.stealsCount || 0);
          
          if (isSteal) {
            stealerPlayerName = p.name;
          } else {
            awardedPlayerName = p.name;
          }

          return { 
            ...p, 
            score: p.score + points,
            stealsCount: newStealsCount
          };
        }
        return p;
      });
    }

    // --- PLAY LOGGING (RESILIENT) ---
    let updatedPlays = current.lastPlays || [];
    try {
      const playEvent: PlayEvent = {
        id: `${Date.now()}-${activeQ.id}-${action}`,
        atIso: new Date().toISOString(),
        atMs: Date.now(),
        action: action.toUpperCase() as any,
        tileId: activeQ.id,
        categoryIndex: catIdx !== -1 ? catIdx : undefined,
        categoryName: activeCat.title || 'Unknown Category',
        rowIndex: qIdx !== -1 ? qIdx : undefined,
        basePoints: activeQ.points,
        effectivePoints: (action === 'award' || action === 'steal') ? points : undefined,
        attemptedPlayerId: attemptedPlayer?.id,
        attemptedPlayerName: attemptedPlayer?.name || 'Unknown Player',
        awardedPlayerId: action === 'award' ? targetPlayerId : undefined,
        awardedPlayerName: action === 'award' ? (awardedPlayerName || 'Unknown Player') : undefined,
        stealerPlayerId: action === 'steal' ? targetPlayerId : undefined,
        stealerPlayerName: action === 'steal' ? (stealerPlayerName || 'Unknown Player') : undefined,
        notes: activeQ.isDoubleOrNothing ? 'Double or Nothing Applied' : undefined
      };

      updatedPlays = [playEvent, ...updatedPlays].slice(0, 4);
      logger.info("game_play_event", { ...playEvent });
    } catch (err: any) {
      logger.error("game_play_event_construction_failed", { action, tileId: activeQ.id, message: err.message });
      // Non-blocking: continue without the log record
    }

    const newState: GameState = {
      ...current,
      categories: newCategories,
      players: newPlayers,
      activeQuestionId: null,
      activeCategoryId: null,
      timer: { ...current.timer, endTime: null, isRunning: false },
      lastPlays: updatedPlays
    };
    
    saveGameState(newState);
    
    if ((action === 'award' || action === 'steal') && targetPlayerId) {
      const name = newPlayers.find(p => p.id === targetPlayerId)?.name || 'Unknown';
      addToast('success', `${points} Points to ${name} ${action === 'steal' ? '(Steal!)' : ''}`);
    }
  };

  const handleAddPlayer = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) return;
    
    logger.info("player_add_attempt", { name: trimmed });

    if (gameState.players.length >= 8) {
      addToast('error', 'Maximum 8 players allowed.');
      logger.warn("player_add_failed", { reason: "LIMIT_REACHED", message: "Max players 8" });
      return;
    }

    let finalName = trimmed;
    let count = 2;
    const existingNames = gameState.players.map(p => p.name.toLowerCase());
    while (existingNames.includes(finalName.toLowerCase())) {
      finalName = `${trimmed} ${count}`;
      count++;
    }

    const newPlayer: Player = { 
      id: crypto.randomUUID(), 
      name: finalName, 
      score: 0, 
      color: '#fff', 
      wildcardsUsed: 0, 
      wildcardActive: false, 
      stealsCount: 0 
    };

    logger.info("player_add_success", { playerId: newPlayer.id, name: finalName, totalPlayers: gameState.players.length + 1 });
    
    saveGameState({ 
      ...gameState, 
      players: [...gameState.players, newPlayer],
      selectedPlayerId: gameState.selectedPlayerId || newPlayer.id 
    });
  };

  const handleUpdateScore = (playerId: string, delta: number) => {
    saveGameState({ ...gameState, players: gameState.players.map(p => p.id === playerId ? { ...p, score: p.score + delta } : p) });
  };

  const handleSelectPlayer = (id: string) => {
    soundService.playSelect();
    saveGameState({ ...gameState, selectedPlayerId: id });
  };

  if (!authChecked) return (
    <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
      <div className="flex flex-col items-center gap-4">
         <Loader2 className="w-12 h-12 text-gold-500 animate-spin" />
         <p className="text-zinc-500 text-sm uppercase tracking-widest font-bold">Loading Studio...</p>
      </div>
    </div>
  );

  if (!isConfigured) return (
    <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="max-w-md w-full p-8 border border-gold-600 rounded-2xl bg-zinc-900 text-center relative overflow-hidden">
        <h1 className="text-3xl font-serif text-gold-500 mb-4">SYSTEM BOOTSTRAP</h1>
        <button onClick={handleBootstrap} className="w-full bg-gold-600 text-black font-bold py-3 rounded uppercase tracking-wider hover:bg-gold-500">Create Master Admin</button>
      </div>
    </div>
  );

  if (bootstrapToken) return (
    <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
      <div className="max-w-md w-full p-8 border border-red-600 rounded-2xl bg-zinc-900 text-center">
         <h1 className="text-3xl font-serif text-red-500 mb-4">MASTER TOKEN GENERATED</h1>
         <div className="bg-black p-4 rounded border border-zinc-700 flex items-center justify-between mb-8">
           <code className="text-gold-500 font-mono text-lg">{bootstrapToken}</code>
           <button onClick={() => navigator.clipboard.writeText(bootstrapToken)} className="text-zinc-500 hover:text-white"><Copy className="w-5 h-5"/></button>
         </div>
         <button onClick={() => setBootstrapToken(null)} className="w-full bg-zinc-800 text-white font-bold py-3 rounded uppercase tracking-wider">I have saved it safely</button>
      </div>
    </div>
  );

  if (isPopoutView) {
    if (!session) return <div className="p-8 text-center text-white">Authentication required.</div>;
    return (
      <div className="h-screen w-screen bg-zinc-950 text-white overflow-hidden">
        <DirectorPanel gameState={gameState} onUpdateState={saveGameState} addToast={addToast} />
        <ToastContainer toasts={toasts} removeToast={removeToast} />
      </div>
    );
  }

  const activeCategory = gameState.categories.find(c => c.id === gameState.activeCategoryId);
  const activeQuestion = activeCategory?.questions.find(q => q.id === gameState.activeQuestionId);
  const isAdmin = session?.role === 'ADMIN' || session?.role === 'MASTER_ADMIN';
  const showShortcuts = viewMode === 'BOARD' && gameState.isGameStarted;

  return (
    <AppShell activeShowTitle={gameState.showTitle || (activeShow ? activeShow.title : undefined)} username={session?.username} onLogout={handleLogout} shortcuts={showShortcuts ? <ShortcutsPanel /> : null}>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <ConfirmationModal isOpen={showEndGameConfirm} title="End Game?" message="This will close the current game session and return to the template library." confirmLabel="End Game" isDanger={true} onConfirm={handleEndGame} onCancel={() => setShowEndGameConfirm(false)} />
      {!session ? (
        <LoginScreen onLoginSuccess={handleLoginSuccess} addToast={addToast} />
      ) : (
        <>
          {!activeShow ? (
            <>
               <ShowSelection username={session.username} onSelectShow={setActiveShow} />
               {isAdmin && (
                 <div className="absolute bottom-4 right-4">
                   <button onClick={() => setViewMode('ADMIN')} className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-500 hover:text-gold-500 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-full relative group">
                     <Shield className="w-3 h-3" /> Admin Console
                     {pendingRequests > 0 && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-red-500/50">{pendingRequests}</span>}
                   </button>
                 </div>
               )}
               {viewMode === 'ADMIN' && <div className="fixed inset-0 z-50"><AdminPanel currentUser={session.username} onClose={() => setViewMode('BOARD')} addToast={addToast} /></div>}
            </>
          ) : (
            <>
               {!gameState.isGameStarted && (
                 <div className="flex justify-center mb-2 pt-2 relative z-20">
                   <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-full flex gap-1">
                     <button onClick={() => setViewMode('BOARD')} className={`px-6 py-2 rounded-full text-xs font-bold uppercase flex items-center gap-2 ${viewMode === 'BOARD' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}><Monitor className="w-3 h-3" /> Board</button>
                     <button onClick={() => setViewMode('DIRECTOR')} className={`px-6 py-2 rounded-full text-xs font-bold uppercase flex items-center gap-2 ${viewMode === 'DIRECTOR' ? 'bg-gold-600 text-black' : 'text-zinc-500 hover:text-white'}`}><Grid className="w-3 h-3" /> Director</button>
                     {isAdmin && <button onClick={() => setViewMode('ADMIN')} className={`px-6 py-2 rounded-full text-xs font-bold uppercase flex items-center gap-2 ${viewMode === 'ADMIN' ? 'bg-purple-600 text-white' : 'text-zinc-500 hover:text-white'}`}><Shield className="w-3 h-3" /> Admin</button>}
                   </div>
                 </div>
               )}
               <div className="flex-1 relative overflow-hidden lg:h-full">
                 <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'BOARD' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                    {!gameState.isGameStarted ? (
                      <TemplateDashboard show={activeShow} onSwitchShow={() => setActiveShow(null)} onPlayTemplate={handlePlayTemplate} addToast={addToast} onLogout={handleLogout} />
                    ) : (
                      <>
                        <div className="flex flex-col md:flex-row h-full w-full overflow-y-auto lg:overflow-hidden lg:h-full">
                          <div className="flex-1 order-2 md:order-1 h-full lg:overflow-hidden relative flex flex-col min-w-0">
                            <div className="flex-none h-12 px-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-950 z-20">
                              <button onClick={() => { soundService.playClick(); setShowEndGameConfirm(true); }} type="button" className="text-[10px] md:text-xs uppercase text-red-500 hover:text-red-400 font-bold tracking-wider flex items-center gap-2"><Power className="w-3 h-3" /> End Show</button>
                              <button onClick={() => setViewMode('DIRECTOR')} className="text-[10px] md:text-xs uppercase font-bold text-zinc-400 hover:text-white flex items-center gap-2 px-3 py-1.5 rounded transition-colors"><Grid className="w-3 h-3" /> Director</button>
                            </div>
                            <div className="flex-1 relative w-full h-full lg:overflow-hidden"><GameBoard categories={gameState.categories} onSelectQuestion={handleSelectQuestion} viewSettings={gameState.viewSettings} /></div>
                          </div>
                          <div className="order-1 md:order-2 flex-none h-auto lg:h-full w-full md:w-auto relative z-30">
                            <Scoreboard players={gameState.players} selectedPlayerId={gameState.selectedPlayerId} onAddPlayer={handleAddPlayer} onUpdateScore={handleUpdateScore} onSelectPlayer={handleSelectPlayer} gameActive={gameState.isGameStarted} viewSettings={gameState.viewSettings} />
                          </div>
                        </div>
                        {activeQuestion && activeCategory && (
                          <QuestionModal question={activeQuestion} categoryTitle={activeCategory.title} players={gameState.players} selectedPlayerId={gameState.selectedPlayerId} timer={gameState.timer} onClose={handleQuestionClose} onReveal={() => {
                              const newState = { ...gameState, categories: gameState.categories.map(c => c.id === gameState.activeCategoryId ? { ...c, questions: c.questions.map(q => q.id === gameState.activeQuestionId ? { ...q, isRevealed: true } : q) } : c) };
                              saveGameState(newState);
                          }} />
                        )}
                      </>
                    )}
                 </div>
                 <div className={`absolute inset-0 transition-opacity duration-300 bg-zinc-950 ${viewMode === 'DIRECTOR' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                   <DirectorPanel gameState={gameState} onUpdateState={saveGameState} onPopout={handlePopout} isPoppedOut={isDirectorPoppedOut} onBringBack={handleBringBack} addToast={addToast} onClose={() => setViewMode('BOARD')} />
                 </div>
                 {viewMode === 'ADMIN' && <div className="absolute inset-0 z-50 bg-zinc-950"><AdminPanel currentUser={session.username} onClose={() => setViewMode('BOARD')} addToast={addToast} /></div>}
               </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
};

export default App;