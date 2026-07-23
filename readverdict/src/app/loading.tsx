export default function Loading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-ivory-300">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-obsidian-600 border-t-brass-400" />
        <span>Loading…</span>
      </div>
    </div>
  );
}
