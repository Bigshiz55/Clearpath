import { cn } from '@/lib/utils/cn';

/** Centered content column with responsive gutters and a comfortable max width. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  );
}
