import React, { useMemo, useState, useEffect, useRef } from 'react';
import { 
  BarChart3, Hash, Trophy, AlertCircle, 
  Search, Pause, Play, Trash2, 
  Download, Activity, Terminal, Clock
} from 'lucide-react';
import { GameState, GameAnalyticsEvent } from '../types';
import { logger } from '../services/logger';
import { soundService } from '../services/soundService';
import { formatDirectorLogLine } from '../services/logFormatter';
import { useLiveAnalyticsEvents } from '../hooks/useLiveAnalyticsEvents';

interface Props {
  gameState: GameState;
  addToast: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export const DirectorAnalytics: React.FC<Props> = ({ gameState, addToast }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [clearTimestamp, setClearTimestamp] = useState<number>(0);
  const [frozenEvents, setFrozenEvents] = useState<GameAnalyticsEvent[] | null>(null);

  // Sampling State
  const lastLoggedCount = useRef(0);

  // Buffer logic for real-time de-duped stream
  const liveBuffer = useLiveAnalyticsEvents(gameState.events);

  // --- INTERNAL TELEMETRY: Ingestion Health ---
  useEffect(() => {
    const totalCount = gameState.events?.length || 0;
    // Sampling strategy: 1 per 25 events to monitor pipeline health without flooding
    if (totalCount > 0 && totalCount !== lastLoggedCount.current && totalCount % 25 === 0) {
      const latest = gameState.events[totalCount - 1];
      logger.info('analytics_ingest_event', {
        ts: new Date().toISOString(),
        type: latest.type,
        source: latest.actor?.role === 'director' ? 'director' : 'board',
        totalCount
      });
      lastLoggedCount.current = totalCount;
    }
  }, [gameState.events]);

  // Handle Pause logic
  useEffect(() => {
    if (isPaused && !frozenEvents) {
      setFrozenEvents([...liveBuffer]);
    } else if (!isPaused) {
      setFrozenEvents(null);
    }
  }, [isPaused, liveBuffer]);

  // Build mapping context for the formatter (Single Source of Truth)
  const formatterCtx = useMemo(() => ({
    playersById: gameState.players?.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {}) || {},
    categoriesById: gameState.categories?.reduce((acc, c) => ({ ...acc, [c.id]: c.title }), {}) || {}
  }), [gameState.players, gameState.categories]);

  // Process logs for display and filtering
  const processedLogs = useMemo(() => {
    const source = isPaused && frozenEvents ? frozenEvents : liveBuffer;
    
    return source
      .filter(e => e.ts > clearTimestamp)
      .map(e => {
        const formatted = formatDirectorLogLine(e, formatterCtx);
        return {
          ...e,
          ...formatted,
          maskedContext: logger.maskPII(e.context)
        };
      })
      .filter(l => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return l.sentence.toLowerCase().includes(q) || l.type.toLowerCase().includes(q);
      });
  }, [liveBuffer, frozenEvents, isPaused, searchQuery, clearTimestamp, formatterCtx]);

  // --- ACTIONS ---

  const handleDownloadLog = () => {
    soundService.playClick();
    const showSlug = (gameState.showTitle || 'untitled').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const filename = `cruzpham-analytics_${showSlug}_${Date.now()}.jsonl`;
    const exportSource = isPaused && frozenEvents ? frozenEvents : liveBuffer;
    const count = exportSource.length;

    // Start Telemetry
    logger.info('analytics_export_start', { 
      ts: new Date().toISOString(), 
      count 
    });

    try {
      // Export full history regardless of search filter, but respecting the "Clear" timestamp
      const lines = exportSource
        .filter(e => e.ts > clearTimestamp)
        .map(e => {
          const formatted = formatDirectorLogLine(e, formatterCtx);
          return JSON.stringify({
            tsIso: e.iso,
            sentence: formatted.sentence,
            type: e.type,
            context: logger.maskPII(e.context)
          });
        });

      const blob = new Blob([lines.join('\n')], { type: 'application/x-jsonlines' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Success Telemetry
      logger.info('analytics_export_success', { 
        ts: new Date().toISOString(), 
        bytes: blob.size 
      });
      addToast('success', 'Full history exported as JSONL');
    } catch (err: any) {
      // Failure Telemetry
      logger.error('analytics_export_failed', { 
        ts: new Date().toISOString(), 
        message: err.message 
      });
      addToast('error', 'Export failed');
    }
  };

  const stats = useMemo(() => {
    const cats = gameState.categories || [];
    let total = 0, answered = 0, voided = 0;
    cats.forEach(c => {
      total += c.questions.length;
      c.questions.forEach(q => {
        if (q.isAnswered) answered++;
        if (q.isVoided) voided++;
      });
    });
    return { total, answered, voided, remaining: total - answered - voided };
  }, [gameState]);

  const StatCard = ({ icon: Icon, label, value, colorClass }: any) => (
    <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-2xl flex flex-col gap-1 shadow-lg">
      <div className="flex items-center gap-2 text-zinc-500 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[9px] font-black uppercase tracking-[0.15em]">{label}</span>
      </div>
      <div className={`text-2xl font-mono font-black ${colorClass || 'text-white'}`}>{value}</div>
    </div>
  );

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Hash} label="Total Tiles" value={stats.total} />
        <StatCard icon={Trophy} label="Played" value={stats.answered} colorClass="text-green-500" />
        <StatCard icon={AlertCircle} label="Remaining" value={stats.remaining} colorClass="text-zinc-400" />
        <StatCard icon={Activity} label="Events" value={processedLogs.length} colorClass="text-gold-500" />
      </div>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row gap-3 bg-zinc-900/80 border border-zinc-800 p-3 rounded-2xl shadow-xl">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search live feed..."
            className="w-full bg-black/40 border border-zinc-700 p-2 pl-9 rounded-xl text-xs text-gold-100 outline-none focus:border-gold-500 font-bold placeholder:text-zinc-800"
          />
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsPaused(!isPaused)}
            className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${isPaused ? 'bg-orange-600/20 border-orange-500 text-orange-500' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          
          <button 
            onClick={handleDownloadLog}
            className="px-4 py-2 bg-gold-600 hover:bg-gold-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-gold-900/10 transition-all active:scale-95"
            title="Download full history as JSONL"
          >
            <Download className="w-3.5 h-3.5" />
            Download Logs
          </button>

          <button 
            onClick={() => { soundService.playClick(); setClearTimestamp(Date.now()); }}
            className="p-2.5 bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-red-500 hover:border-red-900/50 rounded-xl transition-all"
            title="Clear view"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Event Stream Container */}
      <div className="flex-1 min-h-0 bg-black border border-zinc-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
        <div className="flex-none p-3 bg-zinc-900/50 border-b border-zinc-800 flex items-center gap-2">
          <Terminal className="w-4 h-4 text-zinc-600" />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Live Production Audit</span>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/20">
          {processedLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-30 text-zinc-500">
              <Activity className="w-12 h-12 mb-2 stroke-[1px]" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em]">No activity to report</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {processedLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-white/[0.02] transition-colors border-l-2 border-transparent hover:border-gold-600 group">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      <Clock className="w-3 h-3 text-zinc-700" />
                      <span className="text-[10px] font-mono text-zinc-600 tracking-tighter">[{log.tsLabel}]</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-200 leading-relaxed selection:bg-gold-500/30">
                        {log.sentence}
                      </p>
                      <div className="mt-1 flex items-center gap-3">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                          log.type.includes('POINTS') ? 'bg-green-950 text-green-500' :
                          log.type.includes('AI') ? 'bg-blue-950 text-blue-400' :
                          'bg-zinc-900 text-zinc-600'
                        }`}>
                          {log.type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[8px] font-mono text-zinc-800 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          ID: {log.id.split('-')[0]} // ACTOR: {log.actor?.role}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-none px-4 py-2 bg-zinc-950 border-t border-zinc-900 flex justify-between items-center">
          <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">
            {isPaused ? 'Buffer Snapshot' : 'Streaming Real-time'}
          </span>
          <span className="text-[9px] font-mono text-zinc-500">
            {processedLogs.length} OF {gameState.events?.length || 0} EVENTS VISIBLE
          </span>
        </div>
      </div>
    </div>
  );
};