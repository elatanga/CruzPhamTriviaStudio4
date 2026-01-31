
import React, { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { Player, BoardViewSettings } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  players: Player[];
  selectedPlayerId: string | null;
  onAddPlayer: (name: string) => void;
  onUpdateScore: (id: string, delta: number) => void;
  onSelectPlayer: (id: string) => void;
  gameActive: boolean;
  viewSettings: BoardViewSettings;
}

const STAR_COLOR_BY_COUNT: Record<number, string> = {
  1: "#FF8A00", // Bright Orange
  2: "#FFB300", // Orange-Yellow
  3: "#FFD000", // Yellow-Orange
  4: "#FFD400"  // Bright Yellow
};

export const Scoreboard: React.FC<Props> = ({ 
  players, selectedPlayerId, onAddPlayer, onUpdateScore, onSelectPlayer, viewSettings
}) => {
  const [newName, setNewName] = useState('');

  const fontScale = viewSettings?.boardFontScale || 1.0;
  const scoreboardScale = viewSettings?.scoreboardScale || 1.0;

  const handleAddManual = () => {
    if (newName.trim()) {
      soundService.playClick();
      onAddPlayer(newName.trim());
      setNewName('');
    }
  };

  const scoreboardStyles = {
    '--scoreboard-scale': scoreboardScale,
    '--board-font-scale': fontScale,
  } as React.CSSProperties;

  return (
    <div 
      className="h-full flex flex-col border-t md:border-t-0 md:border-l border-gold-900/30 bg-black/95 w-full md:w-[clamp(18rem,20vw*var(--scoreboard-scale),30rem)] shadow-2xl z-20 font-sans font-bold select-none transition-all duration-300"
      style={scoreboardStyles}
    >
      
      {/* Header */}
      <div className="flex-none p-3 border-b border-gold-900/30 bg-zinc-900/50 flex items-center justify-between">
        <h3 className="text-gold-500 tracking-widest text-xs uppercase" style={{ fontSize: `calc(0.75rem * var(--scoreboard-scale))` }}>PLAYERS ({players.length})</h3>
      </div>

      {/* Players List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar" style={{ padding: `calc(0.5rem * var(--scoreboard-scale))` }}>
        {players.map(p => {
          const isSelected = p.id === selectedPlayerId;
          const starsCount = p.wildcardsUsed || 0;
          const stealsCount = p.stealsCount || 0;

          return (
            <div 
              key={p.id} 
              onClick={() => onSelectPlayer(p.id)}
              className={`
                relative p-3 rounded border transition-all duration-200 cursor-pointer group flex flex-col gap-2
                ${isSelected 
                  ? 'bg-gold-900/30 border-gold-500 shadow-[0_0_15px_rgba(255,215,0,0.2)] scale-[1.02]' 
                  : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-600'}
              `}
              style={{ minHeight: `calc(4.5rem * var(--scoreboard-scale))` }}
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center min-w-0 flex-1 mr-2 overflow-hidden gap-2">
                  <span 
                    className={`truncate pr-1 font-roboto font-bold tracking-wide ${isSelected ? 'text-white' : 'text-zinc-400'}`} 
                    style={{ fontSize: `calc(clamp(16px, 1.6vw, 30px) * var(--scoreboard-scale))` }}
                  >
                    {p.name}
                  </span>
                  {starsCount > 0 && (
                    <span 
                      aria-hidden="true" 
                      className="shrink-0 drop-shadow-md text-sm md:text-base leading-none"
                      style={{ 
                        color: STAR_COLOR_BY_COUNT[Math.min(starsCount, 4)] || '#FFD400',
                        fontSize: `calc(clamp(12px, 1.2vw, 24px) * var(--scoreboard-scale))`
                      }}
                    >
                      {'★'.repeat(Math.min(starsCount, 4))}
                    </span>
                  )}
                  {stealsCount > 0 && (
                    <span 
                      className="shrink-0 text-[9px] md:text-[10px] bg-purple-900/50 text-purple-200 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider border border-purple-500/30"
                      style={{ fontSize: `calc(clamp(9px, 0.9vw, 14px) * var(--scoreboard-scale))` }}
                    >
                      STEALS: {stealsCount}
                    </span>
                  )}
                </div>
                <span className="font-mono font-black text-gold-400 drop-shadow-md" style={{ fontSize: `calc(1.4rem * var(--scoreboard-scale) * var(--board-font-scale))` }}>
                  {p.score}
                </span>
              </div>
              
              <div className="flex gap-2 h-8" style={{ height: `calc(2rem * var(--scoreboard-scale))` }}>
                 <button 
                   type="button"
                   onClick={(e) => { e.stopPropagation(); soundService.playClick(); onUpdateScore(p.id, -100); }} 
                   className="flex-1 bg-zinc-950/80 border border-zinc-800 text-red-500 hover:border-red-500 hover:bg-red-900/20 rounded flex items-center justify-center transition-colors"
                 >
                   <Minus className="w-4 h-4" />
                 </button>
                 <button 
                   type="button"
                   onClick={(e) => { e.stopPropagation(); soundService.playClick(); onUpdateScore(p.id, 100); }} 
                   className="flex-1 bg-zinc-950/80 border border-zinc-800 text-green-500 hover:border-green-500 hover:bg-green-900/20 rounded flex items-center justify-center transition-colors"
                 >
                   <Plus className="w-4 h-4" />
                 </button>
              </div>

              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gold-500 rounded-l animate-pulse" />}
            </div>
          );
        })}
        {players.length === 0 && <div className="text-center text-zinc-700 text-[10px] py-4 italic uppercase tracking-wider">No Contestants</div>}
      </div>

      {/* Add Player Form - Hardened: Div instead of Form to block browser validation tooltips */}
      <div className="flex-none p-3 border-t border-gold-900/30 bg-zinc-900/50">
        <div className="flex gap-2 h-10">
          <input 
            type="text" 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
            onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddManual(); } }}
            placeholder="ADD NAME" 
            className="flex-1 bg-black border border-zinc-800 rounded px-3 text-xs text-white focus:border-gold-500 outline-none uppercase tracking-wide placeholder:text-zinc-700" 
          />
          <button type="button" onClick={handleAddManual} className="bg-gold-600 hover:bg-gold-500 text-black px-4 rounded transition-colors flex items-center justify-center"><Plus className="w-5 h-5" /></button>
        </div>
      </div>
    </div>
  );
};
