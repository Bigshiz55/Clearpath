// Convenience: build a full Trial from a compact BookRef + Reader DNA. Pure, so
// it runs equally on the server or in the client trial page.

import { providerBookToWork } from '@/lib/providers/normalize';
import { refToProviderBook } from '@/lib/search/bookRef';
import type { BookRef } from '@/lib/store/types';
import type { ReaderDna } from '@/lib/domain/readerDna';
import { buildTrial } from './trial';
import type { Trial } from './types';

export function trialFromRef(ref: BookRef, dna: ReaderDna, now: string): Trial {
  const work = providerBookToWork(refToProviderBook(ref), now);
  return buildTrial({ work, dna, now });
}
