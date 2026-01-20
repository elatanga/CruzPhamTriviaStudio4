import React from 'react';
import { LogOut } from 'lucide-react';
import { authService } from '../services/authService';
import { ConnectionStatus } from './ConnectionStatus';

interface AppShellProps {
  children: React.ReactNode;
  activeShowTitle?: string;
  username?: string | null;
  onLogout?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({ children, activeShowTitle, username, onLogout }) => {
  return (
    <div className="h-screen w-screen flex flex-col bg-black text-gold-100 overflow-hidden relative selection:bg-gold-500 selection:text-black">
      {/* Background ambient glow */}
      <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gold-900/10 via-transparent to-transparent pointer-events-none z-0" />
      
      <ConnectionStatus />

      {/* HEADER */}
      <header className="flex-none pt-safe-top z-10 bg-gradient-to-b from-black via-black to-transparent pb-4 px-4">
        <div className="w-full relative border-b border-gold-900/30 pb-2 flex flex-col items-center">
          
          {/* User Controls (Top Right) */}
          {username && onLogout && (
            <div className="absolute right-0 top-0 flex items-center gap-4 text-xs">
              <span className="text-zinc-500 font-mono hidden md:inline">User: <span className="text-gold-400">{username}</span></span>
              <button 
                onClick={onLogout}
                className="flex items-center gap-1 text-red-400 hover:text-red-300 transition-colors"
              >
                <LogOut className="w-3 h-3" /> <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}

          <div className="text-center">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-serif font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300 drop-shadow-md">
              CRUZPHAM TRIVIA STUDIOS
            </h1>
            {activeShowTitle && (
              <div className="mt-1 flex items-center justify-center gap-2 animate-in slide-in-from-top fade-in duration-500">
                <span className="h-px w-8 bg-gold-700/50"></span>
                <h2 className="text-sm md:text-base font-bold uppercase tracking-[0.2em] text-gold-400">
                  SHOW: <span className="text-white">{activeShowTitle}</span>
                </h2>
                <span className="h-px w-8 bg-gold-700/50"></span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* CONTENT AREA - No Scroll (unless necessary), Flex Grow */}
      <main className="flex-1 relative z-10 flex flex-col min-h-0 overflow-hidden p-4 md:p-6">
        {children}
      </main>

      {/* FOOTER */}
      <footer className="flex-none pb-safe-bottom bg-black z-20 border-t border-gold-900/30">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col md:flex-row justify-between items-center text-[10px] md:text-xs font-mono tracking-widest text-gray-500 uppercase">
          <span>CREATED BY EL CRUZPHAM</span>
          <span>POWERED BY CRUZPHAM AGENCY</span>
        </div>
      </footer>
    </div>
  );
};