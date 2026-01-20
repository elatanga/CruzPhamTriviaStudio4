
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
  }, [timer]);

  // Sound effects on mount/update
  useEffect(() => {
    if (isDouble && !isRevealed) soundService.playDoubleOrNothing();
  }, [isDouble, isRevealed]);

  const handleAction = useCallback((action: 'reveal' | 'award' | 'steal' | 'void' | 'return') => {
    if (showStealSelect && action !== 'return') return; // Block keys if steal menu open

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
          // Explicitly confirm before destroying the question state
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
      e.stopPropagation(); // Stop propagation to global board listeners
      
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in zoom-in duration-200">
      
      {/* Background Glow based on state */}
      <div className={`absolute inset-0 opacity-20 transition-colors duration-500 ${isRevealed ? (isDouble ? 'bg-red-900' : 'bg-gold-900') : 'bg-blue-900'}`} />

      <div className="relative w-full max-w-5xl h-[80vh] flex flex-col border-2 border-gold-600/50 rounded-2xl shadow-[0_0_100px_-20px_rgba(255,215,0,0.3)] bg-black overflow-hidden">
        
        {/* HEADER */}
        <div className="flex-none bg-gold-600 p-3 flex justify-between items-center text-black">
          <h3 className="font-black uppercase tracking-widest text-lg md:text-xl">
            {categoryTitle} // {isDouble ? <span className="animate-pulse font-serif text-red-900">DOUBLE</span> : <span>{question.points} PTS</span>}
          </h3>
          <div className="flex items-center gap-2 text-xs font-bold uppercase">
            {activePlayer ? <span>Active: {activePlayer.name}</span> : <span>No Player Selected</span>}
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 md:p-16 relative">
          
          {/* Double Or Nothing Banner */}
          {isDouble && (
            <div className="absolute top-0 left-0 right-0 flex justify-center py-4 z-20 animate-in slide-in-from-top duration-500">
              <h1 className="text-red-600 font-black text-3xl md:text-5xl uppercase tracking-widest drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] stroke-black" style={{ textShadow: '0 0 20px rgba(220, 38, 38, 0.5)' }}>
                DOUBLE OR NOTHING
              </h1>
            </div>
          )}

          {/* TIMER DISPLAY */}
          {timeLeft !== null && (
             <div className={`absolute top-16 right-4 md:right-8 p-3 rounded-full border-2 font-mono text-xl md:text-2xl font-black flex items-center justify-center w-16 h-16 transition-colors duration-300 ${timeLeft <= 5 ? 'bg-red-900 border-red-500 text-white animate-pulse' : 'bg-black/50 border-gold-500 text-gold-500'}`}>
               {timeLeft}
             </div>
          )}

          {/* Question Text */}
          <h2 className={`font-serif text-3xl md:text-5xl lg:text-6xl text-white leading-tight mb-16 transition-all duration-500 ${isRevealed ? 'scale-75 opacity-60' : 'scale-100'} ${isDouble ? 'mt-12' : ''}`}>
            {question.text}
          </h2>

          {/* Answer Reveal */}
          {isRevealed ? (
            <div className="animate-in zoom-in slide-in-from-bottom duration-300 bg-gold-900/40 border-2 border-gold-500 px-12 py-8 rounded-xl backdrop-blur-md shadow-[0_0_50px_rgba(255,215,0,0.2)]">
              <p className="text-3xl md:text-5xl font-bold text-gold-400 drop-shadow-md">{question.answer}</p>
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-zinc-600 italic font-serif text-xl border-2 border-dashed border-zinc-800 rounded-xl px-12">
              Answer Hidden
            </div>
          )}

          {/* Steal Selector Overlay */}
          {showStealSelect && (
            <div className="absolute inset-0 bg-black/90 z-20 flex flex-col items-center justify-center animate-in fade-in duration-200">
              <h3 className="text-purple-500 font-bold text-2xl mb-6 uppercase tracking-widest">Select Player to Steal</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl px-4">
                {players.filter(p => p.id !== selectedPlayerId).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onClose('steal', p.id)}
                    className="bg-zinc-900 border border-zinc-700 hover:border-purple-500 hover:bg-purple-900/20 p-6 rounded text-xl font-bold text-white transition-all"
                  >
                    {p.name}
                  </button>
                ))}
                <button type="button" onClick={() => setShowStealSelect(false)} className="col-span-full mt-4 text-zinc-500 hover:text-white uppercase text-sm">Cancel Steal</button>
              </div>
            </div>
          )}
        </div>

        {/* CONTROLS FOOTER - VISUALLY SHOW STATE */}
        <div className="flex-none bg-zinc-950 border-t border-zinc-800 p-6">
          <div className="flex justify-center gap-4 md:gap-8">
            
            {/* Reveal Button (Only Active Phase 1) */}
            {!isRevealed ? (
              <button 
                type="button"
                onClick={() => handleAction('reveal')}
                className="bg-gold-600 hover:bg-gold-500 text-black font-black text-xl px-12 py-4 rounded-lg shadow-lg uppercase tracking-wider flex items-center gap-3 transition-transform active:scale-95"
              >
                <Monitor className="w-6 h-6" /> Reveal Answer <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded ml-2">SPACE</span>
              </button>
            ) : (
              // Phase 2 Buttons
              <>
                <button 
                  type="button"
                  onClick={() => handleAction('return')}
                  className="flex flex-col items-center gap-1 text-zinc-500 hover:text-blue-400 transition-colors px-4"
                >
                  <div className="p-3 bg-zinc-900 rounded-full mb-1"><ArrowLeft className="w-5 h-5" /></div>
                  <span className="text-[10px] font-bold uppercase">Return (BKSP)</span>
                </button>

                <button 
                  type="button"
                  onClick={() => handleAction('void')}
                  className="flex flex-col items-center gap-1 text-zinc-500 hover:text-red-500 transition-colors px-4"
                >
                  <div className="p-3 bg-zinc-900 rounded-full mb-1"><Trash2 className="w-5 h-5" /></div>
                  <span className="text-[10px] font-bold uppercase">Void (ESC)</span>
                </button>

                <div className="w-px h-12 bg-zinc-800 mx-2" />

                <button 
                  type="button"
                  onClick={() => handleAction('steal')}
                  className="flex flex-col items-center gap-1 text-purple-500 hover:text-purple-300 transition-colors px-4 group"
                >
                  <div className="p-3 bg-purple-900/20 border border-purple-900 group-hover:bg-purple-600 group-hover:text-black group-hover:border-purple-500 rounded-full mb-1 transition-all"><ShieldAlert className="w-6 h-6" /></div>
                  <span className="text-[10px] font-bold uppercase">Steal (S)</span>
                </button>

                <button 
                  type="button"
                  onClick={() => handleAction('award')}
                  disabled={!selectedPlayerId}
                  className="flex flex-col items-center gap-1 text-green-500 hover:text-green-300 transition-colors px-4 group disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <div className="p-3 bg-green-900/20 border border-green-900 group-hover:bg-green-600 group-hover:text-black group-hover:border-green-500 rounded-full mb-1 transition-all"><Trophy className="w-6 h-6" /></div>
                  <span className="text-[10px] font-bold uppercase">Award (ENTER)</span>
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
