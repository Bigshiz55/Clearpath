/**
 * MODE SELECTION HAPPENS BEFORE ROOM CREATION — the owner-stated hierarchy.
 *
 * The defect: a generic "Start a Verdict Room" button sat ABOVE Quick Pick /
 * Invite the Jury, so a live room was created before anyone said what kind
 * of verdict this was. These pins hold the replacement: the question leads,
 * the two modes are the only doors, and creation is reachable through
 * exactly one of them — so a room can never be mislabeled, because a room
 * only ever exists as a Jury Room.
 *
 * Source-level because /app/together sits behind auth; the browser-level
 * assertions live in tests/mobile/verdict-room-entrance.spec.ts against the
 * dev harness.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const entrance = read('src/components/court/VerdictRoomEntrance.tsx');

describe('the question leads, the generic door is gone', () => {
  it('asks what kind of verdict before offering any creation', () => {
    expect(entrance).toContain('What kind of verdict are you running?');
    expect(entrance).toContain('verdict-mode-question');
  });

  it('no pre-mode create control survives anywhere', () => {
    expect(entrance).not.toContain('data-testid="start-court"');
    expect(entrance).not.toContain('Start a Verdict Room');
    // The two orphaned components that carried the old pattern are deleted,
    // not merely unreferenced — dead code with the removed UX is how a
    // second generic door grows back.
    expect(existsSync(join(ROOT, 'src/components/StartLiveCourt.tsx'))).toBe(false);
    expect(existsSync(join(ROOT, 'src/components/court/CourtSecondaryActions.tsx'))).toBe(false);
  });
});

describe('two modes, each saying exactly what it starts', () => {
  it('Quick Pick and Jury Room carry their explicit start actions', () => {
    expect(entrance).toContain('title="Quick Pick"');
    expect(entrance).toContain('action="Start Quick Pick"');
    expect(entrance).toContain('title="Jury Room"');
    expect(entrance).toContain('action="Start Jury Room"');
  });

  it('creation is reachable through the Jury Room card ALONE', () => {
    // Exactly one `start()` call site in the whole entrance.
    expect(entrance.match(/void start\(\)/g)).toHaveLength(1);
    // And it belongs to the Jury Room card, not Quick Pick: the Quick Pick
    // card's onClick only toggles the disclosure panel.
    const quickPick = entrance.slice(entrance.indexOf('testId="open-device"'), entrance.indexOf('testId="open-invite"'));
    expect(quickPick).not.toContain('start()');
    expect(quickPick).toContain("setOpen(open === 'device'");
  });

  it('Jury Room names the invitation/share flow; Quick Pick never does', () => {
    const quickPick = entrance.slice(entrance.indexOf('testId="open-device"'), entrance.indexOf('testId="open-invite"'));
    const jury = entrance.slice(entrance.indexOf('testId="open-invite"'), entrance.indexOf('</ModeCard>') > 0 ? entrance.indexOf('</ModeCard>') : entrance.indexOf('busy={loading}') + 60);
    expect(jury).toContain('code to share');
    expect(quickPick).not.toContain('code');
    expect(quickPick).not.toContain('share');
  });
});

describe('existing room deep links still work', () => {
  it('the /court/[code] route is untouched by this redesign', () => {
    expect(existsSync(join(ROOT, 'src/app/court/[code]/page.tsx'))).toBe(true);
  });
});
