import React, { useState } from 'react';
import { LogOut, Volume2, VolumeX } from 'lucide-react';
import { soundService } from '../services/soundService';
import { ConnectionStatus } from './ConnectionStatus';

interface AppShellProps {
  children: React.ReactNode;
  activeShowTitle?: string;
  username?: string | null;
  onLogout?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({ children, activeShowTitle, username, onLogout }) => {
  const [muted, setMuted] = useState(false);

  const toggleMute = () => {
    const newVal = !muted;
    setMuted(newVal);
    soundService.setMute(newVal);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-black text-gold-100 overflow-hidden relative selection:bg-gold-500 selection:text-black font-sans">
      {/* Background ambient glow */}
      <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gold-900/10 via-transparent to-transparent pointer-events-none z-0" />
      
      <ConnectionStatus />

      {/* HEADER: Fixed Height */}
      <header className="flex-none h-14 md:h-16 z-10 bg-gradient-to-b from-black via-black/95 to-transparent px-4 md:px-6 flex items-center justify-between border-b border-gold-900/30">
          {/* Left: Branding */}
          <div className="flex flex-col justify-center min-w-0">
            <h1 className="text-lg md:text-2xl font-serif font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300 drop-shadow-sm truncate">
              CRUZPHAM TRIVIA
            </h1>
          </div>

          {/* Center: Show Title (Desktop) */}
          {activeShowTitle && (
            <div className="hidden md:flex flex-col items-center absolute left-1/2 -translate-x-1/2 w-1/3">
               <h2 className="text-xs lg:text-sm font-bold uppercase tracking-[0.2em] text-gold-400 truncate w-full text-center">
                  SHOW: <span className="text-white">{activeShowTitle}</span>
               </h2>
            </div>
          )}

          {/* Right: User */}
          <div className="flex items-center gap-4 flex-none">
            {username && onLogout && (
              <>
                <span className="text-zinc-500 font-mono text-[10px] hidden lg:inline">PRODUCER: <span className="text-gold-400">{username}</span></span>
                <button 
                  onClick={onLogout}
                  className="flex items-center gap-2 text-red-500 hover:text-red-400 transition-colors text-xs font-bold uppercase"
                >
                  <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            )}
          </div>
      </header>
      
      {/* Mobile Title Bar */}
      {activeShowTitle && (
        <div className="md:hidden flex-none py-1.5 bg-zinc-900/80 text-center border-b border-zinc-800 backdrop-blur-sm z-10">
           <span className="text-[10px] font-bold uppercase tracking-widest text-gold-400 truncate px-4 block">SHOW: {activeShowTitle}</span>
        </div>
      )}

      {/* CONTENT: Flex Grow, No Scroll on Main (internal scroll handled by children) */}
      <main className="flex-1 relative z-10 flex flex-col min-h-0 overflow-hidden bg-black/50">
        {children}
      </main>

      {/* FOOTER: Fixed */}
      <footer className="flex-none h-10 bg-black z-20 border-t border-gold-900/30 flex items-center justify-between px-4 md:px-6">
        <div className="text-[10px] font-mono tracking-widest text-gray-600 uppercase flex gap-4">
          <span>© CRUZPHAM STUDIOS</span>
        </div>
        <button onClick={toggleMute} className="flex items-center gap-2 text-zinc-500 hover:text-gold-500 transition-colors text-[10px] uppercase font-bold tracking-wider">
           {muted ? <><VolumeX className="w-3 h-3" /> Muted</> : <><Volume2 className="w-3 h-3" /> Sound On</>}
        </button>
      </footer>
    </div>
  );
};