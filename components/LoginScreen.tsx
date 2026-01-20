
import React, { useState } from 'react';
import { Lock, ArrowRight, Loader2, Key, HelpCircle } from 'lucide-react';
import { authService } from '../services/authService';
import { TokenRequestModal } from './TokenRequestModal';
import { Session } from '../types';

interface Props {
  onLoginSuccess: (session: Session) => void;
  addToast: (type: any, msg: string) => void;
}

export const LoginScreen: React.FC<Props> = ({ onLoginSuccess, addToast }) => {
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !token) return;

    setIsLoading(true);
    try {
      const result = await authService.login(username, token);
      if (result.success && result.session) {
        onLoginSuccess(result.session);
      } else {
        addToast('error', result.message || 'Login failed');
      }
    } catch (err) {
      addToast('error', 'Authentication service unavailable');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-full">
        <div className="w-full max-w-md bg-black/50 border border-gold-900/50 p-8 rounded-2xl backdrop-blur-sm shadow-2xl relative overflow-hidden group">
          
          {/* Decorative shine effect */}
          <div className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-gold-500/5 to-transparent skew-x-12 group-hover:left-[200%] transition-all duration-1000 ease-in-out pointer-events-none" />

          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gold-900/20 rounded-full border border-gold-600/30">
              <Lock className="w-8 h-8 text-gold-500" />
            </div>
          </div>

          <h2 className="text-3xl font-serif text-center text-white mb-2">Studio Access</h2>
          <p className="text-zinc-500 text-center text-sm mb-8 px-4">
            Enter your secure credentials to manage productions.
          </p>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1">
              <label className="text-xs uppercase font-bold text-gold-600 ml-1 flex justify-between">
                Username
              </label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-gold-500 text-white p-3 rounded-lg outline-none transition-all placeholder:text-zinc-700"
                placeholder="e.g. producer_one"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-xs uppercase font-bold text-gold-600 ml-1 flex justify-between group cursor-help">
                <span className="flex items-center gap-1">Access Token <HelpCircle className="w-3 h-3 text-zinc-600" /></span>
                <span className="text-[9px] text-zinc-600 normal-case font-normal opacity-0 group-hover:opacity-100 transition-opacity">e.g. pk-738...</span>
              </label>
              <input 
                type="password" 
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full bg-zinc-900/80 border border-zinc-800 focus:border-gold-500 text-white p-3 rounded-lg outline-none transition-all placeholder:text-zinc-700"
                placeholder="Paste your token here..."
              />
            </div>

            <button 
              type="submit" 
              disabled={isLoading || !username || !token}
              className="w-full mt-2 bg-gradient-to-r from-gold-600 to-gold-500 hover:brightness-110 text-black font-bold py-3.5 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider text-sm"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enter Studio'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gold-900/20 text-center">
            <p className="text-zinc-500 text-xs mb-3">New Producer?</p>
            <button 
              onClick={() => setShowRequestModal(true)}
              className="group text-gold-500 hover:text-gold-300 text-sm font-medium flex items-center justify-center gap-2 mx-auto transition-colors"
            >
              <span className="border-b border-transparent group-hover:border-gold-300">Request Access Token</span> <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>

      {showRequestModal && (
        <TokenRequestModal 
          onClose={() => setShowRequestModal(false)} 
          onSuccess={() => {
            // Success view handles navigation
          }}
        />
      )}
    </>
  );
};
