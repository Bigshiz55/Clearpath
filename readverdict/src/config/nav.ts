// Single source of truth for primary navigation. The product is trial-centric:
// search a book → put it on trial → get the verdict.

export type NavIcon =
  | 'home'
  | 'search'
  | 'courtroom'
  | 'books'
  | 'dna'
  | 'profile';

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

/** Desktop top navigation. */
export const DESKTOP_NAV: readonly NavItem[] = [
  { href: '/search', label: 'Search', icon: 'search' },
  { href: '/courtroom', label: 'Courtroom', icon: 'courtroom' },
  { href: '/my-books', label: 'My Books', icon: 'books' },
  { href: '/reader-dna', label: 'Reader DNA', icon: 'dna' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
] as const;

/** Mobile bottom navigation. */
export const MOBILE_NAV: readonly NavItem[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/search', label: 'Search', icon: 'search' },
  { href: '/courtroom', label: 'Courtroom', icon: 'courtroom' },
  { href: '/my-books', label: 'My Books', icon: 'books' },
  { href: '/profile', label: 'Profile', icon: 'profile' },
] as const;

export const SECONDARY_NAV: readonly NavItem[] = [
  { href: '/reader-dna', label: 'Reader DNA', icon: 'dna' },
] as const;
