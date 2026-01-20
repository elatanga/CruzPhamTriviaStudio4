import React, { useState, useEffect, useRef } from 'react';
import { LogOut, Volume2, VolumeX, Sliders } from 'lucide-react';
import { soundService } from '../services/soundService';
import { ConnectionStatus } from './ConnectionStatus';

interface AppShellProps {
  children: React.ReactNode;
  activeShowTitle?: string;
  username?: string | null;
  onLogout?: () => void;
  shortcuts?: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children, activeShowTitle, username, onLogout, shortcuts }) => {
  const [muted, setMuted] = useState(soundService.getMute());
  const [volume, setVolume] = useState(soundService.getVolume());
  const [showVolSlider, setShowVolSlider] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Close slider when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (sliderRef.current && !sliderRef.current.contains(event.target as Node)) {
        setShowVolSlider(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !muted;
    setMuted(newVal);
    soundService.setMute(newVal);
    if (!newVal) soundService.playClick(); // Feedback when unmutes
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    soundService.setVolume(val);
    if (muted && val > 0) {
      setMuted(false);
      soundService.setMute(false);
    }
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
            <h1 className="text-lg md:text-2xl font-serif font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300 drop-shadow-sm truncate cursor-pointer hover:opacity-80 transition-opacity" onClick={() => soundService.playClick()}>
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
                  onClick={() => { soundService.playClick(); onLogout(); }}
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

      {/* FOOTER: Auto height based on content, but typically fixed at bottom */}
      <footer className="flex-none bg-black z-20 border-t border-gold-900/30 flex flex-col md:flex-row items-center justify-between px-4 py-2 gap-3 min-h-[40px]">
        {/* Credits */}
        <div className="text-[9px] font-mono tracking-widest text-gray-600 uppercase flex flex-col md:flex-row items-center gap-1 md:gap-4 text-center md:text-left">
          <span>CREATED BY EL CRUZPHAM</span>
          <span className="hidden md:inline text-zinc-800">|</span>
          <span>POWERED BY CRUZPHAM AGENCY</span>
        </div>
        
        {/* Shortcuts Panel (Dynamic) */}
        {shortcuts && (
          <div className="order-last md:order-none w-full md:w-auto border-t border-zinc-900 md:border-t-0 pt-2 md:pt-0">
            {shortcuts}
          </div>
        )}

        {/* Sound Controls */}
        <div className="relative flex-none" ref={sliderRef}>
           <div 
             className="flex items-center gap-2 text-zinc-500 hover:text-gold-500 transition-colors text-[10px] uppercase font-bold tracking-wider cursor-pointer select-none bg-zinc-900/50 px-2 py-1 rounded"
             onClick={() => setShowVolSlider(!showVolSlider)}
           >
              {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              <span className="hidden sm:inline">Sound: {muted ? 'Off' : 'On'}</span>
           </div>

           {/* Volume Popover */}
           {showVolSlider && (
             <div className="absolute bottom-full right-0 mb-2 bg-zinc-900 border border-gold-600/50 p-3 rounded shadow-xl flex flex-col items-center gap-2 min-w-[120px] animate-in slide-in-from-bottom-2 fade-in z-50">
               <div className="flex justify-between w-full items-center mb-1">
                 <span className="text-[10px] text-zinc-400 uppercase font-bold">Volume</span>
                 <button onClick={toggleMute} className="text-gold-500 hover:text-white">
                    {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                 </button>
               </div>
               <input 
                 type="range" 
                 min="0" 
                 max="1" 
                 step="0.05"
                 value={volume} 
                 onChange={handleVolumeChange}
                 className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-gold-500"
               />
               <div className="text-[9px] text-zinc-500 font-mono w-full text-right">{Math.round(volume * 100)}%</div>
             </div>
           )}
        </div>
      </footer>
    </div>
  );
};