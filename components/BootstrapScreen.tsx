import React, { useState } from 'react';
import { Shield, Key, Loader2, Copy, Check } from 'lucide-react';
import { authService } from '../services/authService';
import { soundService } from '../services/soundService';

interface Props {
  onComplete: () => void;
  addToast: (type: any, msg: string) => void;
}

export const BootstrapScreen: React.FC<Props> = ({ onComplete, addToast }) => {
  const [username, setUsername] = useState('admin');
  const [isLoading, setIsLoading] = useState(false);
  const [masterToken, setMasterToken] = useState<string | null>(null);

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    setIsLoading(true);
    try {
      soundService.playClick();
      const token = await authService.bootstrapMasterAdmin(username.trim());
      setMasterToken(token);
      addToast('success', 'Master Admin Created Successfully');
    } catch (err: any) {
      addToast('error', err.message || 'Bootstrap failed');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToken = () => {
    if (masterToken) {
      navigator.clipboard.writeText(masterToken);
      addToast('success', 'Token copied to clipboard');
      soundService.playClick();
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-full bg-black">
      <div className="w-full max-w-lg bg-zinc-900 border-2 border-gold-600 p-8 rounded-2xl shadow-[0_0_50px_rgba(255,215,0,0.1)] relative overflow-hidden">
        
        <div className="flex justify-center mb-8">
          <div className="p-5 bg-gold-900/20 rounded-full border border-gold-600/30">
            <Shield className="w-10 h-10 text-gold-500" />
          </div>
        </div>

        <h2 className="text-4xl font-serif text-center text-white mb-2 uppercase tracking-tighter">System Bootstrap</h2>
        <p className="text-zinc-500 text-center text-sm mb-10 px-4 uppercase tracking-widest font-bold">
          Initialize the primary master administrator account
        </p>

        {!masterToken ? (
          <form onSubmit={handleBootstrap} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-black text-gold-600 ml-1 tracking-[0.2em]">
                Master Admin Username
              </label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-black border border-zinc-800 focus:border-gold-500 text-white p-4 rounded-xl outline-none transition-all placeholder:text-zinc-800 font-roboto-bold text-lg"
                placeholder="e.g. master_admin"
                disabled={isLoading}
              />
            </div>

            <button 
              type="submit" 
              disabled={isLoading || !username}
              className="w-full mt-4 bg-gradient-to-r from-gold-600 to-gold-400 hover:brightness-110 text-black font-black py-4 rounded-xl shadow-xl flex items-center justify-center gap-3 transition-all disabled:opacity-50 uppercase tracking-[0.2em] text-sm"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Initialize Studio'}
            </button>
          </form>
        ) : (
          <div className="space-y-8 animate-in zoom-in duration-300">
            <div className="bg-black/50 border border-green-900/30 p-6 rounded-xl space-y-4">
              <div className="flex items-center gap-2 text-green-500 text-xs font-black uppercase tracking-widest">
                <Check className="w-4 h-4" /> Credentials Generated
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-zinc-600 uppercase font-black tracking-widest">Master Admin Access Token</p>
                <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-lg border border-zinc-800 group">
                  <code className="text-gold-500 font-mono text-xl break-all">{masterToken}</code>
                  <button 
                    onClick={copyToken}
                    className="ml-4 p-2 text-zinc-500 hover:text-gold-500 transition-colors bg-zinc-900 rounded-lg border border-zinc-800"
                    title="Copy to Clipboard"
                  >
                    <Copy className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="bg-red-950/20 border-l-4 border-red-500 p-4 rounded text-red-200 text-[10px] uppercase font-bold tracking-wider leading-relaxed">
                CRITICAL: Secure this token immediately. It will not be displayed again. This token provides absolute control over the studio.
              </div>
            </div>

            <button 
              onClick={onComplete}
              className="w-full bg-white text-black font-black py-4 rounded-xl shadow-xl flex items-center justify-center gap-3 transition-all uppercase tracking-[0.2em] text-sm hover:bg-zinc-200"
            >
              Proceed to Login
            </button>
          </div>
        )}

        <div className="mt-12 pt-6 border-t border-gold-900/10 text-center">
          <p className="text-zinc-700 text-[9px] font-mono uppercase tracking-[0.3em]">CruzPham Trivia Studios • Security Layer v4.0</p>
        </div>
      </div>
    </div>
  );
};