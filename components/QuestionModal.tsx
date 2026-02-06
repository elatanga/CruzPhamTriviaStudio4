
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
  
  const isRevealed = question.isRevealed;
  const isDouble = question.isDoubleOrNothing || false;
  const activePlayer = players.find(p => p.id === selectedPlayerId);

  // LOGGING & SCROLL LOCK
  useEffect(() => {
    const ts = new Date().toISOString();
    logger.info("reveal_ui_rendered", { tileId: question.id, isDoubleOrNothing: isDouble, ts });
    if (isDouble) {
      logger.info("double_or_nothing_displayed", { tileId: question.id, ts });
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
  }, [question.id, isDouble]);

  // Timer Logic (Unchanged)
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
      className="fixed inset-0 z-[9999] bg-black text-white font-roboto overflow-hidden flex flex-col items-center justify-center p-4 md:p-8"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* Dynamic Ambient Background */}
      <div className={`absolute inset-0 opacity-20 transition-colors duration-700 pointer-events-none ${isRevealed ? (isDouble ? 'bg-red-900' : 'bg-gold-900') : 'bg-blue-900'}`} />

      {/* TOP FLOATING CONTEXT BAR (Category/Points) */}
      <div className="absolute top-0 left-0 right-0 h-16 md:h-20 flex justify-between items-center px-6 md:px-12 z-20 pointer-events-none">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest opacity-50 font-black">Category</span>
          <h3 className="font-black uppercase tracking-wider text-xs md:text-xl text-gold-500">{categoryTitle}</h3>
        </div>
        <div className="text-right">
          <span className="text-[10px] uppercase tracking-widest opacity-50 font-black">Points</span>
          <div className="text-lg md:text-3xl font-black text-white">{question.points}</div>
        </div>
      </div>

      {/* SINGLE LUXURY CENTERED CONTAINER */}
      <div 
        data-testid="luxury-container"
        className="relative z-10 w-full max-w-7xl max-h-[85vh] bg-zinc-900/40 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-6 md:p-12 shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col items-center justify-between overflow-hidden"
      >
        {/* TIMER OVERLAY (Floating in container corner) */}
        {timeLeft !== null && (
           <div className={`absolute top-6 right-6 md:top-10 md:right-10 p-2 md:p-4 rounded-full border-2 md:border-4 font-mono text-xl md:text-4xl font-black flex items-center justify-center w-12 h-12 md:w-24 md:h-24 transition-colors duration-300 bg-black/60 z-30 shadow-xl ${timeLeft <= 5 ? 'border-red-500 text-red-500 animate-pulse' : 'border-gold-500 text-gold-500'}`}>
             {timeLeft}
           </div>
        )}

        {/* 1. DOUBLE OR NOTHING LABEL */}
        <div className="flex-none h-12 flex items-center justify-center">
          {isDouble && (
            <span 
              data-testid="double-label"
              className="text-red-500 font-black uppercase tracking-[0.3em] drop-shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-in fade-in slide-in-from-top-2 duration-700"
              style={{ fontSize: 'clamp(18px, 2vw, 32px)' }}
            >
              DOUBLE OR NOTHING
            </span>
          )}
        </div>

        {/* 2. QUESTION AREA */}
        <div className="flex-1 flex items-center justify-center w-full px-4 overflow-hidden min-h-0">
          <h2 
            data-testid="question-text"
            className={`font-roboto-bold text-center leading-[1.1] transition-all duration-700 max-h-full overflow-hidden ${isRevealed ? 'opacity-40 scale-90 blur-[1px]' : 'opacity-100 scale-100'}`}
            style={{ fontSize: 'clamp(28px, 4.5vw, 86px)' }}
          >
            {question.text}
          </h2>
        </div>

        {/* 3. ANSWER AREA */}
        <div className="flex-none w-full flex flex-col items-center gap-8 md:gap-12 mt-4">
          {isRevealed ? (
            <div 
              data-testid="answer-text"
              className="w-full text-center py-6 md:py-10 bg-gold-950/20 border-y border-gold-500/20 animate-in zoom-in slide-in-from-bottom duration-500"
            >
              <p 
                className="text-gold-400 font-roboto-bold leading-tight drop-shadow-2xl"
                style={{ fontSize: 'clamp(24px, 3.5vw, 64px)' }}
              >
                {question.answer}
              </p>
            </div>
          ) : (
            <div className="h-2 w-32 bg-zinc-800/50 rounded-full" />
          )}

          {/* 4. ACTION ICONS ROW */}
          <div 
            data-testid="reveal-actions"
            className="flex flex-wrap items-center justify-center gap-4 md:gap-10 w-full"
          >
            {/* RETURN */}
            <button 
              type="button"
              onClick={(e) => handleAction('return', e)}
              className="flex flex-col items-center gap-2 text-zinc-500 hover:text-white transition-all group min-w-[64px]"
              title="Return (BACKSPACE)"
            >
              <div className="p-3 md:p-5 bg-zinc-900/80 rounded-full border border-zinc-700 shadow-lg group-hover:bg-zinc-800 transition-colors">
                <ArrowLeft className="w-5 h-5 md:w-8 md:h-8" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">Return</span>
            </button>

            {/* VOID */}
            <button 
              type="button"
              disabled={!isRevealed}
              onClick={(e) => handleAction('void', e)}
              className={`flex flex-col items-center gap-2 transition-all group min-w-[64px] ${isRevealed ? 'text-zinc-500 hover:text-red-500' : 'opacity-10 cursor-not-allowed grayscale'}`}
              title="Void (ESC)"
            >
              <div className="p-3 md:p-5 bg-zinc-900/80 rounded-full border border-zinc-700 shadow-lg group-hover:border-red-900/30 transition-all">
                <Trash2 className="w-5 h-5 md:w-8 md:h-8" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">Void</span>
            </button>

            {/* MAIN REVEAL / SEPARATOR */}
            <div className="mx-2 md:mx-6 flex items-center justify-center min-w-[80px]">
              {!isRevealed ? (
                <button 
                  type="button"
                  onClick={(e) => handleAction('reveal', e)}
                  className="bg-gold-600 hover:bg-gold-500 text-black p-4 md:p-8 rounded-full shadow-[0_0_50px_rgba(255,215,0,0.3)] hover:scale-110 transition-all active:scale-95 flex items-center justify-center border-4 border-black/20"
                  title="Reveal Answer (SPACE)"
                >
                  <Eye className="w-8 h-8 md:w-14 md:h-14" />
                </button>
              ) : (
                <div className="w-px h-16 bg-zinc-800/50" />
              )}
            </div>

            {/* STEAL */}
            <button 
              type="button"
              disabled={!isRevealed}
              onClick={(e) => handleAction('steal', e)}
              className={`flex flex-col items-center gap-2 transition-all group min-w-[64px] ${isRevealed ? 'text-purple-500 hover:text-purple-300' : 'opacity-10 cursor-not-allowed grayscale'}`}
              title="Steal (S)"
            >
              <div className="p-3 md:p-5 bg-purple-950/20 border-2 border-purple-500/50 rounded-full shadow-xl group-hover:bg-purple-900/40 transition-all">
                <ShieldAlert className="w-5 h-5 md:w-8 md:h-8" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">Steal</span>
            </button>

            {/* AWARD */}
            <button 
              type="button"
              disabled={!isRevealed || !selectedPlayerId}
              onClick={(e) => handleAction('award', e)}
              className={`flex flex-col items-center gap-2 transition-all group min-w-[64px] ${isRevealed && selectedPlayerId ? 'text-green-500 hover:text-green-300' : 'opacity-10 cursor-not-allowed grayscale'}`}
              title="Award (ENTER)"
            >
              <div className="p-3 md:p-5 bg-green-950/20 border-2 border-green-500/50 rounded-full shadow-xl group-hover:bg-green-900/40 transition-all">
                <Trophy className="w-5 h-5 md:w-8 md:h-8" />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">Award</span>
            </button>
          </div>
        </div>
      </div>

      {/* STEAL SELECTION OVERLAY */}
      {showStealSelect && (
        <div className="fixed inset-0 bg-black/98 z-[10000] flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
          <h3 className="text-purple-500 font-black text-2xl md:text-6xl mb-8 md:mb-16 uppercase tracking-[0.2em] text-center drop-shadow-2xl">Who is stealing?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 w-full max-w-7xl px-4">
            {players.filter(p => p.id !== selectedPlayerId).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose('steal', p.id); }}
                className="bg-zinc-900 border-2 md:border-4 border-zinc-800 hover:border-purple-500 hover:bg-purple-900/30 p-8 md:p-14 rounded-[2rem] text-xl md:text-5xl font-black text-white transition-all transform active:scale-95 shadow-2xl uppercase tracking-tighter"
              >
                {p.name}
              </button>
            ))}
          </div>
          <button 
            type="button" 
            onClick={(e) => { e.stopPropagation(); setShowStealSelect(false); }} 
            className="mt-12 md:mt-24 text-zinc-500 hover:text-white uppercase text-sm md:text-2xl font-black tracking-widest transition-colors border-b border-zinc-800 hover:border-white pb-2"
          >
            Cancel Steal
          </button>
        </div>
      )}
    </div>
  );
};
