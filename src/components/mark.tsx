export function Mark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 5.5v5.2M16 21.3V26.5M5.5 16h5.2M21.3 16H26.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="2.1" fill="currentColor" />
    </svg>
  );
}
