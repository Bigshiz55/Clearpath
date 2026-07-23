// Single source of truth for primary navigation. Desktop and mobile expose
// different subsets/orders per the product spec, but both reference these
// canonical destinations.

export type NavIcon =
  | 'home'
  | 'ask'
  | 'discover'
  | 'books'
  | 'together'
  | 'profile'
  | 'dna';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

/** Desktop top navigation: Ask · Discover · My Books · Read Together · Profile. */
export const DESKTOP_NAV: readonly NavItem[] = [
  { href: '/ask', label: 'Ask', icon: 'ask' },
  { href: '/discover', label: 'Discover', icon: 'discover' },
  { href: '/my-books', label: 'My Books', icon: 'books' },
  { href: '/together', label: 'Read Together', icon: 'together' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
] as const;

/** Mobile bottom navigation: Home · Ask · My Books · Together · Profile. */
export const MOBILE_NAV: readonly NavItem[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/ask', label: 'Ask', icon: 'ask' },
  { href: '/my-books', label: 'My Books', icon: 'books' },
  { href: '/together', label: 'Together', icon: 'together' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
] as const;

/** Secondary destinations surfaced from Profile / elsewhere. */
export const SECONDARY_NAV: readonly NavItem[] = [
  { href: '/reader-dna', label: 'Reader DNA', icon: 'dna' },
] as const;
