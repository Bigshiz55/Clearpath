import { NextResponse } from 'next/server';
import { z } from 'zod';
import { recordReliabilityEvent, RELIABILITY_EVENTS } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

/**
 * The one client-callable endpoint for reliability events that only exist
 * in the browser (a thrown render error, a 404 the client router hit, a
 * homepage→first-Verdict timing beacon). Server-side failures record
 * directly via recordReliabilityEvent — they never need a round trip
 * through this route.
 *
 * Always responds 204 regardless of outcome: a caller reporting a failure
 * should never itself become a new failure the caller has to handle.
 */
const propValue = z.union([z.string().max(80), z.number(), z.boolean(), z.null()]);
const bodySchema = z.object({
  name: z.enum(RELIABILITY_EVENTS),
  props: z.record(propValue).optional(),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.safeParse(await req.json());
    if (body.success) {
      void recordReliabilityEvent(body.data.name, body.data.props ?? {});
    }
  } catch {
    /* malformed beacon — nothing to record, nothing to fail on */
  }
  return new NextResponse(null, { status: 204 });
}
