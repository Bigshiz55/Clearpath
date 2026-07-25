/**
 * INTERACTION MANIFEST (pure data). Every primary visible control of the core
 * product surfaces, with its expected effect and the automated coverage that
 * proves it. The companion test (`interactionManifest.test.ts`) is the CI
 * gate: it fails when a control has no coverage entry, when a referenced test
 * file doesn't exist, or when the referenced file no longer mentions the
 * control's needle — so a control can't silently lose its test.
 */

export type ControlType = 'button' | 'textarea' | 'input' | 'slider' | 'toggle' | 'segment' | 'chip' | 'link';

export interface CoverageRef {
  /** Repo-relative test file that exercises this control. */
  file: string;
  /** A string that must literally appear in that file (testid, label, function). */
  needle: string;
  kind: 'unit' | 'e2e' | 'visual';
}

export interface ControlEntry {
  controlId: string;
  route: string;
  label: string;
  controlType: ControlType;
  expectedEffect: string;
  coveredBy: CoverageRef[];
}

const FINDER = '/app/finder';
const NEW = '/app/new';
const CONTROLS_E2E = 'tests/mobile/controls.spec.ts';
const REFINE_UNIT = 'src/lib/refineState.test.ts';
const HOME_E2E = 'tests/mobile/home.spec.ts';
const VISUAL_E2E = 'tests/mobile/visual-qa.spec.ts';
const QUIZ_E2E = 'tests/mobile/dna-quiz.spec.ts';

export const INTERACTION_MANIFEST: ControlEntry[] = [
  // ---- Finder (search + refinement) ----
  { controlId: 'finder.ask', route: FINDER, label: 'Plain-English ask', controlType: 'textarea',
    expectedEffect: 'Parses live into the structured query; Enter submits',
    coveredBy: [{ file: CONTROLS_E2E, needle: 'Family movie night', kind: 'e2e' }] },
  { controlId: 'finder.submit', route: FINDER, label: 'Submit evidence / Update results', controlType: 'button',
    expectedEffect: 'Issues /api/finder with the effective constraints; label flips to Update results once results exist',
    coveredBy: [{ file: CONTROLS_E2E, needle: 'Update results', kind: 'e2e' }] },
  { controlId: 'finder.slider.runtime', route: FINDER, label: 'Max length', controlType: 'slider',
    expectedEffect: 'Sets maxRuntime; far right is a true neutral (null) — no hidden default cap',
    coveredBy: [
      { file: REFINE_UNIT, needle: 'maxRuntime', kind: 'unit' },
      { file: CONTROLS_E2E, needle: 'maxRuntime', kind: 'e2e' },
    ] },
  { controlId: 'finder.slider.audience', route: FINDER, label: 'Popcorn meter (audience)', controlType: 'slider',
    expectedEffect: 'Sets minAudience; 0 = Any (null in the canonical key)',
    coveredBy: [{ file: REFINE_UNIT, needle: 'minAudience', kind: 'unit' }] },
  { controlId: 'finder.slider.imdb', route: FINDER, label: 'IMDb rating', controlType: 'slider',
    expectedEffect: 'Sets minImdb; changing it after a search flags results stale until Update results',
    coveredBy: [
      { file: REFINE_UNIT, needle: 'minImdb', kind: 'unit' },
      { file: CONTROLS_E2E, needle: 'minImdb', kind: 'e2e' },
    ] },
  { controlId: 'finder.slider.match', route: FINDER, label: 'Your Match at least', controlType: 'slider',
    expectedEffect: 'Sets minMatch; 0 = Any',
    coveredBy: [{ file: REFINE_UNIT, needle: 'minMatch', kind: 'unit' }] },
  { controlId: 'finder.toggle.englishAudio', route: FINDER, label: 'English audio only', controlType: 'toggle',
    expectedEffect: 'OFF by default; only explicit asks or the toggle enable it',
    coveredBy: [
      { file: REFINE_UNIT, needle: 'englishAudioOnly', kind: 'unit' },
      { file: CONTROLS_E2E, needle: 'englishAudioOnly', kind: 'e2e' },
    ] },
  { controlId: 'finder.banner.stale', route: FINDER, label: 'Filters changed banner', controlType: 'button',
    expectedEffect: 'Appears when the canonical key of the controls diverges from the fetched key; its button re-runs the search',
    coveredBy: [{ file: CONTROLS_E2E, needle: 'filters-changed', kind: 'e2e' }] },
  { controlId: 'finder.chips.active', route: FINDER, label: 'Active filter chips', controlType: 'chip',
    expectedEffect: 'Every non-neutral constraint is visible while results show',
    coveredBy: [
      { file: REFINE_UNIT, needle: 'activeFilterChips', kind: 'unit' },
      { file: CONTROLS_E2E, needle: 'active-filters', kind: 'e2e' },
    ] },

  // ---- New Releases wall ----
  { controlId: 'releases.seg.mediaType', route: NEW, label: 'All / Movies / Shows', controlType: 'segment',
    expectedEffect: 'Sets mediaType in the /api/releases request and refetches',
    coveredBy: [{ file: CONTROLS_E2E, needle: "name: 'Shows'", kind: 'e2e' }] },
  { controlId: 'releases.seg.window', route: NEW, label: 'Out now / Upcoming', controlType: 'segment',
    expectedEffect: 'Sets window in the request and refetches',
    coveredBy: [{ file: CONTROLS_E2E, needle: "name: 'Upcoming'", kind: 'e2e' }] },
  { controlId: 'releases.seg.sort', route: NEW, label: 'Popular / Newest·Soonest / Top rated', controlType: 'segment',
    expectedEffect: 'Sets sort (new → first_air/release date asc for upcoming) and refetches',
    coveredBy: [{ file: CONTROLS_E2E, needle: "name: 'Soonest'", kind: 'e2e' }] },
  { controlId: 'releases.chip.provider', route: NEW, label: 'Platform chips (Netflix…)', controlType: 'chip',
    expectedEffect: 'Toggles providerIds in the request; upcoming+provider yields the truthful unsupported diagnostic',
    coveredBy: [
      { file: CONTROLS_E2E, needle: 'unsupported_upcoming_provider', kind: 'e2e' },
      { file: 'src/lib/releasesDiagnostics.test.ts', needle: 'unsupported_upcoming_provider', kind: 'unit' },
    ] },
  { controlId: 'releases.empty.recovery', route: NEW, label: 'Empty-state recovery actions', controlType: 'button',
    expectedEffect: 'Applies a real state patch (clear provider / switch window) and refetches',
    coveredBy: [
      { file: CONTROLS_E2E, needle: 'general upcoming', kind: 'e2e' },
      { file: 'src/lib/releasesDiagnostics.test.ts', needle: 'patch', kind: 'unit' },
    ] },

  // ---- Cards (every applicable card) ----
  { controlId: 'card.for', route: '(all card surfaces)', label: 'FOR', controlType: 'button',
    expectedEffect: 'Positive taste signal; first in the FOR → PASS → SAVE row',
    coveredBy: [{ file: CONTROLS_E2E, needle: 'missing FOR', kind: 'e2e' }] },
  { controlId: 'card.pass', route: '(all card surfaces)', label: 'PASS', controlType: 'button',
    expectedEffect: 'Negative taste signal; second in the row',
    coveredBy: [{ file: CONTROLS_E2E, needle: 'missing PASS', kind: 'e2e' }] },
  { controlId: 'card.save', route: '(all card surfaces)', label: 'SAVE', controlType: 'button',
    expectedEffect: 'Adds to the watchlist; third in the row, never escaping the card border',
    coveredBy: [{ file: CONTROLS_E2E, needle: 'missing SAVE', kind: 'e2e' }] },

  // ---- Home / global chrome ----
  { controlId: 'home.search', route: '/app', label: 'Universal search bar', controlType: 'input',
    expectedEffect: 'Stale-guarded suggestions; voice input where supported',
    coveredBy: [{ file: HOME_E2E, needle: 'textarea', kind: 'e2e' }] },
  { controlId: 'chrome.buildBadge', route: '(every screen)', label: 'Build version badge', controlType: 'button',
    expectedEffect: 'Always visible, never overlaps content; opens the Build Info sheet',
    coveredBy: [{ file: VISUAL_E2E, needle: 'build-badge', kind: 'visual' }] },
  { controlId: 'quiz.rate', route: '/app/dna', label: 'DNA quiz Seen it / rating steps', controlType: 'button',
    expectedEffect: 'Two-step flow feeds the preference engine; poster can never overlap the buttons',
    coveredBy: [{ file: QUIZ_E2E, needle: 'quiz', kind: 'e2e' }] },
];
