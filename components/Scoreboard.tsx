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

export const Scoreboard: React.FC<Props> = ({ 
  players, selectedPlayerId, onAddPlayer, onUpdateScore, onSelectPlayer, viewSettings
}) => {
  const [newName, setNewName] = useState('');

  const fontScale = viewSettings?.boardFontScale || 1.0;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      soundService.playClick();
      onAddPlayer(newName.trim());
      setNewName('');
    }
  };

  return (
    <div className="h-full flex flex-col border-t md:border-t-0 md:border-l border-gold-900/30 bg-black/95 w-full md:w-64 lg:w-72 shadow-2xl z-20 font-roboto font-bold select-none">
      
      {/* Header */}
      <div className="flex-none p-3 border-b border-gold-900/30 bg-zinc-900/50 flex items-center justify-between">
        <h3 className="text-gold-500 tracking-widest text-xs uppercase">PLAYERS ({players.length})</h3>
      </div>

      {/* Players List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {players.map(p => {
          const isSelected = p.id === selectedPlayerId;
          return (
            <div 
              key={p.id} 
              onClick={() => onSelectPlayer(p.id)}
              className={`
                relative p-2 rounded border transition-all duration-200 cursor-pointer group flex flex-col
                ${isSelected 
                  ? 'bg-gold-900/20 border-gold-500 shadow-[0_0_10px_rgba(255,215,0,0.1)]' 
                  : 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-600'}
              `}
            >
              <div className="flex justify-between items-center mb-1">
                <span className={`truncate pr-2 text-sm max-w-[60%] ${isSelected ? 'text-white' : 'text-zinc-400'}`}>{p.name}</span>
                <span className="font-mono font-black text-gold-400" style={{ fontSize: `calc(1.1rem * ${fontScale})` }}>
                  {p.score}
                </span>
              </div>
              
              {/* Quick Actions */}
              <div className="flex gap-1 h-6">
                 <button 
                   onClick={(e) => { e.stopPropagation(); soundService.playClick(); onUpdateScore(p.id, -100); }} 
                   className="flex-1 bg-zinc-950/80 border border-zinc-800 text-red-500 hover:border-red-500 hover:bg-red-900/20 rounded flex items-center justify-center transition-colors"
                 >
                   <Minus className="w-3 h-3" />
                 </button>
                 <button 
                   onClick={(e) => { e.stopPropagation(); soundService.playClick(); onUpdateScore(p.id, 100); }} 
                   className="flex-1 bg-zinc-950/80 border border-zinc-800 text-green-500 hover:border-green-500 hover:bg-green-900/20 rounded flex items-center justify-center transition-colors"
                 >
                   <Plus className="w-3 h-3" />
                 </button>
              </div>

              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold-500 rounded-l animate-pulse" />}
            </div>
          );
        })}
        {players.length === 0 && <div className="text-center text-zinc-700 text-[10px] py-4 italic uppercase tracking-wider">No Contestants</div>}
      </div>

      {/* Add Player Form */}
      <form onSubmit={handleAdd} className="flex-none p-2 border-t border-gold-900/30 bg-zinc-900/50">
        <div className="flex gap-2 h-8">
          <input 
            type="text" 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
            placeholder="ADD NAME" 
            className="flex-1 bg-black border border-zinc-800 rounded px-2 text-[10px] text-white focus:border-gold-500 outline-none uppercase tracking-wide placeholder:text-zinc-700" 
          />
          <button type="submit" className="bg-gold-600 hover:bg-gold-500 text-black px-3 rounded transition-colors flex items-center justify-center"><Plus className="w-4 h-4" /></button>
        </div>
      </form>
    </div>
  );
};