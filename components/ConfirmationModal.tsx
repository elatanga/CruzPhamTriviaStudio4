
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { soundService } from '../services/soundService';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDanger?: boolean;
}

export const ConfirmationModal: React.FC<Props> = ({ 
  isOpen, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, isDanger = false 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-xl p-6 shadow-2xl relative">
        <button onClick={() => { soundService.playClick(); onCancel(); }} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex flex-col items-center text-center gap-4">
          {isDanger && (
            <div className="p-3 bg-red-900/20 rounded-full border border-red-500/50">
               <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          )}
          
          <div>
            <h3 className="text-xl font-bold text-white font-serif mb-2">{title}</h3>
            <p className="text-zinc-400 text-sm leading-relaxed">{message}</p>
          </div>
          
          <div className="flex gap-3 w-full mt-4">
            <button 
              onClick={() => { soundService.playClick(); onCancel(); }}
              className="flex-1 py-3 rounded border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800 font-bold uppercase text-xs transition-colors"
            >
              {cancelLabel}
            </button>
            <button 
              onClick={() => { soundService.playClick(); onConfirm(); }}
              className={`flex-1 py-3 rounded font-bold uppercase text-xs text-white transition-colors shadow-lg ${isDanger ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' : 'bg-gold-600 hover:bg-gold-500 text-black shadow-gold-900/20'}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
