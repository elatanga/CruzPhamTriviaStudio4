
import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Plus, Minus, Maximize2, Minimize2 } from 'lucide-react';
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
  players, selectedPlayerId, onAddPlayer, onUpdateScore, onSelectPlayer, viewSettings
}) => {
  const [newName, setNewName] = useState('');
  const [isCondensed, setIsCondensed] = useState(false);
  
  // Measurement for Desktop Fit Logic
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [fitMetrics, setFitMetrics] = useState({
    rowHeight: 56,
    fontSize: 20,
    gap: 8
  });

  const fontScale = viewSettings?.boardFontScale || 1.0;
  const scoreboardScale = viewSettings?.scoreboardScale || 1.0;

  // AUTO-FIT CALCULATION (DESKTOP/WEB ONLY)
  useLayoutEffect(() => {
    const measureAndCompute = () => {
      if (!listContainerRef.current) return;
      
      const isDesktop = window.innerWidth >= 1024;
      if (!isDesktop) return;

      try {
        const rect = listContainerRef.current.getBoundingClientRect();
        const availableHeight = rect.height;
        const playerCount = players.length || 1;

        if (availableHeight <= 0) {
          logger.warn("scoreboard_fit_fallback", { playerCount, ts: new Date().toISOString() });
          setFitMetrics({ rowHeight: 56, fontSize: 20, gap: 8 });
          return;
        }

        // Reserve space for padding/borders (approx 20px)
        const effectiveHeight = availableHeight - 20;
        
        // Calculate dynamic dimensions
        const calculatedRow = effectiveHeight / playerCount;
        // Clamp: Min 36px (compact but readable), Max 88px (aesthetic ceiling)
        const rowHeight = Math.max(36, Math.min(calculatedRow, 88));
        
        // Scale font and gap relative to row height
        const fontSize = Math.max(12, Math.min(rowHeight * 0.35, 30));
        const gap = Math.max(4, Math.min(rowHeight * 0.12, 14));

        setFitMetrics({ rowHeight, fontSize, gap });
        
        logger.info("scoreboard_fit_compute", {
          playerCount,
          availableHeight,
          rowHeight,
          fontSize,
          ts: new Date().toISOString()
        });
      } catch (err: any) {
        logger.error("scoreboard_fit_error", { message: err.message, ts: new Date().toISOString() });
      }
    };

    measureAndCompute();
    
    const observer = new ResizeObserver(measureAndCompute);
    if (listContainerRef.current) observer.observe(listContainerRef.current);
    window.addEventListener('resize', measureAndCompute);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureAndCompute);
    };
  }, [players.length]);

  const handleAddManual = () => {
    if (newName.trim()) {
      soundService.playClick();
      onAddPlayer(newName);
      setNewName('');
    }
  };

  const scoreboardStyles = {
    '--scoreboard-scale': scoreboardScale,
    '--board-font-scale': fontScale,
    '--sb-row-h': `${fitMetrics.rowHeight}px`,
    '--sb-font': `${fitMetrics.fontSize}px`,
    '--sb-gap': `${fitMetrics.gap}px`,
  } as React.CSSProperties;

  return (
    <div 
      className="h-auto lg:h-full flex flex-col border-t lg:border-t-0 lg:border-l border-gold-900/30 bg-black/95 w-full lg:w-[clamp(18rem,20vw*var(--scoreboard-scale),30rem)] shadow-2xl z-20 font-sans font-bold select-none transition-all duration-300 overflow-hidden overscroll-behavior-none"
      style={scoreboardStyles}
    >
      
      {/* Header */}
      <div className="flex-none p-2 md:p-3 border-b border-gold-900/30 bg-zinc-900/50 flex items-center justify-between">
        <h3 className="text-gold-500 tracking-widest text-[10px] md:text-xs uppercase" style={{ fontSize: `calc(0.75rem * var(--scoreboard-scale))` }}>
          PLAYERS ({players.length})
        </h3>
        <button 
          onClick={() => { soundService.playClick(); setIsCondensed(!isCondensed); }}
          className="lg:hidden text-zinc-500 hover:text-gold-500 p-1 rounded hover:bg-zinc-800 transition-colors"
          title={isCondensed ? "Expanded Mode" : "Focus Mode"}
        >
          {isCondensed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
        </button>
      </div>

      {/* Players List - Scroll strictly disabled on desktop via lg:overflow-hidden */}
      <div 
        ref={listContainerRef}
        className={`flex-1 overflow-y-auto lg:overflow-hidden p-2 custom-scrollbar max-h-[300px] lg:max-h-none ${isCondensed ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:flex lg:flex-col gap-2 space-y-0' : 'space-y-[var(--sb-gap,8px)]'}`} 
        style={{ 
          padding: `calc(0.5rem * var(--scoreboard-scale))`,
          scrollbarWidth: 'none'
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
              className={`
                relative p-2 md:p-3 rounded border transition-all duration-200 cursor-pointer group flex flex-col justify-center
                ${isSelected 
                  ? 'bg-gold-900/30 border-gold-500 shadow-[0_0_15px_rgba(255,215,0,0.2)] scale-[1.01] lg:scale-[1.02]' 
                  : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-600'}
                ${isCondensed ? 'p-1.5 md:p-2' : ''}
              `}
              style={{ 
                height: isCondensed ? 'auto' : 'var(--sb-row-h, 4rem)',
                minHeight: '36px'
              }}
            >
              <div className={`flex justify-between items-center ${isCondensed ? 'flex-col lg:flex-row items-start lg:items-center' : ''}`}>
                <div className="flex items-center min-w-0 flex-1 mr-2 overflow-hidden gap-1.5 md:gap-2">
                  <span 
                    className={`truncate pr-1 font-roboto font-bold tracking-wide ${isSelected ? 'text-white' : 'text-zinc-400'}`} 
                    style={{ 
                      fontSize: isCondensed ? 'auto' : 'var(--sb-font, 18px)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isCondensed ? displayName.split(' ')[0] : displayName}
                  </span>
                  {!isCondensed && starsCount > 0 && (
                    <span 
                      aria-hidden="true" 
                      className="shrink-0 drop-shadow-md leading-none"
                      style={{ 
                        color: STAR_COLOR_BY_COUNT[Math.min(starsCount, 4)] || '#FFD400',
                        fontSize: 'calc(var(--sb-font) * 0.7)'
                      }}
                    >
                      {'★'.repeat(Math.min(starsCount, 4))}
                    </span>
                  )}
                  {!isCondensed && stealsCount > 0 && (
                    <span 
                      className="shrink-0 text-[8px] md:text-[10px] bg-purple-900/50 text-purple-200 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider border border-purple-500/30"
                      style={{ fontSize: 'calc(var(--sb-font) * 0.5)' }}
                    >
                      S:{stealsCount}
                    </span>
                  )}
                </div>
                <span 
                  className={`font-mono font-black text-gold-400 drop-shadow-md ${isCondensed ? 'mt-1 lg:mt-0' : ''}`} 
                  style={{ fontSize: isCondensed ? '0.9rem' : 'calc(var(--sb-font) * 1.1)' }}
                >
                  {p.score}
                </span>
              </div>
              
              {!isCondensed && fitMetrics.rowHeight > 54 && (
                <div className="flex gap-2 mt-1 h-6 md:h-7 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button 
                     type="button"
                     onClick={(e) => { e.stopPropagation(); soundService.playClick(); onUpdateScore(p.id, -100); }} 
                     className="flex-1 bg-zinc-950/80 border border-zinc-800 text-red-500 hover:border-red-500 hover:bg-red-900/20 rounded flex items-center justify-center transition-colors"
                   >
                     <Minus className="w-3 h-3" />
                   </button>
                   <button 
                     type="button"
                     onClick={(e) => { e.stopPropagation(); soundService.playClick(); onUpdateScore(p.id, 100); }} 
                     className="flex-1 bg-zinc-950/80 border border-zinc-800 text-green-500 hover:border-green-500 hover:bg-green-900/20 rounded flex items-center justify-center transition-colors"
                   >
                     <Plus className="w-3 h-3" />
                   </button>
                </div>
              )}

              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 md:w-1.5 bg-gold-500 rounded-l animate-pulse" />}
            </div>
          );
        })}
        {players.length === 0 && <div className="text-center text-zinc-700 text-[10px] py-4 italic uppercase tracking-wider">No Contestants</div>}
      </div>

      {/* Add Player Form (Hidden in condensed mode on mobile) */}
      <div className={`flex-none p-2 md:p-3 border-t border-gold-900/30 bg-zinc-900/50 ${isCondensed ? 'hidden lg:block' : ''}`}>
        <div className="flex gap-2 h-10">
          <input 
            type="text" 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
            onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleAddManual(); } }}
            placeholder="ADD NAME" 
            className="flex-1 bg-black border border-zinc-800 rounded px-2 md:px-3 text-xs text-white focus:border-gold-500 outline-none uppercase tracking-wide placeholder:text-zinc-700 min-h-[44px]" 
          />
          <button type="button" onClick={handleAddManual} className="bg-gold-600 hover:bg-gold-500 text-black px-4 rounded transition-colors flex items-center justify-center min-h-[44px] min-w-[44px]"><Plus className="w-5 h-5" /></button>
        </div>
      </div>
    </div>
  );
};
