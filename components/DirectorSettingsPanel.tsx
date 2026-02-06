
import React from 'react';
import { Sliders, RotateCcw, Type, Layout, User } from 'lucide-react';
import { BoardViewSettings } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  settings: BoardViewSettings;
  onUpdateSettings: (updates: Partial<BoardViewSettings>) => void;
}

const SCALE_LEVELS = [0.7, 0.85, 1.0, 1.2, 1.5];
const SCALE_LABELS = ['XS', 'S', 'M', 'L', 'XL'];

export const DirectorSettingsPanel: React.FC<Props> = ({ settings, onUpdateSettings }) => {
  
  const handleScaleChange = (key: keyof BoardViewSettings, value: number) => {
    soundService.playClick();
    onUpdateSettings({ [key]: value });
  };

  const handleReset = () => {
    if (confirm('Reset all visual settings to studio defaults?')) {
      soundService.playClick();
      onUpdateSettings({
        categoryFontSizeScale: 1.0,
        tileFontSizeScale: 1.0,
        playerNameFontSizeScale: 1.0,
        scoreboardScale: 1.0,
        tilePaddingScale: 1.0,
        boardFontScale: 1.0,
        tileScale: 1.0
      });
    }
  };

  const ScaleGroup = ({ 
    label, 
    settingKey, 
    icon: Icon 
  }: { 
    label: string, 
    settingKey: keyof BoardViewSettings, 
    icon: any 
  }) => {
    const currentValue = settings[settingKey] as number;
    
    return (
      <div className="space-y-3 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/50">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-3.5 h-3.5 text-gold-500/50" />
          <label className="text-[10px] uppercase font-black text-zinc-400 tracking-[0.15em]">{label}</label>
        </div>
        <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-zinc-800">
          {SCALE_LEVELS.map((scale, idx) => (
            <button
              key={scale}
              onClick={() => handleScaleChange(settingKey, scale)}
              className={`flex-1 py-2 text-[10px] font-black rounded-md transition-all duration-200 ${
                currentValue === scale 
                  ? 'bg-gold-600 text-black shadow-lg scale-[1.02]' 
                  : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {SCALE_LABELS[idx]}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h3 className="text-gold-500 font-black uppercase tracking-[0.2em] text-sm flex items-center gap-3">
            <Sliders className="w-5 h-5" /> Visual Studio Calibration
          </h3>
          <p className="text-[10px] text-zinc-500 uppercase font-bold mt-1">Adjust board and scoreboard dimensions for your display</p>
        </div>
        <button 
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <h4 className="text-[9px] font-black text-gold-600 uppercase tracking-[0.25em] ml-1">Board Controls</h4>
          <ScaleGroup 
            label="Category Title Size" 
            settingKey="categoryFontSizeScale" 
            icon={Type} 
          />
          <ScaleGroup 
            label="Tile Point Size" 
            settingKey="tileFontSizeScale" 
            icon={Layout} 
          />
        </div>

        <div className="space-y-6">
          <h4 className="text-[9px] font-black text-gold-600 uppercase tracking-[0.25em] ml-1">Contestant Controls</h4>
          <ScaleGroup 
            label="Player Name Size" 
            settingKey="playerNameFontSizeScale" 
            icon={User} 
          />
          <div className="space-y-3 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/50">
            <div className="flex items-center gap-2 mb-1">
              <Layout className="w-3.5 h-3.5 text-gold-500/50" />
              <label className="text-[10px] uppercase font-black text-zinc-400 tracking-[0.15em]">Scoreboard Width</label>
            </div>
            <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-zinc-800">
              {[0.8, 1.0, 1.2, 1.4].map((scale, idx) => (
                <button
                  key={scale}
                  onClick={() => handleScaleChange('scoreboardScale', scale)}
                  className={`flex-1 py-2 text-[10px] font-black rounded-md transition-all duration-200 ${
                    settings.scoreboardScale === scale 
                      ? 'bg-gold-600 text-black shadow-lg scale-[1.02]' 
                      : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {['Slim', 'Normal', 'Wide', 'Ultra'][idx]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-12 p-6 bg-gold-900/5 border border-gold-900/20 rounded-2xl flex items-start gap-4">
        <div className="p-2 bg-gold-900/20 rounded-lg">
          <Sliders className="w-5 h-5 text-gold-500" />
        </div>
        <div>
          <h5 className="text-xs font-black text-gold-500 uppercase tracking-widest mb-1">Studio Note</h5>
          <p className="text-[10px] text-zinc-500 font-bold leading-relaxed">
            Changes applied here update the Trivia Board and Contestant Scoreboard in real-time. 
            Use <span className="text-white">Detach</span> mode to monitor these adjustments on a secondary production monitor.
          </p>
        </div>
      </div>
    </div>
  );
};
