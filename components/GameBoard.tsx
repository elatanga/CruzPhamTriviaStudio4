import React from 'react';
import { Category } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  categories: Category[];
  onSelectQuestion: (catId: string, qId: string) => void;
}

export const GameBoard: React.FC<Props> = ({ categories, onSelectQuestion }) => {
  return (
    <div className="h-full w-full overflow-auto flex items-center justify-center p-4">
      <div 
        className="grid gap-3 md:gap-4 w-full max-w-7xl h-full max-h-[85vh] content-center"
        style={{ gridTemplateColumns: `repeat(${categories.length}, minmax(150px, 1fr))` }}
      >
        {/* Headers */}
        {categories.map((cat) => (
          <div key={cat.id} className="bg-gold-600 flex items-center justify-center p-4 rounded-lg shadow-lg border-b-4 border-gold-900 text-center relative overflow-hidden">
             <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
             <h3 className="text-black font-black uppercase text-sm md:text-lg lg:text-xl tracking-tight leading-none break-words line-clamp-2 drop-shadow-sm">
               {cat.title}
             </h3>
          </div>
        ))}

        {/* Grid Cells (Row Major logic needs to be transposed for Column Major display or mapped by index) */}
        {/* We need rows. Max rows? Let's assume uniform rows for visual grid based on the first category for now or map simply */}
        {Array.from({ length: Math.max(...categories.map(c => c.questions.length)) }).map((_, rowIdx) => (
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
                     aspect-[16/9] md:aspect-[4/3] flex items-center justify-center rounded-lg border-2 transition-all duration-300 relative overflow-hidden group
                     ${q.isVoided 
                        ? 'bg-zinc-950 border-zinc-900 opacity-50 cursor-not-allowed' 
                        : q.isAnswered 
                          ? 'bg-black border-zinc-800 opacity-40 cursor-default' 
                          : 'bg-zinc-900/80 border-gold-600/30 text-gold-400 hover:bg-gold-600 hover:text-black hover:scale-105 hover:shadow-[0_0_25px_rgba(255,215,0,0.5)] cursor-pointer'
                     }
                   `}
                 >
                   {q.isVoided ? (
                     <span className="font-mono text-sm uppercase text-red-900 font-black tracking-widest rotate-[-15deg]">VOID</span>
                   ) : q.isAnswered ? (
                     <span className="font-mono text-3xl font-bold opacity-10 text-zinc-500">---</span> 
                   ) : (
                     <span className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold shadow-black drop-shadow-lg group-hover:scale-110 transition-transform">
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