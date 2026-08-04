'use client';

import { useEffect } from 'react';
import { markHomepageArrival } from '@/lib/verdictTiming';

/** Invisible — stamps homepage-arrival time for the time-to-first-Verdict metric. */
export function HomeArrivalBeacon() {
  useEffect(() => {
    markHomepageArrival();
  }, []);
  return null;
}
