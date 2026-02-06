
import React from 'react';
import { Sliders, RotateCcw, Type, Layout, User } from 'lucide-react';
import { BoardViewSettings, SizeScale } from '../types';
import { soundService } from '../services/soundService';

interface Props {
  settings: BoardViewSettings;
  onUpdateSettings: (updates: Partial<BoardViewSettings>) => void;
}

const SCALE_LABELS: SizeScale[] = ['XS', 'S', 'M', 'L', 'XL'];

export const DirectorSettingsPanel: React.FC<Props> = ({ settings, onUpdateSettings }) => {
  
  const handleScaleChange = (key: keyof BoardViewSettings, value: string | number) => {
    soundService.playClick();
    onUpdateSettings({ [key]: value });
  };

  const handleReset = () => {
    if (confirm('Reset all studio visual settings to production defaults?')) {
      soundService.playClick();
      onUpdateSettings({
        categoryTitleScale: 'M',
        tileScale: 'M',
        playerNameScale: 'M',
        scoreboardScale: 1.0,
        tilePaddingScale: 1.0
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
    const currentValue = settings[settingKey];
    
    return (
      <div className="space-y-3 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/50">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-3.5 h-3.5 text-gold-500/50" />
          <label className="text-[10px] uppercase font-black text-zinc-400 tracking-[0.15em]">{label}</label>
        </div>
        <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-zinc-800">
          {SCALE_LABELS.map((scale) => (
            <button
              key={scale}
              onClick={() => handleScaleChange(settingKey, scale)}
              className={`flex-1 py-2 text-[10px] font-black rounded-md transition-all duration-200 ${
                currentValue === scale 
                  ? 'bg-gold-600 text-black shadow-lg scale-[1.02]' 
                  : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {scale}
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
            <Sliders className="w-5 h-5" /> Studio Visual Configuration
          </h3>
          <p className="text-[10px] text-zinc-500 uppercase font-bold mt-1">Independent scaling for Board and Scoreboard elements</p>
        </div>
        <button 
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Defaults
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <h4 className="text-[9px] font-black text-gold-600 uppercase tracking-[0.25em] ml-1">Trivia Board</h4>
          <ScaleGroup 
            label="Category Title Size" 
            settingKey="categoryTitleScale" 
            icon={Type} 
          />
          <ScaleGroup 
            label="Tile Dimensions" 
            settingKey="tileScale" 
            icon={Layout} 
          />
          <div className="space-y-3 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/50">
            <label className="text-[10px] uppercase font-black text-zinc-400 tracking-[0.15em] block">Tile Grid Density</label>
            <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-zinc-800">
              {[0.5, 0.75, 1.0, 1.25, 1.5].map((scale) => (
                <button
                  key={scale}
                  onClick={() => handleScaleChange('tilePaddingScale', scale)}
                  className={`flex-1 py-2 text-[9px] font-black rounded-md transition-all ${
                    settings.tilePaddingScale === scale ? 'bg-gold-600 text-black' : 'text-zinc-600'
                  }`}
                >
                  {Math.round(scale * 100)}%
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h4 className="text-[9px] font-black text-gold-600 uppercase tracking-[0.25em] ml-1">Scoreboard</h4>
          <ScaleGroup 
            label="Player Name Size" 
            settingKey="playerNameScale" 
            icon={User} 
          />
          <div className="space-y-3 bg-zinc-900/40 p-4 rounded-xl border border-zinc-800/50">
            <label className="text-[10px] uppercase font-black text-zinc-400 tracking-[0.15em] block">Panel Width</label>
            <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-zinc-800">
              {[0.8, 1.0, 1.2, 1.4].map((scale) => (
                <button
                  key={scale}
                  onClick={() => handleScaleChange('scoreboardScale', scale)}
                  className={`flex-1 py-2 text-[9px] font-black rounded-md transition-all ${
                    settings.scoreboardScale === scale ? 'bg-gold-600 text-black' : 'text-zinc-600'
                  }`}
                >
                  {['Slim', 'Normal', 'Wide', 'Ultra'][Math.floor((scale-0.8)/0.2 + 0.1)]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
