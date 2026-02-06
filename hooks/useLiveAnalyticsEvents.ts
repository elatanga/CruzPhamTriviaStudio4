import { useMemo } from 'react';
import { GameAnalyticsEvent } from '../types';

/**
 * useLiveAnalyticsEvents
 * Thin adapter to the existing event pipeline. 
 * Ensures de-duplication by event ID and limits UI load for performance.
 */
export function useLiveAnalyticsEvents(events: GameAnalyticsEvent[] | undefined, limit: number = 200) {
  return useMemo(() => {
    if (!events || !Array.isArray(events)) return [];

    const seenIds = new Set<string>();
    const uniqueEvents: GameAnalyticsEvent[] = [];

    // Iterate backwards (newest first) and de-dupe
    for (let i = events.length - 1; i >= 0; i--) {
      const evt = events[i];
      if (!seenIds.has(evt.id)) {
        seenIds.add(evt.id);
        uniqueEvents.push(evt);
      }
      if (uniqueEvents.length >= limit) break;
    }

    return uniqueEvents;
  }, [events, limit]);
}