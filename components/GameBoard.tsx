import React from 'react';
import { Category } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  categories: Category[];
  onSelectQuestion: (catId: string, qId: string) => void;
}

export const GameBoard: React.FC<Props> = ({ categories, onSelectQuestion }) => {
  // Determine dynamic grid dimensions
  const colCount = categories.length;
  const rowCount = categories[0]?.questions.length || 5; 

  return (
    <div className="h-full w-full flex flex-col p-2 md:p-4 bg-zinc-950/50">
      {/* The Board Grid: Fits exactly into container using 1fr for all tracks */}
      <div 
        className="flex-1 grid gap-1.5 md:gap-3 w-full h-full min-h-0 min-w-0"
        style={{ 
          gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
          gridTemplateRows: `auto repeat(${rowCount}, minmax(0, 1fr))` // Header row auto-sized, questions share remaining space equally
        }}
      >
        {/* Category Headers */}
        {categories.map((cat) => (
          <div key={cat.id} className="bg-gold-600 flex items-center justify-center p-2 rounded shadow-lg border-b-2 md:border-b-4 border-gold-800 text-center relative overflow-hidden group min-h-0">
             <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
             <h3 
                className="text-black font-black uppercase leading-none break-words line-clamp-2 drop-shadow-sm w-full" 
                style={{ fontSize: 'clamp(0.6rem, 1.2vw, 1.25rem)' }} // Responsive typography
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
                     w-full h-full flex items-center justify-center rounded border transition-all duration-200 relative overflow-hidden group min-h-0 min-w-0
                     ${q.isVoided 
                        ? 'bg-zinc-900 border-zinc-900 opacity-40 cursor-not-allowed' 
                        : q.isAnswered 
                          ? 'bg-black border-zinc-900 opacity-25 cursor-default' 
                          : 'bg-zinc-900/90 border-gold-600/20 text-gold-400 hover:bg-gold-600 hover:text-black hover:border-gold-500 hover:scale-[1.02] hover:shadow-[0_0_15px_rgba(255,215,0,0.3)] hover:z-10 cursor-pointer shadow-sm'
                     }
                   `}
                 >
                   {q.isVoided ? (
                     <span className="font-mono text-red-800 font-black tracking-widest rotate-[-15deg]" style={{ fontSize: 'clamp(0.5rem, 1vw, 1rem)' }}>VOID</span>
                   ) : q.isAnswered ? (
                     <span className="font-mono font-bold text-zinc-700 opacity-50" style={{ fontSize: 'clamp(1rem, 2vw, 2rem)' }}>---</span> 
                   ) : (
                     <span 
                        className="font-serif font-bold group-hover:scale-110 transition-transform shadow-black drop-shadow-lg"
                        style={{ fontSize: 'clamp(1rem, 2.5vw, 3rem)' }} // Points smaller than max header possibility, scaled
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