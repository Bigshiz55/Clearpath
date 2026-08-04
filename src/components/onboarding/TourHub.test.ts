/**
 * THE GAVEL TOPIC HAS TO SHOW THE BADGE, NOT JUST DESCRIBE IT.
 *
 * `/app/tour` sits behind auth (redirects to /login with no session), so a
 * browser test asserting "the gavel topic shows the docket demo" would pass
 * against a login screen and prove nothing — same reasoning as
 * quizReachable.test.ts. Source-level instead: the gavel topic's body text
 * explicitly describes "a pink gavel badge" appearing on a poster, so its
 * detail view has to actually render that badge (DocketDemoIcon — the same
 * component already used for the card-controls topic and the homepage),
 * not leave a first-time reader to imagine it from a sentence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

describe('TourHub gavel/docket demo', () => {
  it('imports and renders DocketDemoIcon for the gavel topic', () => {
    const src = read('src/components/onboarding/TourHub.tsx');
    expect(src).toContain("import { DocketDemoIcon } from '@/components/landing/DocketDemoIcon'");
    const at = src.indexOf("topic.id === 'gavel'");
    expect(at, 'TourHub.tsx has no gavel-specific branch').toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf(')}', at));
    expect(block).toContain('<DocketDemoIcon');
  });
});
