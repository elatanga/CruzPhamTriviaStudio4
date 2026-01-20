import React, { useEffect } from 'react';
import { ToastMessage } from '../types';
import { XCircle, CheckCircle, Info } from 'lucide-react';
import { soundService } from '../services/soundService';

interface ToastContainerProps {
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onRemove: () => void }> = ({ toast, onRemove }) => {
  useEffect(() => {
    // Play sound on mount
    soundService.playToast(toast.type);

    const timer = setTimeout(onRemove, 5000);
    return () => clearTimeout(timer);
  }, [toast.type, onRemove]);

  const bgStyles = {
    success: 'bg-green-900/90 border-green-500 text-green-100',
    error: 'bg-red-900/90 border-red-500 text-red-100',
    info: 'bg-blue-900/90 border-blue-500 text-blue-100',
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <XCircle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />,
  };

  return (
    <div className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded border shadow-lg backdrop-blur-sm animate-in slide-in-from-right duration-300 max-w-sm ${bgStyles[toast.type]}`}>
      {icons[toast.type]}
      <p className="text-sm font-medium">{toast.message}</p>
    </div>
  );
};