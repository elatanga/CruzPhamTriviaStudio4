import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Pause, Play, Trash2, Clock, Terminal, Filter, Download, AlertCircle } from 'lucide-react';
import { GameAnalyticsEvent, Player, Category } from '../types';
import { formatDirectorLogLine } from '../services/logFormatter';
import { useLiveAnalyticsEvents } from '../hooks/useLiveAnalyticsEvents';
import { soundService } from '../services/soundService';
import { logger } from '../services/logger';

interface Props {
  events: GameAnalyticsEvent[];
  players: Player[];
  categories: Category[];
}

export const DirectorLiveEventLog: React.FC<Props> = ({ events, players, categories }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [clearTs, setClearTs] = useState<number>(0);

  // Snapshot buffer for "Pause" mode
  const [frozenEvents, setFrozenEvents] = useState<GameAnalyticsEvent[] | null>(null);

  // Sampled logging state
  const lastLoggedCount = useRef(0);

  // De-duped and limited source
  const liveBuffer = useLiveAnalyticsEvents(events);

  // --- OBSERVABILITY LOGS ---

  useEffect(() => {
    logger.info('director_event_log_mount', { 
      ts: new Date().toISOString(), 
      initialCount: events?.length || 0 
    });
  }, []);

  useEffect(() => {
    if (!Array.isArray(events)) return;
    const total = events.length;
    // Sample every 5 events to avoid log flooding while maintaining visibility
    if (total > 0 && total !== lastLoggedCount.current && total % 5 === 0) {
      const latest = events[total - 1];
      logger.info('director_event_ingest', { 
        ts: new Date().toISOString(), 
        type: latest.type, 
        totalCount: total 
      });
      lastLoggedCount.current = total;
    }
  }, [events]);

  // Handle Pause logic
  useEffect(() => {
    if (isPaused && !frozenEvents) {
      setFrozenEvents([...liveBuffer]);
    } else if (!isPaused) {
      setFrozenEvents(null);
    }
  }, [isPaused, liveBuffer]);

  // Context for formatter
  const formatterCtx = useMemo(() => ({
    playersById: players?.reduce((acc, p) => ({ ...acc, [p.id]: p.name }), {}) || {},
    categoriesById: categories?.reduce((acc, c) => ({ ...acc, [c.id]: c.title }), {}) || {}
  }), [players, categories]);

  // Final Filtered Logs
  const displayLogs = useMemo(() => {
    const source = isPaused && frozenEvents ? frozenEvents : liveBuffer;
    
    return source
      .filter(e => e.ts > clearTs)
      .map(e => {
        try {
          return {
            ...e,
            ...formatDirectorLogLine(e, formatterCtx)
          };
        } catch (err: any) {
          // Graceful degradation: never crash the render tree
          logger.error('director_event_format_failed', { 
            ts: new Date().toISOString(), 
            type: e.type, 
            message: err.message 
          });
          return {
            ...e,
            tsIso: e.iso,
            tsLabel: new Date(e.ts).toLocaleTimeString([], { hour12: false }),
            sentence: `An event occurred: ${e.type.replace(/_/g, ' ')} (formatting details unavailable).`
          };
        }
      })
      .filter(l => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          l.sentence.toLowerCase().includes(q) ||
          l.type.toLowerCase().includes(q) ||
          (l.context?.playerName && l.context.playerName.toLowerCase().includes(q)) ||
          (l.context?.categoryName && l.context.categoryName.toLowerCase().includes(q))
        );
      });
  }, [liveBuffer, frozenEvents, isPaused, searchQuery, clearTs, formatterCtx]);

  // --- ACTIONS ---

  const handleDownload = () => {
    const count = displayLogs.length;
    logger.info('director_event_download_start', { ts: new Date().toISOString(), count });
    
    try {
      const content = displayLogs.map(l => `[${l.tsLabel}] ${l.sentence}`).join('\n');
      const blob = new Blob([`CRUZPHAM LIVE LOG EXPORT\nGenerated: ${new Date().toISOString()}\n\n${content}`], { type: 'text/plain' });
      const bytes = blob.size;
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cruzpham-live-log-${Date.now()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      logger.info('director_event_download_success', { ts: new Date().toISOString(), bytes });
    } catch (err: any) {
      logger.error('director_event_download_failed', { ts: new Date().toISOString(), message: err.message });
    }
  };

  const isStreamAvailable = Array.isArray(events);

  return (
    <div className="flex flex-col h-full bg-black border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* TOOLBAR */}
      <div className="flex-none p-3 bg-zinc-900/50 border-b border-zinc-800 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-2">
          <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-orange-500 animate-pulse' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1">
            <Terminal className="w-3 h-3" /> Live Feed
          </span>
        </div>

        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <input 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search roster, type, or action..."
            className="w-full bg-black border border-zinc-700 p-1.5 pl-8 rounded-lg text-xs text-gold-100 outline-none focus:border-gold-600 placeholder:text-zinc-800 font-bold transition-all"
          />
        </div>

        <div className="flex items-center gap-1">
          <button 
            onClick={() => { soundService.playClick(); setIsPaused(!isPaused); }}
            className={`p-2 rounded-lg border transition-all flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${isPaused ? 'bg-orange-600/20 border-orange-500/50 text-orange-500' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            <span className="hidden sm:inline">{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
          
          <button 
            onClick={handleDownload}
            disabled={displayLogs.length === 0}
            className="p-2 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-gold-500 rounded-lg transition-all disabled:opacity-30"
            title="Download Visible Log"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button 
            onClick={() => { soundService.playClick(); setClearTs(Date.now()); }}
            className="p-2 bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-red-500 hover:border-red-900/50 rounded-lg transition-all"
            title="Clear View"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* LOG LIST */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-black/40">
        {!isStreamAvailable ? (
          <div className="h-full flex flex-col items-center justify-center text-red-500 opacity-60">
            <AlertCircle className="w-10 h-10 mb-2 stroke-[1px]" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em]">Event stream unavailable</p>
          </div>
        ) : displayLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-800 opacity-50">
            <Filter className="w-10 h-10 mb-2 stroke-[1px]" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em]">No activity to report</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-900">
            {displayLogs.map((log) => (
              <div 
                key={log.id} 
                className="group flex items-start gap-4 p-3 hover:bg-white/[0.02] transition-colors border-l-2 border-transparent hover:border-gold-600"
              >
                <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                  <Clock className="w-3 h-3 text-zinc-700" />
                  <span className="text-[10px] font-mono text-zinc-600 tracking-tighter">[{log.tsLabel}]</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-zinc-200 leading-relaxed selection:bg-gold-500/30">
                    {log.sentence}
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-[8px] font-black uppercase text-zinc-700 tracking-widest">{log.type.replace(/_/g, ' ')}</span>
                    <span className="text-[8px] font-mono text-zinc-800 truncate opacity-0 group-hover:opacity-100 transition-opacity uppercase">
                      ID: {log.id.split('-')[0]} // ACTOR: {log.actor?.role || 'SYSTEM'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER METRICS */}
      <div className="flex-none px-3 py-1.5 bg-zinc-950 border-t border-zinc-900 flex justify-between items-center">
        <span className="text-[9px] font-mono text-zinc-700 uppercase tracking-widest">
          {isPaused ? 'Buffer Holding' : 'Streaming...'}
        </span>
        <span className="text-[9px] font-mono text-zinc-500">
          {displayLogs.length} OF {events?.length || 0} EVENTS VISIBLE
        </span>
      </div>
    </div>
  );
};