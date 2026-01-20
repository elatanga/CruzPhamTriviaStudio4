import React, { useState, useEffect, useCallback } from 'react';
import { X, Check, ShieldAlert, Monitor, ArrowLeft, Trash2, Trophy } from 'lucide-react';
import { Question, Player } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  question: Question;
  categoryTitle: string;
  players: Player[];
  selectedPlayerId: string | null;
  onClose: (action: 'return' | 'void' | 'award' | 'steal', playerId?: string) => void;
  onReveal: () => void;
}

export const QuestionModal: React.FC<Props> = ({ 
  question, categoryTitle, players, selectedPlayerId, onClose, onReveal 
}) => {
  const [showStealSelect, setShowStealSelect] = useState(false);
  const isRevealed = question.isRevealed;
  const isDouble = question.isDoubleOrNothing || false;
  const activePlayer = players.find(p => p.id === selectedPlayerId);

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
          soundService.playVoid();
          if (confirm('Mark this question as VOID? It will be unplayable.')) {
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
          handleAction('void'); // Double check confirmation handled in func
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
            {categoryTitle} // {isDouble ? <span className="animate-pulse font-serif">2x POINTS</span> : <span>{question.points} PTS</span>}
          </h3>
          <div className="flex items-center gap-2 text-xs font-bold uppercase">
            {activePlayer ? <span>Active: {activePlayer.name}</span> : <span>No Player Selected</span>}
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 md:p-16 relative">
          
          {/* Double Or Nothing Banner */}
          {isDouble && (
            <div className="absolute top-8 left-0 right-0 flex justify-center animate-in slide-in-from-top duration-700">
              <div className="bg-gradient-to-r from-transparent via-red-600 to-transparent px-12 py-2 text-white font-black tracking-[0.3em] text-xl md:text-3xl uppercase shadow-[0_0_30px_rgba(220,38,38,0.6)]">
                Double Or Nothing
              </div>
            </div>
          )}

          {/* Question Text */}
          <h2 className={`font-serif text-3xl md:text-5xl lg:text-6xl text-white leading-tight mb-16 transition-all duration-500 ${isRevealed ? 'scale-75 opacity-60' : 'scale-100'}`}>
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
                    onClick={() => onClose('steal', p.id)}
                    className="bg-zinc-900 border border-zinc-700 hover:border-purple-500 hover:bg-purple-900/20 p-6 rounded text-xl font-bold text-white transition-all"
                  >
                    {p.name}
                  </button>
                ))}
                <button onClick={() => setShowStealSelect(false)} className="col-span-full mt-4 text-zinc-500 hover:text-white uppercase text-sm">Cancel Steal</button>
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
                onClick={() => handleAction('reveal')}
                className="bg-gold-600 hover:bg-gold-500 text-black font-black text-xl px-12 py-4 rounded-lg shadow-lg uppercase tracking-wider flex items-center gap-3 transition-transform active:scale-95"
              >
                <Monitor className="w-6 h-6" /> Reveal Answer <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded ml-2">SPACE</span>
              </button>
            ) : (
              // Phase 2 Buttons
              <>
                <button 
                  onClick={() => handleAction('return')}
                  className="flex flex-col items-center gap-1 text-zinc-500 hover:text-blue-400 transition-colors px-4"
                >
                  <div className="p-3 bg-zinc-900 rounded-full mb-1"><ArrowLeft className="w-5 h-5" /></div>
                  <span className="text-[10px] font-bold uppercase">Return (BKSP)</span>
                </button>

                <button 
                  onClick={() => handleAction('void')}
                  className="flex flex-col items-center gap-1 text-zinc-500 hover:text-red-500 transition-colors px-4"
                >
                  <div className="p-3 bg-zinc-900 rounded-full mb-1"><Trash2 className="w-5 h-5" /></div>
                  <span className="text-[10px] font-bold uppercase">Void (ESC)</span>
                </button>

                <div className="w-px h-12 bg-zinc-800 mx-2" />

                <button 
                  onClick={() => handleAction('steal')}
                  className="flex flex-col items-center gap-1 text-purple-500 hover:text-purple-300 transition-colors px-4 group"
                >
                  <div className="p-3 bg-purple-900/20 border border-purple-900 group-hover:bg-purple-600 group-hover:text-black group-hover:border-purple-500 rounded-full mb-1 transition-all"><ShieldAlert className="w-6 h-6" /></div>
                  <span className="text-[10px] font-bold uppercase">Steal (S)</span>
                </button>

                <button 
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