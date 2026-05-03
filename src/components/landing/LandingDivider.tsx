/** קו מפריד עדין בין סקשנים בדף הנחיתה */
export function LandingDivider() {
  return (
    <div
      className="landing-section-divider mx-auto max-w-6xl px-4 py-3 sm:px-6 md:py-5"
      aria-hidden
      role="presentation"
    >
      <div className="h-px w-full rounded-full bg-gradient-to-l from-transparent via-violet-400/35 to-transparent opacity-90 shadow-[0_0_20px_-4px_rgba(139,92,246,0.35)]" />
    </div>
  )
}
