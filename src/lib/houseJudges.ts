// The "house judges" — your own dogs who preside when no local vendor is chosen.
// Client-safe config + the localStorage key the picker persists to.

export type HousePick = 'annie' | 'waffles' | 'vendor';

export interface HouseJudge {
  key: 'annie' | 'waffles';
  name: string;
  src: string;
}

export const HOUSE_JUDGES: HouseJudge[] = [
  { key: 'annie', name: 'Judge Annie', src: '/judge-annie.png' },
  { key: 'waffles', name: 'Judge Waffles', src: '/judge-waffles.png' },
];

export const HOUSE_KEY = 'wv_house_judge';

export function readHousePick(): HousePick {
  if (typeof window === 'undefined') return 'annie';
  const v = window.localStorage.getItem(HOUSE_KEY);
  return v === 'waffles' || v === 'vendor' ? v : 'annie';
}

export function houseByKey(key: 'annie' | 'waffles'): HouseJudge {
  return HOUSE_JUDGES.find((h) => h.key === key) ?? HOUSE_JUDGES[0]!;
}
