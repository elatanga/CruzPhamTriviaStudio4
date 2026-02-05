import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, ShieldAlert, Monitor, ArrowLeft, Trash2, Trophy, Clock, Eye } from 'lucide-react';
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
  const footerRef = useRef<HTMLElement>(null);
  
  const isRevealed = question.isRevealed;
  const isDouble = question.isDoubleOrNothing || false;
  const activePlayer = players.find(p => p.id === selectedPlayerId);

  // SCROLL LOCK + PRODUCTION LIFECYCLE LOGGING
  useEffect(() => {
    const ts = new Date().toISOString();
    logger.info("reveal_ui_open", { ts, tileId: question.id });
    
    if (footerRef.current) {
      if (footerRef.current.clientHeight === 0) {
        logger.error("reveal_actions_missing", { ts, tileId: question.id });
      } else {
        logger.info("reveal_actions_visible", { ts, tileId: question.id });
      }
    }

    const originalStyle = {
      overflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
    };

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = originalStyle.overflow;
      document.body.style.overflow = originalStyle.bodyOverflow;
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
         if (remaining > 0 && remaining <= 5 && remaining !== prevTimeLeft.current) {
            soundService.playTimerTick();
         }
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

    if (!isRevealed && action !== 'reveal' && action !== 'return') return;
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

  return (
    <div 
      data-testid="reveal-root"
      className="fixed inset-0 z-[9999] bg-black text-white font-sans overflow-hidden grid grid-rows-[auto_1fr_auto]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Background Glow */}
      <div className={`absolute inset-0 opacity-20 transition-colors duration-500 pointer-events-none ${isRevealed ? (isDouble ? 'bg-red-900' : 'bg-gold-900') : 'bg-blue-900'}`} />

      {/* ROW 1: HEADER */}
      <header className="flex-none h-16 md:h-20 bg-gold-600 px-4 md:px-8 flex justify-between items-center text-black z-20 shadow-2xl relative">
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-[10px] uppercase tracking-widest opacity-80 font-black">Category</span>
          <h3 className="font-black uppercase tracking-widest text-sm md:text-2xl truncate pr-2">
            {categoryTitle}
          </h3>
        </div>
        
        <div className="flex items-center gap-4 md:gap-8 flex-none">
          {isDouble && (
            <div className="bg-red-700 text-white px-3 py-1 rounded-full animate-pulse border-2 border-red-900">
               <span className="text-[10px] md:text-sm font-black tracking-widest uppercase whitespace-nowrap">DOUBLE OR NOTHING</span>
            </div>
          )}
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-widest opacity-80 font-black">Points</span>
            <div className="text-xl md:text-3xl font-black leading-none">{question.points}</div>
          </div>
        </div>
      </header>

      {/* ROW 2: CONTENT (QUESTION + ANSWER) */}
      <main className="flex-1 min-h-0 relative z-10 flex flex-col items-center justify-center p-6 md:p-12 overflow-hidden gap-8">
        {/* TIMER OVERLAY (ABSOLUTE WITHIN MAIN) */}
        {timeLeft !== null && (
           <div className={`absolute top-4 right-4 md:top-8 md:right-8 p-3 rounded-full border-4 font-mono text-2xl md:text-4xl font-black flex items-center justify-center w-16 h-16 md:w-32 md:h-32 transition-colors duration-300 bg-black/80 z-30 shadow-2xl ${timeLeft <= 5 ? 'border-red-500 text-red-500 animate-pulse' : 'border-gold-500 text-gold-500'}`}>
             {timeLeft}
           </div>
        )}

        {/* QUESTION TEXT */}
        <div className="w-full text-center flex-1 flex items-center justify-center min-h-0">
          <h2 
            data-testid="question-text"
            className={`leading-tight transition-all duration-500 font-roboto-bold px-4 max-h-full overflow-hidden ${isRevealed ? 'opacity-30 scale-90' : 'opacity-100 scale-100'}`}
            style={{ fontSize: 'clamp(20px, 4.5vw, 90px)' }}
          >
            {question.text}
          </h2>
        </div>

        {/* ANSWER AREA (ONLY IF REVEALED) */}
        {isRevealed && (
          <div className="flex-none w-full max-w-6xl animate-in zoom-in slide-in-from-bottom duration-500">
             <div className="bg-gold-950/40 border-t-2 md:border-4 border-gold-500/50 p-6 md:p-10 rounded-3xl backdrop-blur-md shadow-[0_0_100px_rgba(255,215,0,0.2)] text-center">
                <p 
                  data-testid="answer-text"
                  className="text-gold-400 font-roboto-bold leading-tight drop-shadow-2xl"
                  style={{ fontSize: 'clamp(24px, 4vw, 80px)' }}
                >
                  {question.answer}
                </p>
             </div>
          </div>
        )}
      </main>

      {/* ROW 3: ACTION BAR */}
      <footer 
        ref={footerRef}
        data-testid="reveal-actions"
        className="flex-none bg-zinc-950/95 border-t border-gold-900/30 min-h-[100px] md:min-h-[140px] z-20 flex items-center justify-center relative px-4"
      >
        <div className="flex flex-wrap justify-center items-center gap-4 md:gap-10 w-full max-w-5xl">
          
          {/* RETURN ACTION */}
          <button 
            type="button"
            onClick={(e) => handleAction('return', e)}
            className="flex flex-col items-center gap-2 text-zinc-500 hover:text-white transition-all group min-w-[64px]"
            title="Return to Board (BACKSPACE)"
          >
            <div className="p-3 md:p-4 bg-zinc-900 rounded-full border border-zinc-800 shadow-xl group-hover:bg-zinc-800 transition-colors">
              <ArrowLeft className="w-5 h-5 md:w-7 md:h-7" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-tighter">Return</span>
          </button>

          {/* VOID ACTION */}
          <button 
            type="button"
            disabled={!isRevealed}
            onClick={(e) => handleAction('void', e)}
            className={`flex flex-col items-center gap-2 transition-all group min-w-[64px] ${isRevealed ? 'text-zinc-500 hover:text-red-500' : 'opacity-20 cursor-not-allowed grayscale'}`}
            title="Void Tile (ESC)"
          >
            <div className="p-3 md:p-4 bg-zinc-900 rounded-full border border-zinc-800 shadow-xl group-hover:border-red-900/50 transition-all">
              <Trash2 className="w-5 h-5 md:w-7 md:h-7" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-tighter">Void</span>
          </button>

          {/* REVEAL ACTION (CENTER PIECE) */}
          <div className="mx-2 md:mx-6 flex items-center justify-center min-w-[80px]">
            {!isRevealed ? (
              <button 
                type="button"
                onClick={(e) => handleAction('reveal', e)}
                className="bg-gold-600 hover:bg-gold-500 text-black p-4 md:p-6 rounded-full shadow-[0_0_40px_rgba(255,215,0,0.4)] transition-transform active:scale-90 flex items-center gap-2 group border-4 border-black/20"
                title="Reveal Answer (SPACE)"
              >
                <Eye className="w-8 h-8 md:w-12 md:h-12" />
                <span className="sr-only">Reveal Answer</span>
              </button>
            ) : (
              <div className="w-px h-16 bg-zinc-800" />
            )}
          </div>

          {/* STEAL ACTION */}
          <button 
            type="button"
            disabled={!isRevealed}
            onClick={(e) => handleAction('steal', e)}
            className={`flex flex-col items-center gap-2 transition-all group min-w-[64px] ${isRevealed ? 'text-purple-500 hover:text-purple-300' : 'opacity-20 cursor-not-allowed grayscale'}`}
            title="Initiate Steal (S)"
          >
            <div className="p-3 md:p-4 bg-purple-950/20 border-2 border-purple-900/50 rounded-full shadow-2xl group-hover:bg-purple-900/40 transition-all">
              <ShieldAlert className="w-5 h-5 md:w-7 md:h-7" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-tighter">Steal</span>
          </button>

          {/* AWARD ACTION */}
          <button 
            type="button"
            disabled={!isRevealed || !selectedPlayerId}
            onClick={(e) => handleAction('award', e)}
            className={`flex flex-col items-center gap-2 transition-all group min-w-[64px] ${isRevealed && selectedPlayerId ? 'text-green-500 hover:text-green-300' : 'opacity-20 cursor-not-allowed grayscale'}`}
            title="Award Points (ENTER)"
          >
            <div className="p-3 md:p-4 bg-green-950/20 border-2 border-green-900/50 rounded-full shadow-2xl group-hover:bg-green-900/40 transition-all">
              <Trophy className="w-5 h-5 md:w-7 md:h-7" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-tighter">Award</span>
          </button>

        </div>
      </footer>

      {/* STEAL SELECTION OVERLAY */}
      {showStealSelect && (
        <div className="fixed inset-0 bg-black/95 z-[10000] flex flex-col items-center justify-center p-6 animate-in fade-in duration-200">
          <h3 className="text-purple-500 font-black text-2xl md:text-5xl mb-8 md:mb-16 uppercase tracking-widest text-center drop-shadow-2xl">Who is stealing?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 w-full max-w-6xl px-4">
            {players.filter(p => p.id !== selectedPlayerId).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose('steal', p.id); }}
                className="bg-zinc-900 border-2 md:border-4 border-zinc-800 hover:border-purple-500 hover:bg-purple-900/30 p-6 md:p-12 rounded-3xl text-xl md:text-4xl font-black text-white transition-all transform active:scale-95 shadow-2xl"
              >
                {p.name}
              </button>
            ))}
          </div>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); setShowStealSelect(false); }} 
            className="mt-12 md:mt-24 text-zinc-500 hover:text-white uppercase text-sm md:text-xl font-black tracking-widest transition-colors"
          >
            Cancel Steal
          </button>
        </div>
      )}
    </div>
  );
};
