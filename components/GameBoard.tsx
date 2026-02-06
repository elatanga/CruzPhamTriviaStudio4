
import React, { useEffect } from 'react';
import { Category, BoardViewSettings } from '../types';
import { soundService } from '../services/soundService';
import { logger } from '../services/logger';

interface Props {
  categories: Category[];
  onSelectQuestion: (catId: string, qId: string) => void;
  viewSettings: BoardViewSettings;
}

export const GameBoard: React.FC<Props> = ({ categories, onSelectQuestion, viewSettings }) => {
  // Theme Logging
  useEffect(() => {
    logger.info("trivia_board_theme_updated", { backgroundTheme: "luxury_light", atIso: new Date().toISOString() });
  }, []);

  const colCount = categories.length;
  const rowCount = categories[0]?.questions.length || 5; 

  const boardStyles = {
    '--board-font-scale': viewSettings?.boardFontScale || 1.0,
    '--tile-scale': viewSettings?.tileScale || 1.0,
    '--cat-font-scale': viewSettings?.categoryFontSizeScale || 1.0,
    '--tile-font-scale': viewSettings?.tileFontSizeScale || 1.0,
    '--tile-padding-scale': viewSettings?.tilePaddingScale || 1.0,
  } as React.CSSProperties;

  return (
    <div 
      className="h-full w-full flex flex-col p-2 md:p-4 font-roboto font-bold select-none min-h-[400px] lg:min-h-0"
      style={boardStyles}
    >
      <div 
        className="flex-1 grid gap-1.5 md:gap-3 w-full h-full min-h-0 min-w-0"
        style={{ 
          gridTemplateColumns: `repeat(${colCount}, minmax(72px, 1fr))`,
          gridTemplateRows: `auto repeat(${rowCount}, minmax(60px, 1fr))` 
        }}
      >
        {/* Category Headers */}
        {categories.map((cat) => (
          <div 
            key={cat.id} 
            className="bg-navy-900 flex items-center justify-center p-2 md:p-3 rounded shadow-xl border-b-4 border-black/20 text-center relative overflow-hidden group min-h-[44px]"
          >
             <h3 
                className="text-white uppercase leading-tight break-words line-clamp-2 w-full tracking-wide font-black" 
                style={{ fontSize: `clamp(12px, calc(1.5vw * var(--cat-font-scale)), 64px)` }} 
             >
               {cat.title}
             </h3>
          </div>
        ))}

        {/* Question Cells */}
        {Array.from({ length: rowCount }).map((_, rowIdx) => (
           <React.Fragment key={rowIdx}>
             {categories.map((cat) => {
               const q = cat.questions[rowIdx];
               if (!q) return <div key={`empty-${cat.id}-${rowIdx}`} className="bg-transparent" />;
               
               const isPlayable = !q.isAnswered && !q.isVoided;
               
               return (
                 <button 
                   key={q.id} 
                   disabled={!isPlayable} 
                   onClick={() => {
                     soundService.playSelect();
                     onSelectQuestion(cat.id, q.id);
                   }} 
                   className={`
                     w-full h-full flex items-center justify-center rounded border transition-all duration-200 relative overflow-hidden group min-h-[60px] min-w-0
                     ${q.isVoided 
                        ? 'bg-black/80 border-black opacity-50 cursor-not-allowed grayscale' 
                        : q.isAnswered 
                          ? 'bg-zinc-800/10 border-zinc-200 opacity-20 cursor-default shadow-inner' 
                          : 'bg-zinc-900 border-gold-600/30 text-gold-400 hover:bg-gold-600 hover:text-black hover:border-gold-500 hover:scale-[1.03] shadow-xl hover:shadow-gold-500/20 hover:z-10 cursor-pointer active:scale-95'
                     }
                   `}
                   style={{
                     padding: `calc(4px * var(--tile-padding-scale))`
                   }}
                 >
                   {q.isVoided ? (
                     <span className="font-mono text-red-600 font-black tracking-widest rotate-[-15deg]" style={{ fontSize: `clamp(10px, calc(1vw * var(--tile-font-scale)), 20px)` }}>VOID</span>
                   ) : q.isAnswered ? (
                     <span className="font-mono font-bold text-zinc-400" style={{ fontSize: `clamp(10px, calc(1vw * var(--tile-font-scale)), 32px)` }}>---</span> 
                   ) : (
                     <span 
                        className="group-hover:scale-110 transition-transform shadow-black drop-shadow-xl font-black"
                        style={{ fontSize: `clamp(16px, calc(2.8vw * var(--tile-font-scale)), 96px)` }}
                     >
                       {q.points}
                     </span>
                   )}
                 </button>
               );
             })}
           </React.Fragment>
        ))}
      </div>
    </div>
  );
};
