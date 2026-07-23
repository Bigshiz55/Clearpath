import { useId } from 'react';
import { cn } from '@/lib/utils/cn';

const control =
  'w-full rounded-xl border border-obsidian-600 bg-obsidian-850 px-4 py-2.5 text-ivory-100 placeholder:text-ivory-400 transition focus:border-brass-500 focus:outline-none focus:ring-2 focus:ring-brass-500/30 disabled:opacity-60';

/** Labelled form field wrapper wiring label/hint/error to the control via ids. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  const hintId = `${htmlFor}-hint`;
  const errId = `${htmlFor}-error`;
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ivory-200">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ivory-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1.5 text-xs text-verdict-pass" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(control, className)} {...props} />
);

export const Textarea = ({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(control, 'resize-none', className)} {...props} />
);

/** Convenience hook for pairing a Field with its control id. */
export function useFieldId(prefix = 'field'): string {
  const id = useId();
  return `${prefix}-${id}`;
}
