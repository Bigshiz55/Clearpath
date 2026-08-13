import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian-950 disabled:pointer-events-none disabled:opacity-55';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brass-500 text-obsidian-950 shadow-brass hover:bg-brass-400 focus-visible:ring-brass-300',
  secondary:
    'border border-obsidian-600 bg-obsidian-850 text-ivory-100 hover:border-obsidian-500 hover:bg-obsidian-800 focus-visible:ring-brass-300',
  ghost: 'text-ivory-200 hover:bg-obsidian-800/70 hover:text-ivory-50 focus-visible:ring-brass-300',
  danger: 'bg-verdict-pass/90 text-obsidian-950 hover:bg-verdict-pass focus-visible:ring-verdict-pass',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-[38px] px-3.5 py-2 text-sm',
  md: 'min-h-[44px] px-5 py-2.5 text-sm',
  lg: 'min-h-[52px] px-6 py-3 text-base',
};

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/** The one button. Renders a Next `Link` when `href` is set, else a `<button>`. */
export function Button(props: ButtonProps) {
  const {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    className,
    children,
  } = props;
  const classes = cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className);

  if (props.href !== undefined) {
    const { href, variant: _v, size: _s, fullWidth: _f, className: _c, children: _ch, ...rest } =
      props;
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  const { variant: _v, size: _s, fullWidth: _f, className: _c, children: _ch, type, ...rest } =
    props;
  return (
    <button type={type ?? 'button'} className={classes} {...rest}>
      {children}
    </button>
  );
}
