
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, ShieldAlert, Monitor, ArrowLeft, Trash2, Trophy, Clock } from 'lucide-react';
import { Question, Player, GameTimer } from '../types';
import { soundService } from '../services/soundService';
import { logger } from '../services/logger';

interface Props {
  question: Question;
  categoryTitle: string;
  players: Player[];
  selectedPlayerId: string | null;
  timer: GameTimer;
  onClose: (action: 'return' | 'void' | 'award' | 'steal', playerId?: string) => void;
  onReveal: () => void;
  onTimerEnd?: () => void;
}

export const QuestionModal: React.FC<Props> = ({ 
  question, categoryTitle, players, selectedPlayerId, timer, onClose, onReveal, onTimerEnd 
}) => {
  const [showStealSelect, setShowStealSelect] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  
  const isRevealed = question.isRevealed;
  const isDouble = question.isDoubleOrNothing || false;
  const activePlayer = players.find(p => p.id === selectedPlayerId);

  // SCROLL LOCK + LIFECYCLE LOGGING
  useEffect(() => {
    logger.info("reveal_overlay_open", { tileId: question.id, ts: new Date().toISOString() });
    
    const originalStyle = {
      overflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyHeight: document.body.style.height,
      bodyWidth: document.body.style.width,
      bodyPosition: document.body.style.position,
    };

    try {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.height = "100%";
      document.body.style.width = "100%";
      document.body.style.position = "fixed";
      logger.info("reveal_overlay_scroll_locked", { ts: new Date().toISOString() });
    } catch (e: any) {
      logger.error("reveal_overlay_layout_error", { tileId: question.id, message: e.message, ts: new Date().toISOString() });
    }

    return () => {
      document.documentElement.style.overflow = originalStyle.overflow;
      document.body.style.overflow = originalStyle.bodyOverflow;
      document.body.style.height = originalStyle.bodyHeight;
      document.body.style.width = originalStyle.bodyWidth;
      document.body.style.position = originalStyle.bodyPosition;
      logger.info("reveal_overlay_close", { tileId: question.id, ts: new Date().toISOString() });
    };
  }, [question.id]);

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
         // End Sound + Event
         if (remaining === 0 && prevTimeLeft.current !== 0 && prevTimeLeft.current !== null) {
            soundService.playTimerAlarm();
            if (onTimerEnd) onTimerEnd();
         }
         prevTimeLeft.current = remaining;
       } else if (timer.endTime && !timer.isRunning && timeLeft === null) {
         const remaining = Math.max(0, Math.ceil((timer.endTime - Date.now()) / 1000));
         setTimeLeft(remaining);
       } else if (!timer.endTime) {
         setTimeLeft(null);
         prevTimeLeft.current = null;
       }
    };

    updateTimer();
    interval = window.setInterval(updateTimer, 200);

    return () => clearInterval(interval);
  }, [timer, timeLeft, onTimerEnd]);

  useEffect(() => {
    if (isDouble && !isRevealed) soundService.playDoubleOrNothing();
  }, [isDouble, isRevealed]);

  const handleAction = useCallback((action: 'reveal' | 'award' | 'steal' | 'void' | 'return', event?: React.MouseEvent | React.KeyboardEvent) => {
    if (event) {
      if ('preventDefault' in event) event.preventDefault();
      if ('stopPropagation' in event) event.stopPropagation();
    }

    if (!isRevealed && action !== 'reveal') return;
    if (showStealSelect && action !== 'return') return; 

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
        if (isRevealed) {
          if (window.confirm('Mark this question as VOID?\n\nThis will lock the tile and close the view.')) {
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;

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

  // DYNAMIC GRID HEIGHT MANAGEMENT
  // Meta: 80px, Actions: 140px, Answer: 180px, Padding: 40px
  const reservedBottom = isRevealed ? 'calc(140px + 180px + 40px)' : 'calc(140px + 40px)';

  return (
    <div 
      data-testid="question-modal-root"
      className="fixed inset-0 z-[9999] flex flex-col bg-black text-white font-sans overflow-hidden animate-in fade-in duration-200 pointer-events-auto"
      style={{ 
        width: '100vw', 
        height: '100dvh',
        padding: 'env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0' 
      }}
    >
      {/* Background Glow */}
      <div className={`absolute inset-0 opacity-20 transition-colors duration-500 pointer-events-none ${isRevealed ? (isDouble ? 'bg-red-900' : 'bg-gold-900') : 'bg-blue-900'}`} />

      {/* ROW 1: HEADER (META) */}
      <div className="flex-none h-16 md:h-20 bg-gold-600 px-4 md:px-6 flex justify-between items-center text-black z-10 shadow-xl border-b border-black/10">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[9px] md:text-xs uppercase tracking-widest opacity-80 font-bold">Category</span>
          <h3 className="font-black uppercase tracking-widest text-sm md:text-2xl truncate pr-2">
            {categoryTitle}
          </h3>
        </div>
        
        <div className="flex items-center gap-2 md:gap-6 flex-none">
          {isDouble && (
            <div className="bg-red-700 text-white px-2 md:px-4 py-0.5 md:py-1 rounded-full animate-pulse border-2 border-red-900 flex-none">
               <span className="text-[8px] md:text-sm font-black tracking-tighter uppercase whitespace-nowrap">2X POINTS</span>
            </div>
          )}
          <div className="text-right">
            <span className="text-[9px] md:text-xs uppercase tracking-widest opacity-80 font-bold">Points</span>
            <div className="text-lg md:text-3xl font-black">{question.points}</div>
          </div>
        </div>
      </div>

      {/* ROW 2: QUESTION BLOCK (FLEX-GROW 1) */}
      <div 
        className="flex-1 min-h-0 relative z-10 flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden"
        style={{ maxHeight: `calc(100dvh - ${reservedBottom})` }}
      >
        {/* TIMER OVERLAY */}
        {timeLeft !== null && (
           <div className={`absolute top-4 right-4 md:top-8 md:right-8 p-2 rounded-full border-2 md:border-4 font-mono text-xl md:text-4xl font-black flex items-center justify-center w-12 h-12 md:w-28 md:h-28 transition-colors duration-300 bg-black/80 z-20 ${timeLeft <= 5 ? 'border-red-500 text-red-500 animate-pulse' : 'border-gold-500 text-gold-500'}`}>
             {timeLeft}
           </div>
        )}

        <div className="max-w-7xl w-full text-center flex items-center justify-center flex-1 min-h-0 overflow-hidden">
          <h2 
            data-testid="question-text"
            className={`leading-[1.12] transition-all duration-500 font-roboto font-bold px-4 max-h-full overflow-hidden ${isRevealed ? 'scale-90 opacity-40' : 'scale-100'}`}
            style={{ fontSize: 'clamp(24px, 4.2vw, 96px)' }}
          >
            {question.text}
          </h2>
        </div>
      </div>

      {/* ROW 3: REVEAL BUTTON OR ANSWER BLOCK */}
      <div className="flex-none min-h-[120px] md:min-h-[180px] flex items-center justify-center px-4 md:px-12 z-10 relative">
        {!isRevealed ? (
          <button 
            type="button"
            onClick={(e) => handleAction('reveal', e)}
            className="bg-gold-600 hover:bg-gold-500 text-black font-black text-lg md:text-4xl px-8 md:px-20 py-3 md:py-6 rounded-xl md:rounded-2xl shadow-2xl uppercase tracking-tighter flex items-center gap-2 md:gap-4 transition-transform active:scale-95 group w-full max-w-2xl justify-center"
          >
            <Monitor className="w-5 h-5 md:w-10 md:h-10 group-hover:animate-pulse" /> 
            Reveal Answer
            <span className="hidden md:inline text-xs bg-black/20 px-2 py-1 rounded ml-4 font-mono">SPACE</span>
          </button>
        ) : (
          <div className="animate-in zoom-in slide-in-from-bottom duration-300 bg-gold-950/50 border-2 md:border-4 border-gold-500 px-6 md:px-20 py-4 md:py-8 rounded-2xl backdrop-blur-md shadow-[0_0_80px_rgba(255,215,0,0.3)] w-full max-w-5xl text-center">
            <p 
              data-testid="answer-text"
              className="text-gold-400 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)] leading-tight font-roboto font-bold"
              style={{ fontSize: 'clamp(20px, 3.5vw, 80px)' }}
            >
              {question.answer}
            </p>
          </div>
        )}

        {/* STEAL OVERLAY - Only triggered post-reveal */}
        {showStealSelect && (
          <div className="fixed inset-0 bg-black/95 z-[10000] flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
            <h3 className="text-purple-500 font-black text-2xl md:text-5xl mb-8 md:mb-12 uppercase tracking-widest text-center">Select Stealer</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 w-full max-w-4xl px-4 md:px-8">
              {players.filter(p => p.id !== selectedPlayerId).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onClose('steal', p.id); }}
                  className="bg-zinc-900 border-2 md:border-4 border-zinc-800 hover:border-purple-500 hover:bg-purple-900/40 p-4 md:p-8 rounded-xl md:rounded-2xl text-lg md:text-4xl font-black text-white transition-all transform active:scale-95"
                >
                  {p.name}
                </button>
              ))}
            </div>
            <button 
              type="button" 
              onClick={(e) => { e.stopPropagation(); setShowStealSelect(false); }} 
              className="mt-8 md:mt-16 text-zinc-500 hover:text-white uppercase text-sm md:text-xl font-black tracking-widest border-b-2 md:border-b-4 border-transparent hover:border-white transition-all"
            >
              Cancel Steal
            </button>
          </div>
        )}
      </div>

      {/* ROW 4: ACTION BAR (ONLY POST-REVEAL) */}
      <div className="flex-none bg-zinc-950 border-t border-zinc-800 p-3 md:p-6 z-10 safe-bottom min-h-[100px] md:min-h-[140px] flex items-center">
        {isRevealed && (
          <div data-testid="action-buttons-container" className="flex flex-wrap justify-center gap-2 md:gap-8 max-w-7xl mx-auto w-full animate-in slide-in-from-bottom-4 duration-300">
            <button 
              type="button"
              onClick={(e) => handleAction('return', e)}
              className="flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-blue-400 transition-all px-2 md:px-4 py-1.5 md:py-2 rounded-xl hover:bg-blue-900/10"
            >
              <div className="p-2 md:p-3 bg-zinc-900 rounded-full shadow-lg"><ArrowLeft className="w-4 h-4 md:w-6 md:h-6" /></div>
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest">Return</span>
            </button>

            <button 
              type="button"
              onClick={(e) => handleAction('void', e)}
              className="flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-red-500 transition-all px-2 md:px-4 py-1.5 md:py-2 rounded-xl hover:bg-red-900/10"
            >
              <div className="p-2 md:p-3 bg-zinc-900 rounded-full shadow-lg"><Trash2 className="w-4 h-4 md:w-6 md:h-6" /></div>
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest">Void</span>
            </button>

            <div className="w-px h-8 md:h-16 bg-zinc-800 self-center mx-1 md:mx-4" />

            <button 
              type="button"
              onClick={(e) => handleAction('steal', e)}
              className="flex flex-col items-center justify-center gap-1 text-purple-500 hover:text-purple-300 transition-all px-2 md:px-4 py-1.5 md:py-2 rounded-xl hover:bg-purple-900/20 group"
            >
              <div className="p-2 md:p-3 bg-purple-900/20 border-2 md:border-4 border-purple-900 group-hover:bg-purple-600 group-hover:text-black group-hover:border-purple-500 rounded-full shadow-2xl transition-all scale-105 md:scale-110"><ShieldAlert className="w-4 h-4 md:w-8 md:h-8" /></div>
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest">Steal</span>
            </button>

            <button 
              type="button"
              onClick={(e) => handleAction('award', e)}
              disabled={!selectedPlayerId}
              className="flex flex-col items-center justify-center gap-1 text-green-500 hover:text-green-300 transition-all px-2 md:px-4 py-1.5 md:py-2 rounded-xl hover:bg-green-900/20 group disabled:opacity-30 disabled:grayscale disabled:pointer-events-none"
            >
              <div className="p-2 md:p-3 bg-green-900/20 border-2 md:border-4 border-green-900 group-hover:bg-green-600 group-hover:text-black group-hover:border-purple-500 rounded-full shadow-2xl transition-all scale-105 md:scale-110"><Trophy className="w-4 h-4 md:w-8 md:h-8" /></div>
              <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest">Award</span>
            </button>
          </div>
        )}
      </div>

      <style>{`
        .safe-bottom {
          padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
        }
      `}</style>
    </div>
  );
};
