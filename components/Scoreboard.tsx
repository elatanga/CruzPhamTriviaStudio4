import React, { useState } from 'react';
import { User, Plus, Minus, Volume2, VolumeX, Settings } from 'lucide-react';
import { Player } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  players: Player[];
  selectedPlayerId: string | null;
  onAddPlayer: (name: string) => void;
  onUpdateScore: (id: string, delta: number) => void;
  onSelectPlayer: (id: string) => void;
  gameActive: boolean;
}

export const Scoreboard: React.FC<Props> = ({ 
  players, selectedPlayerId, onAddPlayer, onUpdateScore, onSelectPlayer, gameActive 
}) => {
  const [newName, setNewName] = useState('');
  const [muted, setMuted] = useState(false);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onAddPlayer(newName.trim());
      setNewName('');
    }
  };

  const toggleMute = () => {
    const newVal = !muted;
    setMuted(newVal);
    soundService.setMute(newVal);
  };

  return (
    <div className="h-full flex flex-col border-l border-gold-900/30 bg-black/80 backdrop-blur-sm w-full md:w-72 lg:w-80 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-20">
      
      {/* Header & Settings */}
      <div className="p-4 border-b border-gold-900/30 flex items-center justify-between bg-zinc-950">
        <h3 className="font-serif text-gold-500 font-bold tracking-widest text-sm">CONTESTANTS ({players.length})</h3>
        <button onClick={toggleMute} className="text-zinc-500 hover:text-gold-500 transition-colors">
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Players List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
        {players.map(p => {
          const isSelected = p.id === selectedPlayerId;
          return (
            <div 
              key={p.id} 
              onClick={() => onSelectPlayer(p.id)}
              className={`
                relative p-3 rounded-lg border transition-all duration-200 cursor-pointer group flex flex-col
                ${isSelected 
                  ? 'bg-gold-900/20 border-gold-500 shadow-[0_0_15px_rgba(255,215,0,0.1)] scale-[1.02]' 
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'}
              `}
            >
              <div className="flex justify-between items-center mb-2">
                <span className={`font-bold truncate pr-2 ${isSelected ? 'text-white' : 'text-zinc-400'}`}>{p.name}</span>
                <span className={`text-2xl font-mono font-black ${isSelected ? 'text-gold-400' : 'text-zinc-600'}`}>
                  {p.score}
                </span>
              </div>
              
              {/* Quick Actions */}
              <div className="flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                 <button 
                   onClick={(e) => { e.stopPropagation(); onUpdateScore(p.id, -100); }} 
                   className="flex-1 bg-zinc-950 border border-zinc-800 text-red-500 hover:border-red-500 hover:bg-red-900/20 rounded py-1 flex justify-center"
                 >
                   <Minus className="w-3 h-3" />
                 </button>
                 <button 
                   onClick={(e) => { e.stopPropagation(); onUpdateScore(p.id, 100); }} 
                   className="flex-1 bg-zinc-950 border border-zinc-800 text-green-500 hover:border-green-500 hover:bg-green-900/20 rounded py-1 flex justify-center"
                 >
                   <Plus className="w-3 h-3" />
                 </button>
              </div>

              {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gold-500 rounded-l-lg animate-pulse" />}
            </div>
          );
        })}
        {players.length === 0 && <div className="text-center text-zinc-600 text-xs py-8 italic uppercase tracking-wider">Awaiting Players...</div>}
      </div>

      {/* Add Player Form */}
      <form onSubmit={handleAdd} className="p-3 border-t border-gold-900/30 bg-zinc-950">
        <div className="flex gap-2">
          <input 
            type="text" 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
            placeholder="NEW PLAYER NAME" 
            className="flex-1 bg-black border border-zinc-800 rounded px-3 py-2 text-xs text-white focus:border-gold-500 outline-none uppercase tracking-wide placeholder:text-zinc-700" 
          />
          <button type="submit" className="bg-gold-600 hover:bg-gold-500 text-black p-2 rounded transition-colors"><Plus className="w-4 h-4" /></button>
        </div>
      </form>
    </div>
  );
};