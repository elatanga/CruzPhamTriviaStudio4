import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, ShieldAlert, Monitor, ArrowLeft, Trash2, Trophy, Clock } from 'lucide-react';
import { Question, Player, GameTimer } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  question: Question;
  categoryTitle: string;
  players: Player[];
  selectedPlayerId: string | null;
  timer: GameTimer;
  onClose: (action: 'return' | 'void' | 'award' | 'steal', playerId?: string) => void;
  onReveal: () => void;
}

export const QuestionModal: React.FC<Props> = ({ 
  question, categoryTitle, players, selectedPlayerId, timer, onClose, onReveal 
}) => {
  const [showStealSelect, setShowStealSelect] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  
  const isRevealed = question.isRevealed;
  const isDouble = question.isDoubleOrNothing || false;
  const activePlayer = players.find(p => p.id === selectedPlayerId);

  // Timer Logic
  const prevTimeLeft = useRef<number | null>(null);

  useEffect(() => {
    let interval: number;

    const updateTimer = () => {
       if (timer.endTime && timer.isRunning) {
         const remaining = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
         setTimeLeft(remaining);

         // Tick Sound
         if (remaining > 0 && remaining <= 5 && remaining !== prevTimeLeft.current) {
            soundService.playTimerTick();
         }
         // End Sound
         if (remaining === 0 && prevTimeLeft.current !== 0 && prevTimeLeft.current !== null) {
            soundService.playTimerAlarm();
         }
         prevTimeLeft.current = remaining;
       } else if (timer.endTime && !timer.isRunning && timeLeft === null) {
         // Paused or just loaded with existing endTime
         const remaining = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
         setTimeLeft(remaining);
       } else if (!timer.endTime) {
         setTimeLeft(null);
         prevTimeLeft.current = null;
       }
    };

    updateTimer(); // Initial
    interval = window.setInterval(updateTimer, 200);

    return () => clearInterval(interval);
  }, [timer, timeLeft]);

  // Sound effects on mount/update
  useEffect(() => {
    if (isDouble && !isRevealed) soundService.playDoubleOrNothing();
  }, [isDouble, isRevealed]);

  const handleAction = useCallback((action: 'reveal' | 'award' | 'steal' | 'void' | 'return', event?: React.MouseEvent | React.KeyboardEvent) => {
    // Prevent default and stop propagation to ensure no background form validation is triggered
    if (event) {
      if ('preventDefault' in event) event.preventDefault();
      if ('stopPropagation' in event) event.stopPropagation();
    }

    // LOCK RULE: Before reveal, only 'reveal' is allowed.
    if (!isRevealed && action !== 'reveal') return;
    
    if (showStealSelect && action !== 'return') return; // Block other actions if steal menu open

    switch (action) {
      case 'reveal':
        if (!isRevealed) {
          onReveal();
          soundService.playReveal();
        }
        break;
      case 'award':
        if (isRevealed && selectedPlayerId) {
          soundService.playAward();
          onClose('award', selectedPlayerId);
        }
        break;
      case 'steal':
        if (isRevealed) {
          soundService.playSteal();
          setShowStealSelect(true);
        }
        break;
      case 'void':
        // HARDENED VOID: Only post-reveal. 
        if (isRevealed) {
          // Note: Using window.confirm is safe, but we ensure it doesn't collide with browser validation by type="button"
          if (window.confirm('Mark this question as VOID?\n\nThis will lock the tile and close the view. It can only be reset from the Director Panel.')) {
            soundService.playVoid();
            onClose('void');
          }
        }
        break;
      case 'return':
        if (showStealSelect) {
          setShowStealSelect(false);
        } else {
          onClose('return');
        }
        break;
    }
  }, [isRevealed, selectedPlayerId, showStealSelect, onClose, onReveal]);

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation(); 
      
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handleAction('reveal');
          break;
        case 'Enter':
          e.preventDefault();
          handleAction('award');
          break;
        case 'KeyS':
          e.preventDefault();
          handleAction('steal');
          break;
        case 'Escape':
          e.preventDefault();
          handleAction('void');
          break;
        case 'Backspace':
          e.preventDefault();
          handleAction('return');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAction]);

  return (
    <div 
      data-testid="question-modal-root"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white font-sans overflow-hidden animate-in fade-in duration-200"
      style={{ padding: 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' }}
    >
      {/* Background Glow */}
      <div className={`absolute inset-0 opacity-20 transition-colors duration-500 pointer-events-none ${isRevealed ? (isDouble ? 'bg-red-900' : 'bg-gold-900') : 'bg-blue-900'}`} />

      {/* TOP: Category + Points */}
      <div className="flex-none h-16 md:h-20 bg-gold-600 px-6 flex justify-between items-center text-black z-10 shadow-xl">
        <div className="flex flex-col">
          <span className="text-[10px] md:text-xs uppercase tracking-widest opacity-80 font-bold">Category</span>
          <h3 className="font-black uppercase tracking-widest text-lg md:text-2xl truncate max-w-md">
            {categoryTitle}
          </h3>
        </div>
        
        <div className="flex items-center gap-6">
          {isDouble && (
            <div className="bg-red-700 text-white px-4 py-1 rounded-full animate-pulse border-2 border-red-900">
               <span className="text-xs md:text-sm font-black tracking-tighter uppercase">DOUBLE OR NOTHING</span>
            </div>
          )}
          <div className="text-right">
            <span className="text-[10px] md:text-xs uppercase tracking-widest opacity-80 font-bold">Points</span>
            <div className="text-xl md:text-3xl font-black">{question.points}</div>
          </div>
        </div>
      </div>

      {/* CENTER: Question + Answer */}
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 md:p-12 relative z-10">
        
        {/* TIMER OVERLAY (Floating Top Right) */}
        {timeLeft !== null && (
           <div className={`absolute top-4 right-4 md:top-8 md:right-8 p-3 rounded-full border-4 font-mono text-2xl md:text-4xl font-black flex items-center justify-center w-20 h-20 md:w-28 md:h-28 transition-colors duration-300 bg-black/80 ${timeLeft <= 5 ? 'border-red-500 text-red-500 animate-pulse' : 'border-gold-500 text-gold-500'}`}>
             {timeLeft}
           </div>
        )}

        {/* Question Text - Extra large and readable for livestream */}
        <div className="max-w-7xl w-full mb-6 md:mb-10">
          <h2 
            data-testid="question-text"
            className={`leading-[1.15] transition-all duration-500 font-roboto font-bold px-4 ${isRevealed ? 'scale-90 opacity-40' : 'scale-100'}`}
            style={{ fontSize: 'clamp(34px, 4.8vw, 96px)' }}
          >
            {question.text}
          </h2>
        </div>

        {/* Answer Reveal - Large readable font */}
        <div className="w-full max-w-5xl h-40 md:h-56 flex items-center justify-center">
          {isRevealed ? (
            <div className="animate-in zoom-in slide-in-from-bottom duration-300 bg-gold-950/50 border-4 border-gold-500 px-10 md:px-20 py-6 md:py-10 rounded-2xl backdrop-blur-md shadow-[0_0_80px_rgba(255,215,0,0.3)]">
              <p 
                data-testid="answer-text"
                className="text-gold-400 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] leading-tight font-roboto font-bold"
                style={{ fontSize: 'clamp(28px, 4vw, 80px)' }}
              >
                {question.answer}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-zinc-700">
               <Monitor className="w-16 h-16 md:w-20 md:h-20 opacity-20" />
               <span className="text-xl md:text-2xl italic opacity-30 font-serif tracking-widest uppercase">Waiting for host...</span>
            </div>
          )}
        </div>

        {/* Steal Selector Overlay */}
        {showStealSelect && (
          <div className="absolute inset-0 bg-black/95 z-30 flex flex-col items-center justify-center animate-in fade-in duration-200">
            <h3 className="text-purple-500 font-black text-3xl md:text-5xl mb-12 uppercase tracking-widest">Select Player to Steal</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 w-full max-w-4xl px-8">
              {players.filter(p => p.id !== selectedPlayerId).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onClose('steal', p.id); }}
                  className="bg-zinc-900 border-4 border-zinc-800 hover:border-purple-500 hover:bg-purple-900/40 p-8 md:p-12 rounded-2xl text-2xl md:text-4xl font-black text-white transition-all transform hover:scale-105 active:scale-95"
                >
                  {p.name}
                </button>
              ))}
            </div>
            <button 
              type="button" 
              onClick={(e) => { e.stopPropagation(); setShowStealSelect(false); }} 
              className="mt-16 text-zinc-500 hover:text-white uppercase text-xl font-black tracking-widest border-b-4 border-transparent hover:border-white transition-all"
            >
              Cancel Steal
            </button>
          </div>
        )}
      </div>

      {/* BOTTOM: Action Bar - Always at bottom, never pushing off-screen */}
      <div className="flex-none bg-zinc-950 border-t-2 border-zinc-800 p-4 md:p-6 z-10">
        <div className="flex justify-center items-center gap-4 md:gap-8 max-w-7xl mx-auto w-full">
          
          {!isRevealed ? (
            <button 
              type="button"
              onClick={(e) => handleAction('reveal', e)}
              className="bg-gold-600 hover:bg-gold-500 text-black font-black text-2xl md:text-4xl px-12 md:px-20 py-4 md:py-6 rounded-2xl shadow-2xl uppercase tracking-tighter flex items-center gap-4 transition-transform active:scale-95 group"
            >
              <Monitor className="w-6 h-6 md:w-10 md:h-10 group-hover:animate-pulse" /> 
              Reveal Answer
              <span className="text-[10px] md:text-xs bg-black/20 px-2 py-1 rounded ml-4 font-mono">SPACE</span>
            </button>
          ) : (
            <div data-testid="action-buttons-container" className="flex flex-wrap justify-center gap-4 md:gap-6 animate-in slide-in-from-bottom-4 duration-300">
              <button 
                type="button"
                onClick={(e) => handleAction('return', e)}
                className="flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-blue-400 transition-all px-4 py-2 rounded-xl hover:bg-blue-900/10 border-2 border-transparent hover:border-blue-900/30"
              >
                <div className="p-3 bg-zinc-900 rounded-full mb-1 shadow-lg"><ArrowLeft className="w-5 h-5 md:w-6 md:h-6" /></div>
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Return (BKSP)</span>
              </button>

              <button 
                type="button"
                onClick={(e) => handleAction('void', e)}
                className="flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-red-500 transition-all px-4 py-2 rounded-xl hover:bg-red-900/10 border-2 border-transparent hover:border-red-900/30"
              >
                <div className="p-3 bg-zinc-900 rounded-full mb-1 shadow-lg"><Trash2 className="w-5 h-5 md:w-6 md:h-6" /></div>
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Void (ESC)</span>
              </button>

              <div className="w-px h-12 md:h-16 bg-zinc-800 self-center hidden sm:block" />

              <button 
                type="button"
                onClick={(e) => handleAction('steal', e)}
                className="flex flex-col items-center justify-center gap-1 text-purple-500 hover:text-purple-300 transition-all px-4 py-2 rounded-xl hover:bg-purple-900/20 border-2 border-transparent hover:border-purple-500/30 group"
              >
                <div className="p-3 bg-purple-900/20 border-4 border-purple-900 group-hover:bg-purple-600 group-hover:text-black group-hover:border-purple-500 rounded-full mb-1 shadow-2xl transition-all scale-110"><ShieldAlert className="w-6 h-6 md:w-8 md:h-8" /></div>
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Steal (S)</span>
              </button>

              <button 
                type="button"
                onClick={(e) => handleAction('award', e)}
                disabled={!selectedPlayerId}
                className="flex flex-col items-center justify-center gap-1 text-green-500 hover:text-green-300 transition-all px-4 py-2 rounded-xl hover:bg-green-900/20 border-2 border-transparent hover:border-green-500/30 group disabled:opacity-30 disabled:grayscale disabled:pointer-events-none"
              >
                <div className="p-3 bg-green-900/20 border-4 border-green-900 group-hover:bg-green-600 group-hover:text-black group-hover:border-green-500 rounded-full mb-1 shadow-2xl transition-all scale-110"><Trophy className="w-6 h-6 md:w-8 md:h-8" /></div>
                <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Award (ENTER)</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Producer Info Tag */}
      <div className="absolute bottom-1 right-2 text-[8px] font-mono text-zinc-700 uppercase tracking-widest pointer-events-none z-20">
         Active Producer: {activePlayer ? activePlayer.name : 'None'}
      </div>
    </div>
  );
};