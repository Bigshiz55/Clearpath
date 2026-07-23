import { cn } from '@/lib/utils/cn';

const pad: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6 sm:p-7',
};

/** Surface container. `interactive` adds hover affordance for clickable cards. */
export function Card({
  as: Tag = 'div',
  padding = 'md',
  interactive = false,
  className,
  children,
}: {
  as?: 'div' | 'section' | 'article';
  padding?: keyof typeof pad;
  interactive?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-obsidian-700/70 bg-obsidian-900/70 shadow-card backdrop-blur',
        pad[padding],
        interactive && 'transition hover:border-brass-500/40 hover:bg-obsidian-900',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
