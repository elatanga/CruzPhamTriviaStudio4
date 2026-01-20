import React, { useState } from 'react';
import { X, Check, Copy, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { authService } from '../services/authService';
import { TokenRequest } from '../types';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export const TokenRequestModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState<'FORM' | 'SUCCESS'>('FORM');
  const [loading, setLoading] = useState(false);
  const [reqId, setReqId] = useState('');
  
  // Form State
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    tiktok: '',
    username: '',
    phone: ''
  });

  const normalizePhone = (value: string) => {
    // Basic E.164 normalization logic for UI display
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    // If it starts with 1 (USA), add +, else just add + if user didn't
    if (!value.startsWith('+')) return `+${digits}`;
    return value;
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await authService.submitTokenRequest({
        firstName: formData.firstName,
        lastName: formData.lastName,
        tiktokHandle: formData.tiktok,
        preferredUsername: formData.username,
        phoneE164: normalizePhone(formData.phone)
      });
      setReqId(result.id);
      setStep('SUCCESS');
      onSuccess(); // Triggers parent toast
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-full max-w-2xl bg-zinc-900 border border-gold-600 rounded-lg shadow-2xl overflow-hidden flex flex-col md:flex-row h-[600px] md:h-auto">
        
        {/* Info Panel */}
        <div className="hidden md:flex w-1/3 bg-zinc-950 p-6 flex-col justify-between border-r border-gold-900/30">
          <div>
            <h3 className="text-gold-500 font-serif font-bold text-xl mb-4">CRUZPHAM STUDIOS</h3>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">
              Access is restricted to verified producers. Tokens are unique keys that unlock our generative production suite.
            </p>
            <div className="flex items-center gap-2 text-xs text-gold-600">
              <ShieldCheck className="w-4 h-4" />
              <span>Secure Architecture</span>
            </div>
          </div>
          <div className="text-[10px] text-zinc-600 font-mono">
            ID: AUTH-SYS-v2.4
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 md:p-8 relative overflow-y-auto">
          <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>

          {step === 'FORM' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="text-2xl font-serif text-white mb-1">Request Access Token</h2>
              <p className="text-sm text-zinc-400 mb-6">Complete the profile below. Admin verification required.</p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs uppercase text-gold-600 font-bold">First Name</label>
                  <input required type="text" className="w-full bg-black border border-zinc-700 p-2 text-white rounded focus:border-gold-500 outline-none" 
                    value={formData.firstName} onChange={e => handleChange('firstName', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs uppercase text-gold-600 font-bold">Last Name</label>
                  <input required type="text" className="w-full bg-black border border-zinc-700 p-2 text-white rounded focus:border-gold-500 outline-none"
                    value={formData.lastName} onChange={e => handleChange('lastName', e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase text-gold-600 font-bold">TikTok Handle</label>
                <div className="flex bg-black border border-zinc-700 rounded focus-within:border-gold-500">
                  <span className="p-2 text-zinc-500">@</span>
                  <input required type="text" className="w-full bg-transparent p-2 text-white outline-none" 
                     value={formData.tiktok} onChange={e => handleChange('tiktok', e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase text-gold-600 font-bold">Preferred Username</label>
                <input required type="text" className="w-full bg-black border border-zinc-700 p-2 text-white rounded focus:border-gold-500 outline-none" 
                   value={formData.username} onChange={e => handleChange('username', e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-xs uppercase text-gold-600 font-bold">Phone Number</label>
                <input required type="tel" placeholder="+12223334444" className="w-full bg-black border border-zinc-700 p-2 text-white rounded focus:border-gold-500 outline-none" 
                   value={formData.phone} onChange={e => handleChange('phone', e.target.value)} />
                <p className="text-[10px] text-zinc-500">Format: E.164 (e.g. +14155552671)</p>
              </div>

              <button type="submit" disabled={loading} className="w-full mt-6 bg-gold-600 hover:bg-gold-500 text-black font-bold py-3 rounded flex items-center justify-center gap-2 transition-all">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Send Request <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in zoom-in duration-300">
              <div className="w-16 h-16 rounded-full bg-green-900/30 flex items-center justify-center border border-green-500">
                <Check className="w-8 h-8 text-green-500" />
              </div>
              
              <div>
                <h2 className="text-2xl font-serif text-white mb-2">Request Received</h2>
                <p className="text-zinc-400 text-sm max-w-xs mx-auto">
                  Your profile has been logged. Payment is required to generate your secure token.
                </p>
              </div>

              <div className="bg-zinc-900 border border-dashed border-zinc-700 p-4 rounded w-full">
                <p className="text-xs text-zinc-500 uppercase mb-2">Request Reference ID</p>
                <div className="flex items-center justify-between bg-black p-2 rounded border border-zinc-800">
                  <code className="text-gold-400 font-mono text-lg">{reqId}</code>
                  <button onClick={() => navigator.clipboard.writeText(reqId)} className="text-zinc-500 hover:text-white">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="bg-blue-900/20 border-l-2 border-blue-500 p-3 text-left w-full">
                <h4 className="text-blue-200 text-sm font-bold mb-1">What happens next?</h4>
                <p className="text-blue-300/80 text-xs">An administrator will contact you at {formData.phone} or via TikTok regarding payment and account activation.</p>
              </div>

              <button onClick={onClose} className="text-zinc-400 hover:text-white text-sm underline">
                Return to Login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};