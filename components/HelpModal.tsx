
import React from 'react';
import { X, Keyboard, MonitorPlay } from 'lucide-react';
import { soundService } from '../services/soundService';

interface Props {
  onClose: () => void;
}

export const HelpModal: React.FC<Props> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-zinc-900 border border-gold-600 rounded-xl p-6 shadow-2xl relative">
        <button onClick={() => { soundService.playClick(); onClose(); }} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        
        <h3 className="text-xl font-serif text-gold-500 font-bold mb-6 flex items-center gap-2">
          <Keyboard className="w-5 h-5" /> Studio Guide
        </h3>

        <div className="space-y-6">
          
          <div className="space-y-3">
             <h4 className="text-xs uppercase font-bold text-zinc-400 border-b border-zinc-800 pb-1">Keyboard Controls</h4>
             <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between text-zinc-300"><span className="font-mono text-gold-500">SPACE</span> <span>Reveal Answer</span></div>
                <div className="flex justify-between text-zinc-300"><span className="font-mono text-green-500">ENTER</span> <span>Award Points</span></div>
                <div className="flex justify-between text-zinc-300"><span className="font-mono text-purple-500">S</span> <span>Steal Points</span></div>
                <div className="flex justify-between text-zinc-300"><span className="font-mono text-red-500">ESC</span> <span>Void Question</span></div>
                <div className="flex justify-between text-zinc-300"><span className="font-mono text-blue-500">BKSP</span> <span>Return to Board</span></div>
                <div className="flex justify-between text-zinc-300"><span className="font-mono text-zinc-500">ARROWS</span> <span>Select Player</span></div>
             </div>
          </div>

          <div className="space-y-3">
             <h4 className="text-xs uppercase font-bold text-zinc-400 border-b border-zinc-800 pb-1 flex items-center gap-2">
                <MonitorPlay className="w-3 h-3" /> Hosting Tips
             </h4>
             <ul className="text-xs text-zinc-400 space-y-2 list-disc pl-4">
                <li>Use <span className="text-white">Director Mode</span> to edit scores or questions during the game.</li>
                <li>Pop out the Director Panel to a second screen for seamless control.</li>
                <li>Questions marked VOID can be restored in the Director Panel.</li>
             </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
