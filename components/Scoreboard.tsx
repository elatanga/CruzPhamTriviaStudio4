
import React, { useState, useEffect } from 'react';
import { Plus, Minus, Maximize2, Minimize2, UserPlus } from 'lucide-react';
import { Player, BoardViewSettings } from '../types';
import { soundService } from '../services/soundService';
import { logger } from '../services/logger';

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
  players, selectedPlayerId, onAddPlayer, onUpdateScore, onSelectPlayer, gameActive, viewSettings
}) => {
  const [newName, setNewName] = useState('');
  const [isCondensed, setIsCondensed] = useState(false);

  const playerCount = players.length;
  const is2Col = playerCount >= 5 && !isCondensed;

  useEffect(() => {
    logger.info("scoreboard_layout", {
      ts: new Date().toISOString(),
      playerCount,
      layoutMode: is2Col ? "grid-2col" : "list-1col",
      scoreboardScale: viewSettings?.scoreboardScale || 1.0,
    });
  }, [playerCount, is2Col, viewSettings?.scoreboardScale]);

  const handleAddManual = () => {
    if (newName.trim()) {
      soundService.playClick();
      onAddPlayer(newName);
      setNewName('');
    }
  };

  const scoreboardStyles = {
    '--scoreboard-scale': viewSettings?.scoreboardScale || 1.0,
    '--player-name-scale': viewSettings?.playerNameFontSizeScale || 1.0,
    '--sb-name-font': `calc(clamp(12px, 1.0vw, 24px) * var(--player-name-scale, 1))`,
    '--sb-score-font': `calc(clamp(14px, 1.2vw, 28px) * var(--scoreboard-scale, 1))`,
  } as React.CSSProperties;

  return (
    <div 
      className="h-auto lg:h-full grid grid-rows-[auto_1fr_auto] border-t lg:border-t-0 lg:border-l border-gold-900/30 bg-black/95 w-full lg:w-[clamp(18rem,24vw*var(--scoreboard-scale),45rem)] shadow-2xl z-20 font-sans font-bold select-none transition-all duration-300 overflow-hidden"
      style={scoreboardStyles}
      data-testid="scoreboard-root"
      data-layout={is2Col ? "grid-2col" : "list-1col"}
    >
      <div className="flex-none p-3 border-b border-gold-900/30 bg-zinc-900/50 flex items-center justify-between z-10">
        <h3 className="text-gold-500 tracking-widest text-[10px] md:text-xs uppercase font-black">
          CONTESTANTS ({playerCount})
        </h3>
        <button 
          onClick={() => { soundService.playClick(); setIsCondensed(!isCondensed); }}
          className="lg:hidden text-zinc-500 hover:text-gold-500 p-1 rounded hover:bg-zinc-800 transition-colors"
        >
          {isCondensed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
        </button>
      </div>

      <div className="relative flex-1 p-2 md:p-3 overflow-hidden min-h-0">
        <div 
          className={`grid gap-2 h-full w-full items-stretch ${is2Col ? 'grid-cols-2' : 'grid-cols-1'}`}
          style={{ 
            gridTemplateRows: `repeat(${is2Col ? Math.ceil(playerCount / 2) : Math.max(1, playerCount)}, minmax(0, 1fr))` 
          }}
        >
          {players.map(p => {
            const isSelected = p.id === selectedPlayerId;
            const starsCount = p.wildcardsUsed || 0;
            const stealsCount = p.stealsCount || 0;
            const displayName = (p.name || "").toUpperCase();

            return (
              <div 
                key={p.id} 
                onClick={() => onSelectPlayer(p.id)}
                className={`relative px-3 rounded border transition-all duration-200 cursor-pointer group flex items-center justify-between min-w-0 h-full ${isSelected ? 'bg-gold-900/30 border-gold-500 shadow-[0_0_15px_rgba(255,215,0,0.2)] scale-[1.01]' : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-600'}`}
              >
                <div className="flex items-center min-w-0 flex-1 mr-2 overflow-hidden gap-1 md:gap-2">
                  <span 
                    className="truncate pr-1 font-roboto-bold tracking-wide uppercase transition-colors" 
                    style={{ fontSize: 'var(--sb-name-font)', color: isSelected ? 'white' : 'rgb(161 161 170)' }}
                  >
                    {displayName}
                  </span>
                  {!isCondensed && starsCount > 0 && (
                    <span 
                      aria-hidden="true" 
                      className="shrink-0 drop-shadow-md leading-none"
                      style={{ color: STAR_COLOR_BY_COUNT[Math.min(starsCount, 4)] || '#FFD400', fontSize: 'calc(var(--sb-name-font) * 0.8)' }}
                    >
                      {'★'.repeat(Math.min(starsCount, 4))}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  {!isCondensed && stealsCount > 0 && (
                    <span className="shrink-0 text-[8px] bg-purple-900/50 text-purple-200 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider border border-purple-500/30">S:{stealsCount}</span>
                  )}
                  <span className="font-mono font-black text-gold-400 drop-shadow-md" style={{ fontSize: 'var(--sb-score-font)' }}>{p.score}</span>
                </div>

                {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold-500 rounded-l animate-pulse" />}
                
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-4 transition-opacity rounded">
                   <button type="button" onClick={(e) => { e.stopPropagation(); soundService.playClick(); onUpdateScore(p.id, -100); }} className="p-1.5 bg-red-900/40 border border-red-500 text-red-500 hover:bg-red-900/60 rounded transition-colors"><Minus className="w-4 h-4" /></button>
                   <button type="button" onClick={(e) => { e.stopPropagation(); soundService.playClick(); onUpdateScore(p.id, 100); }} className="p-1.5 bg-green-900/40 border border-green-500 text-green-500 hover:bg-green-900/60 rounded transition-colors"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`flex-none p-2 border-t border-gold-900/30 bg-zinc-900/50 transition-all ${isCondensed ? 'hidden lg:block' : 'block'}`} style={{ height: 'clamp(34px, 4.5vh, 48px)' }}>
        <div className="flex gap-2 h-full items-center">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddManual(); } }} placeholder={gameActive ? "QUICK ADD" : "ADD CONTESTANT"} className="flex-1 bg-black border border-zinc-800 rounded px-2 text-[10px] text-white focus:border-gold-500 outline-none uppercase tracking-wide h-full placeholder:text-zinc-700" />
          <button type="button" onClick={handleAddManual} className="bg-gold-600 hover:bg-gold-500 text-black px-3 rounded transition-colors h-full flex items-center justify-center">{gameActive ? <UserPlus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}</button>
        </div>
      </div>
    </div>
  );
};
