export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="max-w-2xl">
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brass-400">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-3xl font-bold leading-tight text-ivory-50 sm:text-4xl">
        {title}
      </h1>
      {description && <p className="mt-3 text-lg text-ivory-300">{description}</p>}
    </header>
  );
}
