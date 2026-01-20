import React, { useState, useEffect, useCallback } from 'react';
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
import { authService } from './services/authService';
import { GameState, Category, Player, ToastMessage, Question, Show, GameTemplate, UserRole } from './types';
import { soundService } from './services/soundService';
import { logger } from './services/logger';
import { Monitor, Grid, Shield, Copy } from 'lucide-react';

const App: React.FC = () => {
  const [isConfigured, setIsConfigured] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState<string | null>(null);

  const [session, setSession] = useState<{ id: string; username: string; role: UserRole } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeShow, setActiveShow] = useState<Show | null>(null);

  // --- VIEW STATE ---
  const [viewMode, setViewMode] = useState<'BOARD' | 'DIRECTOR' | 'ADMIN'>('BOARD');
  const [isPopoutView, setIsPopoutView] = useState(false); // Am I the popout?
  const [isDirectorPoppedOut, setIsDirectorPoppedOut] = useState(false); // Is there a popout open elsewhere?

  // --- GAME STATE ---
  const [gameState, setGameState] = useState<GameState>({
    showTitle: '',
    isGameStarted: false,
    categories: [],
    players: [],
    activeQuestionId: null,
    activeCategoryId: null,
    selectedPlayerId: null,
    history: []
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

  useEffect(() => {
    // Check if I am a popout
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('view') === 'director') {
      setIsPopoutView(true);
      setViewMode('DIRECTOR');
      document.title = "Director Panel - CRUZPHAM STUDIOS";
    }

    // Sync Listener
    window.addEventListener('storage', handleStorageChange);

    // Bootstrap Check
    const configured = authService.isConfigured();
    setIsConfigured(configured);

    if (configured) {
       // Restore Auth
      const restoreAuth = async () => {
        const sessions = JSON.parse(localStorage.getItem('cruzpham_db_sessions') || '{}');
        const sessionIds = Object.keys(sessions);
        if (sessionIds.length > 0) {
          const lastId = sessionIds[sessionIds.length - 1]; 
          const result = await authService.restoreSession(lastId);
          if (result.success && result.session) {
            setSession({ id: result.session.id, username: result.session.username, role: result.session.role });
          }
        }
        setAuthChecked(true);
      };
      restoreAuth();
    } else {
      setAuthChecked(true);
    }
    
    // Restore Game State
    const savedState = localStorage.getItem('cruzpham_gamestate');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        setGameState(parsed);
        if (parsed.showTitle && !activeShow) {
           setActiveShow({ id: 'restored', userId: 'restored', title: parsed.showTitle, createdAt: '' });
        }
      } catch (e) {
        console.error('Failed to restore game state', e);
      }
    }

    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const addToast = (type: ToastMessage['type'], message: string) => {
    setToasts(prev => [...prev, { id: Math.random().toString(), type, message }]);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // --- ACTIONS ---

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = await authService.bootstrapMasterAdmin('admin');
    setBootstrapToken(token);
    setIsConfigured(true);
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
      setIsDirectorPoppedOut(true);
      addToast('info', 'Director Panel detached.');
      logger.info('popoutOpened');
    } else {
      addToast('error', 'Popout blocked. Please allow popups.');
    }
  };

  const handleBringBack = () => {
    setIsDirectorPoppedOut(false);
    logger.info('popoutClosed');
  };

  // --- GAME LOGIC ---

  const handlePlayTemplate = (template: GameTemplate) => {
    const initCategories = template.categories.map(cat => {
      const luckyIndex = Math.floor(Math.random() * cat.questions.length);
      return {
        ...cat,
        questions: cat.questions.map((q, idx) => ({
          ...q,
          isAnswered: false,
          isRevealed: false,
          isVoided: false,
          isDoubleOrNothing: idx === luckyIndex
        }))
      };
    });

    const newState: GameState = {
      ...gameState,
      showTitle: activeShow?.title || '',
      isGameStarted: true,
      categories: initCategories,
      activeQuestionId: null,
      history: [`Started: ${template.topic}`]
    };
    saveGameState(newState);
  };

  const handleSelectQuestion = (catId: string, qId: string) => {
    const newState = { ...gameState, activeCategoryId: catId, activeQuestionId: qId };
    saveGameState(newState);
  };

  const handleQuestionClose = (action: 'return' | 'void' | 'award' | 'steal', targetPlayerId?: string) => {
    setGameState(prev => {
      const activeCat = prev.categories.find(c => c.id === prev.activeCategoryId);
      const activeQ = activeCat?.questions.find(q => q.id === prev.activeQuestionId);
      if (!activeCat || !activeQ) return prev;

      const points = (activeQ.isDoubleOrNothing ? activeQ.points * 2 : activeQ.points);

      const newCategories = prev.categories.map(c => {
        if (c.id !== prev.activeCategoryId) return c;
        return {
          ...c,
          questions: c.questions.map(q => {
            if (q.id !== prev.activeQuestionId) return q;
            return {
              ...q,
              isRevealed: false, 
              isAnswered: action === 'award' || action === 'steal',
              isVoided: action === 'void'
            };
          })
        };
      });

      let newPlayers = [...prev.players];
      if ((action === 'award' || action === 'steal') && targetPlayerId) {
        newPlayers = newPlayers.map(p => p.id === targetPlayerId ? { ...p, score: p.score + points } : p);
        addToast('success', `${points} Points to ${newPlayers.find(p => p.id === targetPlayerId)?.name}`);
      }
      
      const newState = {
        ...prev,
        categories: newCategories,
        players: newPlayers,
        activeQuestionId: null,
        activeCategoryId: null
      };
      saveGameState(newState);
      return newState;
    });
  };

  const handleAddPlayer = (name: string) => {
    setGameState(prev => {
      const newPlayer: Player = { id: crypto.randomUUID(), name, score: 0, color: '#fff' };
      const newState = { 
        ...prev, 
        players: [...prev.players, newPlayer],
        selectedPlayerId: prev.selectedPlayerId || newPlayer.id 
      };
      saveGameState(newState);
      return newState;
    });
  };

  const handleUpdateScore = (playerId: string, delta: number) => {
    setGameState(prev => {
      const newState = { ...prev, players: prev.players.map(p => p.id === playerId ? { ...p, score: p.score + delta } : p) };
      saveGameState(newState);
      return newState;
    });
  };

  const handleSelectPlayer = (id: string) => {
    soundService.playSelect();
    setGameState(prev => {
      const newState = { ...prev, selectedPlayerId: id };
      saveGameState(newState);
      return newState;
    });
  };

  // --- RENDER ---
  if (!authChecked) return null;

  // BOOTSTRAP VIEW
  if (!isConfigured) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black text-white">
        <div className="max-w-md w-full p-8 border border-gold-600 rounded-2xl bg-zinc-900 text-center">
          <h1 className="text-3xl font-serif text-gold-500 mb-4">SYSTEM BOOTSTRAP</h1>
          <p className="text-zinc-400 mb-8">No Master Admin detected. Initialize the system to begin.</p>
          <button onClick={handleBootstrap} className="w-full bg-gold-600 text-black font-bold py-3 rounded uppercase tracking-wider hover:bg-gold-500">
            Create Master Admin
          </button>
        </div>
      </div>
    );
  }

  // BOOTSTRAP SUCCESS (Show Token Once)
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

  // Popout Mode
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

  return (
    <AppShell 
      activeShowTitle={gameState.showTitle || (activeShow ? activeShow.title : undefined)}
      username={session?.username}
      onLogout={() => {
        authService.logout(session!.id);
        setSession(null);
        setActiveShow(null);
        localStorage.removeItem('cruzpham_gamestate');
        setViewMode('BOARD');
      }}
    >
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {!session ? (
        <LoginScreen onLoginSuccess={(u) => {
          // We need to re-fetch session to get role, login screen doesn't pass it back usually but authService does
          // For simplicity, we just reload window or assume login sets storage correctly.
          // Let's manually get session from storage or assume LoginScreen updated it?
          // LoginScreen calls authService.login, which updates localStorage.
          // But we need to update state 'session'.
          // Let's reload to be safe or fetch latest session.
          // Assuming LoginScreen passed 'u' which is username.
          const sessions = JSON.parse(localStorage.getItem('cruzpham_db_sessions') || '{}');
          const sess = Object.values(sessions).find((s: any) => s.username === u) as any;
          if (sess) setSession({ id: sess.id, username: sess.username, role: sess.role });
        }} addToast={addToast} />
      ) : (
        <>
          {/* Main App Content */}
          {!activeShow ? (
            <>
               <ShowSelection username={session.username} onSelectShow={setActiveShow} />
               {isAdmin && (
                 <div className="absolute bottom-4 right-4">
                   <button onClick={() => setViewMode('ADMIN')} className="flex items-center gap-2 text-xs font-bold uppercase text-zinc-500 hover:text-gold-500 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-full transition-all">
                     <Shield className="w-3 h-3" /> Admin Console
                   </button>
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
               {/* TABS (Only if show is selected) */}
               <div className="flex justify-center mb-2 animate-in fade-in slide-in-from-top duration-300 relative z-20">
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
                       className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === 'ADMIN' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-zinc-500 hover:text-white'}`}
                     >
                       <Shield className="w-3 h-3" /> Admin
                     </button>
                   )}
                 </div>
               </div>

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
                        <div className="flex flex-col md:flex-row h-full">
                          <div className="flex-1 order-2 md:order-1 h-full overflow-hidden relative flex flex-col">
                            <div className="flex-none p-2 flex justify-start border-b border-zinc-900 bg-black/50">
                              <button onClick={() => { if(confirm("End game?")) setGameState(p => ({...p, isGameStarted: false})); }} className="text-[10px] uppercase text-zinc-500 hover:text-red-400 font-bold tracking-wider px-2">
                                &larr; End Game
                              </button>
                            </div>
                            <div className="flex-1 overflow-hidden relative">
                              <GameBoard categories={gameState.categories} onSelectQuestion={handleSelectQuestion} />
                            </div>
                          </div>
                          <div className="order-1 md:order-2 flex-none h-48 md:h-full">
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
                        <ShortcutsPanel />
                        {activeQuestion && activeCategory && (
                          <QuestionModal 
                            question={activeQuestion}
                            categoryTitle={activeCategory.title}
                            players={gameState.players}
                            selectedPlayerId={gameState.selectedPlayerId}
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