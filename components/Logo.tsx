// DesignMind AI mark: a screen with a red review pin on its corner.
export default function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect x="2.5" y="8" width="22" height="18" rx="3.5" fill="#ffffff" stroke="#1b1f3b" strokeWidth="2.5" />
      <rect x="6.5" y="13" width="9" height="2.5" rx="1.25" fill="#1b1f3b" />
      <rect x="6.5" y="18" width="13" height="2.5" rx="1.25" fill="#c9cede" />
      <path d="M17 17V9.5a7.5 7.5 0 1 1 7.5 7.5Z" fill="#c22f29" stroke="#ffffff" strokeWidth="1.5" />
      <circle cx="24.5" cy="9.5" r="2.4" fill="#ffffff" />
    </svg>
  );
}
