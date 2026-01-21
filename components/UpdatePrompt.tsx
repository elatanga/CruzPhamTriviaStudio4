
import React, { useState, useEffect } from 'react';
import { RefreshCw, Download } from 'lucide-react';

export const UpdatePrompt: React.FC = () => {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    // Listen for service worker updates
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setShowUpdate(true);
      });
    }
  }, []);

  const handleRefresh = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed bottom-12 right-4 z-[100] animate-in slide-in-from-bottom duration-500">
      <button 
        onClick={handleRefresh}
        className="bg-gold-500 text-black font-bold px-4 py-3 rounded-lg shadow-2xl flex items-center gap-2 border-2 border-white/20 hover:scale-105 transition-transform"
      >
        <Download className="w-5 h-5 animate-bounce" />
        <div className="text-left">
          <p className="text-[10px] uppercase leading-none">New Version</p>
          <p className="text-sm leading-none">Tap to Update</p>
        </div>
      </button>
    </div>
  );
};
