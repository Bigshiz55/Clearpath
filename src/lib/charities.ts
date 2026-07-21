/**
 * The causes a member can direct their WatchVerdict Pro pledge to. This is a
 * curated shortlist of well-known US 501(c)(3)s spanning distinct causes.
 *
 * NOTE before launch: confirm each partner, sign the required charitable-
 * sales-promotion / commercial-co-venturer agreements, and verify the exact
 * legal names. The pledge is company-funded (WatchVerdict is the donor of
 * record); members direct the destination and receive an impact confirmation,
 * not a tax receipt.
 */
export interface Charity {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
}

export const CHARITIES: Charity[] = [
  { id: 'stjude', name: "St. Jude Children's Research Hospital", emoji: '🏥', blurb: 'Childhood cancer & disease research — families never get a bill.' },
  { id: 'bcrf', name: 'Breast Cancer Research Foundation', emoji: '🎗️', blurb: 'Funds the most promising breast cancer research worldwide.' },
  { id: 'feeding', name: 'Feeding America', emoji: '🍽️', blurb: 'The largest US hunger-relief network of food banks.' },
  { id: 'redcross', name: 'American Red Cross', emoji: '🚑', blurb: 'Disaster relief, blood supply and emergency response.' },
  { id: 'trevor', name: 'The Trevor Project', emoji: '🌈', blurb: 'Crisis support and suicide prevention for LGBTQ+ youth.' },
  { id: 'msf', name: 'Doctors Without Borders', emoji: '⚕️', blurb: 'Emergency medical care in crises around the world.' },
  { id: 'wwp', name: 'Wounded Warrior Project', emoji: '🎖️', blurb: 'Support and care for injured veterans and their families.' },
  { id: 'wwf', name: 'World Wildlife Fund', emoji: '🐼', blurb: 'Protecting wildlife and the places they need to survive.' },
  { id: 'water', name: 'charity: water', emoji: '💧', blurb: 'Clean and safe drinking water for people in need.' },
];

export const DEFAULT_CHARITY_ID = 'bcrf';

const BY_ID = new Map(CHARITIES.map((c) => [c.id, c]));

export function charityById(id: string | null | undefined): Charity | null {
  return id ? BY_ID.get(id) ?? null : null;
}

export function isCharityId(id: string): boolean {
  return BY_ID.has(id);
}
