/**
 * Upsy — the Boardupscale AI Assistant avatar.
 * An SVG bot face with the brand purple gradient.
 */
export function UpsyAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Upsy AI"
    >
      {/* Background circle with gradient */}
      <defs>
        <linearGradient id="upsy-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id="upsy-shine" x1="10" y1="5" x2="30" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.2" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="20" fill="url(#upsy-grad)" />
      <circle cx="20" cy="20" r="20" fill="url(#upsy-shine)" />

      {/* Eyes */}
      <circle cx="14" cy="17" r="2.5" fill="white" />
      <circle cx="26" cy="17" r="2.5" fill="white" />
      <circle cx="14.5" cy="16.5" r="1" fill="#1E1B4B" />
      <circle cx="26.5" cy="16.5" r="1" fill="#1E1B4B" />

      {/* Smile */}
      <path
        d="M13 24 C15 28, 25 28, 27 24"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Antenna */}
      <line x1="20" y1="4" x2="20" y2="8" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="3" r="1.5" fill="#A5B4FC" />

      {/* Ears / side nodes */}
      <circle cx="4" cy="20" r="2" fill="#A5B4FC" opacity="0.7" />
      <circle cx="36" cy="20" r="2" fill="#A5B4FC" opacity="0.7" />
    </svg>
  )
}

export function UpsyAvatarSmall({ className }: { className?: string }) {
  return <UpsyAvatar size={28} className={className} />
}
