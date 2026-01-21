
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
import { GameState, Category, Player, ToastMessage, Question, Show, GameTemplate, UserRole, Session } from './types';
import { soundService } from './services/soundService';
import { logger } from './services/logger';
import { firebaseConfigError, firebaseConfig, missingKeys } from './services/firebase';
import { Monitor, Grid, Shield, Copy, Loader2, ExternalLink, Power, AlertTriangle, Terminal } from 'lucide-react';
import { UpdatePrompt } from './components/UpdatePrompt';

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
    }
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
          const newState = { ...state, selectedPlayerId: newId };
          localStorage.setItem('cruzpham_gamestate', JSON.stringify(newState));
          setGameState(newState);
        }
        return;
      }

      if (['=', '+', '-', '_'].includes(e.key)) {
         if (!state.selectedPlayerId) return;
         const delta = (e.key === '=' || e.key === '+') ? 100 : -100;
         soundService.playClick();
         const newState = {
           ...state,
           players: state.players.map(p => p.id === state.selectedPlayerId ? { ...p, score: p.score + delta } : p)
         };
         localStorage.setItem('cruzpham_gamestate', JSON.stringify(newState));
         setGameState(newState);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Admin Notification Listener
  useEffect(() => {
    let unsub: (() => void) | undefined;
    if (session?.role === 'ADMIN' || session?.role === 'MASTER_ADMIN') {
        try {
          unsub = authService.subscribeToRequests((reqs) => {
               const pending = reqs.filter(r => r.status === 'PENDING').length;
               setPendingRequests(prev => {
                  if (pending > prev) {
                      soundService.playToast('info');
                      addToast('info', `New Request: ${pending} Pending`);
                  }
                  return pending;
              });
          });
        } catch (e) {
          logger.warn('Admin notifications unavailable');
        }
    }
    return () => {
       if (unsub) unsub();
    };
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
       // --- HARD STOP: INVALID CONFIG ---
       if (firebaseConfigError) {
         logger.info('bootstrapSkippedDueToInvalidConfig');
         // Clean up service workers if config is broken to prevent stale caching loops
         if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    registration.unregister();
                }
                logger.warn('Unregistered Service Workers due to config error');
            }).catch(error => {
                console.warn('Failed to get SW registrations (Config Error Handler):', error);
            });
         }
         setAuthChecked(true); // Render Config Error Screen
         return;
       }

       logger.info('bootstrapStarted');
       try {
         const status = await authService.getBootstrapStatus();
         setIsConfigured(status.masterReady);

         if (status.masterReady) {
            const storedSessionId = localStorage.getItem('cruzpham_active_session_id');
            if (storedSessionId) {
               const result = await authService.restoreSession(storedSessionId);
               if (result.success && result.session) {
                  setSession({ 
                    id: result.session.id, 
                    username: result.session.username, 
                    role: result.session.role 
                  });
                  try {
                    const uiStateRaw = localStorage.getItem('cruzpham_ui_state');
                    if (uiStateRaw) {
                      const uiState = JSON.parse(uiStateRaw);
                      if (uiState.activeShowId) {
                        const restoredShow = dataService.getShowById(uiState.activeShowId);
                        if (restoredShow) {
                          setActiveShow(restoredShow);
                        }
                      }
                      if (uiState.viewMode) {
                        setViewMode(uiState.viewMode);
                      }
                    }
                  } catch (e) {
                    logger.warn('hydrateUIStateFailed');
                  }
               } else {
                 localStorage.removeItem('cruzpham_active_session_id');
                 localStorage.removeItem('cruzpham_ui_state');
               }
            }
         }
         
         const savedState = localStorage.getItem('cruzpham_gamestate');
         if (savedState) {
           const parsed = JSON.parse(savedState);
           setGameState(parsed);
           if (parsed.showTitle && !activeShow) {
              setActiveShow(prev => prev || { id: 'restored-ghost', userId: 'restored', title: parsed.showTitle, createdAt: '' });
           }
         }
         logger.info('bootstrapCompleted');
       } catch (e) {
         console.error("System Initialization Failed", e);
       } finally {
         setAuthChecked(true); 
       }
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
      if (e.code === 'ERR_BOOTSTRAP_COMPLETE') {
         setTimeout(() => window.location.reload(), 2000);
      }
    }
  };

  const handlePopout = () => {
    const width = 1024;
    const height = 800;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;
    
    const win = window.open(
      window.location.href + (window.location.href.includes('?') ? '&' : '?') + 'view=director',
      'CruzPhamDirector',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

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

  // --- GAME LOGIC (Omitted for brevity, unchanged) ---
  const handlePlayTemplate = (template: GameTemplate) => { /* ... existing logic ... */ 
    const initCategories = template.categories.map(cat => {
      const hasDouble = cat.questions.some(q => q.isDoubleOrNothing);
      const luckyIndex = !hasDouble ? Math.floor(Math.random() * cat.questions.length) : -1;
      return {
        ...cat,
        questions: cat.questions.map((q, idx) => ({
          ...q, isAnswered: false, isRevealed: false, isVoided: false,
          isDoubleOrNothing: hasDouble ? (q.isDoubleOrNothing || false) : (idx === luckyIndex)
        }))
      };
    });
    const initPlayers: Player[] = (template.config.playerNames || []).map(name => ({ id: crypto.randomUUID(), name: name, score: 0, color: '#ffffff' }));
    if (initPlayers.length === 0 && template.config.playerCount > 0) {
      for (let i = 0; i < template.config.playerCount; i++) initPlayers.push({ id: crypto.randomUUID(), name: `Player ${i + 1}`, score: 0, color: '#ffffff' });
    }
    const newState: GameState = { ...gameState, showTitle: activeShow?.title || '', isGameStarted: true, categories: initCategories, players: initPlayers, activeQuestionId: null, activeCategoryId: null, selectedPlayerId: initPlayers.length > 0 ? initPlayers[0].id : null, history: [`Started: ${template.topic}`], timer: { duration: 30, endTime: null, isRunning: false } };
    saveGameState(newState);
    if (viewMode !== 'BOARD') setViewMode('BOARD');
  };
  const handleEndGame = () => {
    try {
      if (isDirectorPoppedOut) handleBringBack();
      setGameState(prev => {
        const newState: GameState = { ...prev, isGameStarted: false, activeQuestionId: null, activeCategoryId: null, timer: { ...prev.timer, endTime: null, isRunning: false } };
        localStorage.setItem('cruzpham_gamestate', JSON.stringify(newState));
        return newState;
      });
      setViewMode('BOARD');
      setShowEndGameConfirm(false);
      addToast('info', 'Game Session Ended');
    } catch (e: any) { addToast('error', 'Could not end game cleanly.'); }
  };
  const handleSelectQuestion = (catId: string, qId: string) => { saveGameState({ ...gameState, activeCategoryId: catId, activeQuestionId: qId }); };
  const handleQuestionClose = (action: 'return' | 'void' | 'award' | 'steal', targetPlayerId?: string) => {
    setGameState(prev => {
      const activeCat = prev.categories.find(c => c.id === prev.activeCategoryId);
      const activeQ = activeCat?.questions.find(q => q.id === prev.activeQuestionId);
      if (!activeCat || !activeQ) return prev;
      const points = (activeQ.isDoubleOrNothing ? activeQ.points * 2 : activeQ.points);
      const newCategories = prev.categories.map(c => {
        if (c.id !== prev.activeCategoryId) return c;
        return { ...c, questions: c.questions.map(q => { if (q.id !== prev.activeQuestionId) return q; return { ...q, isRevealed: false, isAnswered: action === 'award' || action === 'steal', isVoided: action === 'void' }; }) };
      });
      let newPlayers = [...prev.players];
      if ((action === 'award' || action === 'steal') && targetPlayerId) {
        newPlayers = newPlayers.map(p => p.id === targetPlayerId ? { ...p, score: p.score + points } : p);
        addToast('success', `${points} Points to ${newPlayers.find(p => p.id === targetPlayerId)?.name}`);
      }
      const newState = { ...prev, categories: newCategories, players: newPlayers, activeQuestionId: null, activeCategoryId: null, timer: { ...prev.timer, endTime: null, isRunning: false } };
      saveGameState(newState);
      return newState;
    });
  };
  const handleAddPlayer = (name: string) => { setGameState(prev => { const newPlayer: Player = { id: crypto.randomUUID(), name, score: 0, color: '#fff' }; const newState = { ...prev, players: [...prev.players, newPlayer], selectedPlayerId: prev.selectedPlayerId || newPlayer.id }; saveGameState(newState); return newState; }); };
  const handleUpdateScore = (playerId: string, delta: number) => { setGameState(prev => { const newState = { ...prev, players: prev.players.map(p => p.id === playerId ? { ...p, score: p.score + delta } : p) }; saveGameState(newState); return newState; }); };
  const handleSelectPlayer = (id: string) => { soundService.playSelect(); setGameState(prev => { const newState = { ...prev, selectedPlayerId: id }; saveGameState(newState); return newState; }); };

  // --- RENDER ---
  
  if (firebaseConfigError) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-black text-red-500 text-center p-8 space-y-4 font-mono">
        <AlertTriangle className="w-16 h-16" />
        <h1 className="text-2xl font-bold uppercase tracking-widest">Configuration Error</h1>
        <p className="max-w-md text-zinc-400 text-sm">
          The studio environment is missing required secure keys.
          <br/>Please contact the administrator or check deployment environment variables.
        </p>
        {missingKeys.length > 0 && (
          <div className="text-xs text-zinc-600 border border-zinc-800 p-4 rounded bg-zinc-900/50 w-full max-w-lg text-left">
            <strong className="block mb-2 text-zinc-500">MISSING VARIABLES:</strong>
            <ul className="list-disc pl-4 space-y-1">
              {missingKeys.map(key => (
                <li key={key}>REACT_APP_FIREBASE_{key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase()}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // 1. Initial Loading Gate
  if (!authChecked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
        <div className="flex flex-col items-center gap-4">
           <Loader2 className="w-12 h-12 text-gold-500 animate-spin" />
           <p className="text-zinc-500 text-sm uppercase tracking-widest font-bold">Loading Studio...</p>
        </div>
      </div>
    );
  }

  // 2. BOOTSTRAP VIEW (Only if not configured)
  if (!isConfigured) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="max-w-md w-full p-8 border border-gold-600 rounded-2xl bg-zinc-900 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold-500 to-transparent animate-pulse" />
          <h1 className="text-3xl font-serif text-gold-500 mb-4">SYSTEM BOOTSTRAP</h1>
          <p className="text-zinc-400 mb-8">No Master Admin detected.<br/>Setup Studio System to begin.</p>
          <button onClick={handleBootstrap} className="w-full bg-gold-600 text-black font-bold py-3 rounded uppercase tracking-wider hover:bg-gold-500 transition-all">
            Create Master Admin
          </button>
        </div>
      </div>
    );
  }

  // 3. BOOTSTRAP SUCCESS (Show Token Once)
  if (bootstrapToken) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
        <div className="max-w-md w-full p-8 border border-red-600 rounded-2xl bg-zinc-900 text-center">
           <h1 className="text-3xl font-serif text-red-500 mb-4">MASTER TOKEN GENERATED</h1>
           <p className="text-zinc-400 mb-4">This is the ONLY time this token will be visible. Copy it now.</p>
           <div className="bg-black p-4 rounded border border-zinc-700 flex items-center justify-between mb-8">
             <code className="text-gold-500 font-mono text-lg">{bootstrapToken}</code>
             <button onClick={() => navigator.clipboard.writeText(bootstrapToken)} className="text-zinc-500 hover:text-white"><Copy className="w-5 h-5"/></button>
           </div>
           <button onClick={() => setBootstrapToken(null)} className="w-full bg-zinc-800 text-white font-bold py-3 rounded uppercase tracking-wider hover:bg-zinc-700">
             I have saved it safely
           </button>
        </div>
      </div>
    );
  }

  // 4. Popout Mode
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

  // 5. MAIN APP
  return (
    <AppShell 
      activeShowTitle={gameState.showTitle || (activeShow ? activeShow.title : undefined)}
      username={session?.username}
      onLogout={handleLogout}
      shortcuts={showShortcuts ? <ShortcutsPanel /> : null}
    >
      <UpdatePrompt />
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <ConfirmationModal 
         isOpen={showEndGameConfirm}
         title="End Game?"
         message="This will close the current game session and return to the template library. Any unsaved scores will be kept in history but the board will close."
         confirmLabel="End Game"
         isDanger={true}
         onConfirm={handleEndGame}
         onCancel={() => setShowEndGameConfirm(false)}
      />
      
      {!session ? (
        <LoginScreen onLoginSuccess={handleLoginSuccess} addToast={addToast} />
      ) : (
        <>
          {/* Main App Content */}
          {!activeShow ? (
            <>
               <ShowSelection username={session.username} onSelectShow={setActiveShow} />
               
               {/* Admin/Dev Status Footer (Only Visible if Admin or Dev) */}
               {(isAdmin || process.env.NODE_ENV === 'development') && (
                 <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-none">
                   <div className="pointer-events-auto">
                     {isAdmin && (
                        <button onClick={() => setViewMode('ADMIN')} className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-500 hover:text-gold-500 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-full transition-all relative group">
                          <Shield className="w-3 h-3" /> Admin Console
                          {pendingRequests > 0 && (
                            <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-lg shadow-red-500/50">
                              {pendingRequests}
                            </span>
                          )}
                        </button>
                     )}
                   </div>
                   {/* Debug Footer */}
                   <div className="text-[9px] text-zinc-700 font-mono bg-black/50 px-2 py-1 rounded flex items-center gap-2 border border-zinc-900/50 backdrop-blur-sm">
                     <Terminal className="w-3 h-3" />
                     PID: {firebaseConfig.projectId || 'Unknown'} | v{process.env.REACT_APP_VERSION || '1.0.0'}
                   </div>
                 </div>
               )}

               {viewMode === 'ADMIN' && (
                 <div className="fixed inset-0 z-50 animate-in fade-in slide-in-from-bottom duration-300">
                    <AdminPanel currentUser={session.username} onClose={() => setViewMode('BOARD')} addToast={addToast} />
                 </div>
               )}
            </>
          ) : (
            <>
               {/* TABS (Only if show is selected and not in game) */}
               {!gameState.isGameStarted && (
                 <div className="flex justify-center mb-2 animate-in fade-in slide-in-from-top duration-300 relative z-20 pt-2">
                   <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-full flex gap-1">
                     <button 
                       onClick={() => setViewMode('BOARD')}
                       className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'BOARD' ? 'bg-gold-600 text-black shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-white'}`}
                     >
                       <Monitor className="w-3 h-3" /> Board
                     </button>
                     <button 
                       onClick={() => setViewMode('DIRECTOR')}
                       className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'DIRECTOR' ? 'bg-gold-600 text-black shadow-lg shadow-gold-500/20' : 'text-zinc-500 hover:text-white'}`}
                     >
                       <Grid className="w-3 h-3" /> Director
                     </button>
                     {isAdmin && (
                       <button 
                         onClick={() => setViewMode('ADMIN')}
                         className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all relative ${viewMode === 'ADMIN' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-zinc-500 hover:text-white'}`}
                       >
                         <Shield className="w-3 h-3" /> Admin
                         {pendingRequests > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse border border-zinc-900" />}
                       </button>
                     )}
                   </div>
                 </div>
               )}

               <div className="flex-1 relative overflow-hidden">
                 {/* BOARD VIEW */}
                 <div className={`absolute inset-0 transition-opacity duration-300 ${viewMode === 'BOARD' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                    {!gameState.isGameStarted ? (
                      <TemplateDashboard 
                        show={activeShow} 
                        onSwitchShow={() => setActiveShow(null)} 
                        onPlayTemplate={handlePlayTemplate}
                        addToast={addToast}
                      />
                    ) : (
                      <>
                        <div className="flex flex-col md:flex-row h-full w-full overflow-hidden">
                          {/* Board Area */}
                          <div className="flex-1 order-2 md:order-1 h-full overflow-hidden relative flex flex-col min-w-0">
                             {/* Game Board Header / Control Bar */}
                            <div className="flex-none h-10 px-4 flex items-center justify-between border-b border-zinc-800 bg-zinc-950 z-20">
                              <button 
                                onClick={() => { soundService.playClick(); setShowEndGameConfirm(true); }} 
                                type="button"
                                className="text-xs uppercase text-red-500 hover:text-red-400 font-bold tracking-wider flex items-center gap-2"
                              >
                                <Power className="w-3 h-3" /> End Show
                              </button>
                              
                              <button 
                                onClick={() => setViewMode('DIRECTOR')} 
                                className={`text-xs uppercase font-bold tracking-wider flex items-center gap-2 px-3 py-1.5 rounded transition-colors ${isDirectorPoppedOut ? 'bg-zinc-900 text-gold-500 border border-gold-900/50' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}
                              >
                                {isDirectorPoppedOut ? <ExternalLink className="w-3 h-3" /> : <Grid className="w-3 h-3" />}
                                <span>Director {isDirectorPoppedOut ? '(Detached)' : ''}</span>
                              </button>
                            </div>

                            {/* Main Board */}
                            <div className="flex-1 relative w-full h-full overflow-hidden">
                              <GameBoard categories={gameState.categories} onSelectQuestion={handleSelectQuestion} />
                            </div>
                          </div>
                          
                          {/* Scoreboard Area - Responsive Split */}
                          <div className="order-1 md:order-2 flex-none h-[25vh] md:h-full w-full md:w-auto relative z-30">
                            <Scoreboard 
                                players={gameState.players} 
                                selectedPlayerId={gameState.selectedPlayerId}
                                onAddPlayer={handleAddPlayer} 
                                onUpdateScore={handleUpdateScore} 
                                onSelectPlayer={handleSelectPlayer}
                                gameActive={gameState.isGameStarted} 
                            />
                          </div>
                        </div>
                        
                        {activeQuestion && activeCategory && (
                          <QuestionModal 
                            question={activeQuestion}
                            categoryTitle={activeCategory.title}
                            players={gameState.players}
                            selectedPlayerId={gameState.selectedPlayerId}
                            timer={gameState.timer}
                            onClose={handleQuestionClose}
                            onReveal={() => {
                              setGameState(prev => {
                                const newState = {
                                  ...prev,
                                  categories: prev.categories.map(c => c.id === prev.activeCategoryId ? {
                                    ...c, questions: c.questions.map(q => q.id === prev.activeQuestionId ? { ...q, isRevealed: true } : q)
                                  } : c)
                                };
                                saveGameState(newState);
                                return newState;
                              });
                            }}
                          />
                        )}
                      </>
                    )}
                 </div>

                 {/* DIRECTOR VIEW */}
                 <div className={`absolute inset-0 transition-opacity duration-300 bg-zinc-950 ${viewMode === 'DIRECTOR' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                   <DirectorPanel 
                     gameState={gameState}
                     onUpdateState={saveGameState}
                     onPopout={handlePopout}
                     isPoppedOut={isDirectorPoppedOut}
                     onBringBack={handleBringBack}
                     addToast={addToast}
                     onClose={() => setViewMode('BOARD')}
                   />
                 </div>

                 {/* ADMIN VIEW */}
                 {viewMode === 'ADMIN' && (
                    <div className="absolute inset-0 z-50 bg-zinc-950 animate-in fade-in slide-in-from-bottom">
                      <AdminPanel currentUser={session.username} onClose={() => setViewMode('BOARD')} addToast={addToast} />
                    </div>
                 )}
               </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
};

export default App;
