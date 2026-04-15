export function StreamingDots() {
  return (
    <div className="flex items-center gap-1 py-2">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-tertiary)]"
          style={{ animation: `dot-pulse 1.2s infinite ${delay}ms` }}
        />
      ))}
    </div>
  );
}
