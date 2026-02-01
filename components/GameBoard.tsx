import React from 'react';
import { Category, BoardViewSettings } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  categories: Category[];
  onSelectQuestion: (catId: string, qId: string) => void;
  viewSettings: BoardViewSettings;
}

export const GameBoard: React.FC<Props> = ({ categories, onSelectQuestion, viewSettings }) => {
  // Determine dynamic grid dimensions
  const colCount = categories.length;
  const rowCount = categories[0]?.questions.length || 5; 

  const fontScale = viewSettings?.boardFontScale || 1.0;
  const tileScale = viewSettings?.tileScale || 1.0;

  // Custom CSS variable application
  const boardStyles = {
    '--board-font-scale': fontScale,
    '--tile-scale': tileScale,
  } as React.CSSProperties;

  return (
    <div 
      className="h-full w-full flex flex-col p-2 md:p-4 bg-zinc-950/50 font-roboto font-bold select-none min-h-[400px] lg:min-h-0"
      style={boardStyles}
    >
      {/* The Board Grid: Fits Container, stacks on small screens via minmax */}
      <div 
        className="flex-1 grid gap-1.5 md:gap-3 w-full h-full min-h-0 min-w-0"
        style={{ 
          gridTemplateColumns: `repeat(${colCount}, minmax(72px, 1fr))`,
          gridTemplateRows: `auto repeat(${rowCount}, minmax(60px, 1fr))` 
        }}
      >
        {/* Category Headers - Dark Navy with White Text */}
        {categories.map((cat) => (
          <div 
            key={cat.id} 
            className="bg-navy-900 flex items-center justify-center p-2 md:p-3 rounded shadow-lg border-b-2 border-white/20 text-center relative overflow-hidden group min-h-[44px]"
          >
             <h3 
                className="text-white uppercase leading-tight break-words line-clamp-2 w-full tracking-wide font-black" 
                style={{ fontSize: `clamp(12px, calc(1.5vw * var(--board-font-scale)), 44px)` }} 
             >
               {cat.title}
             </h3>
          </div>
        ))}

        {/* Question Cells - Row-major iteration mapped to Grid */}
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
                        ? 'bg-zinc-900 border-zinc-900 opacity-40 cursor-not-allowed' 
                        : q.isAnswered 
                          ? 'bg-black border-zinc-900 opacity-25 cursor-default' 
                          : 'bg-zinc-900/90 border-gold-600/20 text-gold-400 hover:bg-gold-600 hover:text-black hover:border-gold-500 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(255,215,0,0.4)] hover:z-10 cursor-pointer shadow-sm active:scale-95'
                     }
                   `}
                   style={{
                     padding: `calc(4px * var(--tile-scale))`
                   }}
                 >
                   {q.isVoided ? (
                     <span className="font-mono text-red-800 font-black tracking-widest rotate-[-15deg]" style={{ fontSize: `clamp(10px, calc(1vw * var(--board-font-scale)), 20px)` }}>VOID</span>
                   ) : q.isAnswered ? (
                     <span className="font-mono font-bold text-zinc-700 opacity-50" style={{ fontSize: `clamp(10px, calc(1vw * var(--board-font-scale)), 32px)` }}>---</span> 
                   ) : (
                     <span 
                        className="group-hover:scale-110 transition-transform shadow-black drop-shadow-lg font-black"
                        style={{ fontSize: `clamp(16px, calc(2.8vw * var(--board-font-scale)), 72px)` }}
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