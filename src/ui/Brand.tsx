// Rova's mark: an open orbit with one point travelling on it. A reading only means something in
// its context, and the orbit is that context: your own usual range, your month, the measures around it.

/** The symbol alone. Inherits text color for the orbit; the point uses the brand's deep blue. */
export function RovaMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg className="rova-mark" width={size} height={size} viewBox="0 0 32 32" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <path d="M25.66 13.41 A10 10 0 1 1 18.59 6.34" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle className="rova-mark-point" cx="23.07" cy="8.93" r="2.9" />
    </svg>
  );
}

/** Symbol + lowercase serif wordmark, for the top navigation. */
export function RovaLogo() {
  return (
    <span className="rova-logo">
      <RovaMark size={28} />
      <span className="rova-wordmark">rova</span>
    </span>
  );
}
