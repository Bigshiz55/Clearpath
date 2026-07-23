// Tiny classname combiner — joins truthy class values with single spaces.
// Dependency-free; keeps component markup readable without pulling in clsx.

export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values
    .filter((v): v is string | number => v !== false && v != null && v !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
