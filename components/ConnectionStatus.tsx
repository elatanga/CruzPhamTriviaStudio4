import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

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

  if (isOnline) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-red-900/90 text-white z-50 p-2 flex items-center justify-center gap-2 animate-in slide-in-from-bottom duration-300">
      <WifiOff className="w-4 h-4" />
      <span className="text-xs font-bold uppercase tracking-widest">Studio Offline - Reconnecting...</span>
    </div>
  );
};