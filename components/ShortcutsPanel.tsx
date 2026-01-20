import React from 'react';

export const ShortcutsPanel: React.FC = () => {
  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-auto md:right-4 md:bottom-16 bg-black/80 backdrop-blur-md border border-zinc-800 p-3 rounded-lg flex flex-wrap gap-4 items-center justify-center text-[10px] md:text-xs font-mono uppercase text-zinc-500 z-30 pointer-events-none select-none">
      <div className="flex items-center gap-1"><span className="border border-zinc-600 px-1 rounded text-gold-500 font-bold">SPACE</span> REVEAL</div>
      <div className="flex items-center gap-1"><span className="border border-zinc-600 px-1 rounded text-green-500 font-bold">ENTER</span> AWARD</div>
      <div className="flex items-center gap-1"><span className="border border-zinc-600 px-1 rounded text-purple-500 font-bold">S</span> STEAL</div>
      <div className="flex items-center gap-1"><span className="border border-zinc-600 px-1 rounded text-red-500 font-bold">ESC</span> VOID</div>
      <div className="flex items-center gap-1"><span className="border border-zinc-600 px-1 rounded text-blue-500 font-bold">BKSP</span> RETURN</div>
      <div className="w-px h-4 bg-zinc-700 hidden md:block"></div>
      <div className="flex items-center gap-1"><span className="border border-zinc-600 px-1 rounded text-zinc-300">↑/↓</span> PLAYER</div>
      <div className="flex items-center gap-1"><span className="border border-zinc-600 px-1 rounded text-zinc-300">+/-</span> SCORE</div>
    </div>
  );
};