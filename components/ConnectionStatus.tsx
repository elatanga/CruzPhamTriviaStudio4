
import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Activity } from 'lucide-react';

export const ConnectionStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return (
      <div className="fixed bottom-2 left-2 z-50 flex items-center gap-2 pointer-events-none opacity-40 hover:opacity-100 transition-opacity select-none">
         <div className="relative flex h-2 w-2">
           <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
           <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
         </div>
         <span className="text-[9px] text-green-500 font-mono uppercase tracking-widest flex items-center gap-1">
           <Activity className="w-3 h-3" /> System Live
         </span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-red-900/90 text-white z-50 p-2 flex items-center justify-center gap-2 animate-in slide-in-from-bottom duration-300 shadow-lg border-t border-red-700">
      <WifiOff className="w-4 h-4 animate-pulse" />
      <span className="text-xs font-bold uppercase tracking-widest">Connection Lost — Reconnecting...</span>
    </div>
  );
};
