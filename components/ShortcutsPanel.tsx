import React from 'react';

export const ShortcutsPanel: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 md:gap-x-4 gap-y-1 text-[9px] md:text-[10px] font-mono uppercase text-zinc-500 select-none">
      <div className="flex items-center gap-1"><span className="text-gold-500 font-bold">SPACE</span> REVEAL</div>
      <div className="flex items-center gap-1"><span className="text-green-500 font-bold">ENTER</span> AWARD</div>
      <div className="flex items-center gap-1"><span className="text-purple-500 font-bold">S</span> STEAL</div>
      <div className="flex items-center gap-1"><span className="text-red-500 font-bold">ESC</span> VOID</div>
      <div className="flex items-center gap-1"><span className="text-blue-500 font-bold">BKSP</span> RETURN</div>
      <div className="w-px h-3 bg-zinc-800 hidden md:block"></div>
      <div className="flex items-center gap-1"><span className="text-zinc-300">↑/↓</span> PLAYER</div>
      <div className="flex items-center gap-1"><span className="text-zinc-300">+/-</span> SCORE</div>
    </div>
  );
};