import React, { useState, useEffect } from 'react';
import { Plus, PlaySquare, Film, Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Show } from '../types';

interface Props {
  username: string;
  onSelectShow: (show: Show) => void;
}

export const ShowSelection: React.FC<Props> = ({ username, onSelectShow }) => {
  const [shows, setShows] = useState<Show[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    setShows(dataService.getShowsForUser(username));
  }, [username]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    
    setIsCreating(true);
    // Simulate brief network delay
    setTimeout(() => {
      const show = dataService.createShow(username, newTitle.trim());
      setShows(prev => [show, ...prev]);
      setNewTitle('');
      setIsCreating(false);
      onSelectShow(show);
    }, 500);
  };

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
      <div className="w-full max-w-2xl">
        <h2 className="text-3xl font-serif text-white mb-2 text-center">Select Production</h2>
        <p className="text-zinc-500 text-center text-sm mb-8 uppercase tracking-widest">
          Choose a show to manage its templates
        </p>

        {/* Create New Show Bar */}
        <form onSubmit={handleCreate} className="mb-8 flex gap-2">
          <input 
            type="text" 
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New Show Title (e.g. Saturday Night Trivia)"
            className="flex-1 bg-zinc-900 border border-zinc-700 text-white p-3 rounded focus:border-gold-500 outline-none"
          />
          <button 
            type="submit" 
            disabled={!newTitle || isCreating}
            className="bg-gold-600 hover:bg-gold-500 text-black font-bold px-6 rounded flex items-center gap-2 uppercase tracking-wide disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-5 h-5" />}
            Create
          </button>
        </form>

        {/* Show List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
          {shows.length === 0 && (
            <div className="col-span-full text-center py-12 border border-dashed border-zinc-800 rounded bg-zinc-900/30">
              <Film className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500">No active productions found.</p>
              <p className="text-zinc-600 text-xs mt-1">Create a show above to begin.</p>
            </div>
          )}
          
          {shows.map(show => (
            <button
              key={show.id}
              onClick={() => onSelectShow(show)}
              className="group bg-zinc-900/50 border border-zinc-800 hover:border-gold-500 p-6 rounded text-left transition-all hover:bg-zinc-900 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <PlaySquare className="w-5 h-5 text-gold-500" />
              </div>
              <h3 className="text-lg font-bold text-white group-hover:text-gold-400 truncate pr-6">{show.title}</h3>
              <p className="text-[10px] text-zinc-500 mt-2 uppercase tracking-wider font-mono">
                Created: {new Date(show.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};