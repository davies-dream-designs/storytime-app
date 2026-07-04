type BeastProps = {
  body: string;
  belly: string;
  className?: string;
  eyes?: 1 | 2;
  horns?: boolean;
};

export default function Beast({
  body,
  belly,
  className,
  eyes = 1,
  horns = false,
}: BeastProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="A friendly Brushbeast monster"
      xmlns="http://www.w3.org/2000/svg"
    >
      {horns && (
        <>
          <path d="M60 40 L48 12 L74 34 Z" fill={body} />
          <path d="M140 40 L152 12 L126 34 Z" fill={body} />
        </>
      )}
      <ellipse cx="100" cy="110" rx="70" ry="72" fill={body} />
      <ellipse cx="100" cy="128" rx="44" ry="42" fill={belly} opacity="0.85" />

      {eyes === 1 ? (
        <g>
          <circle cx="100" cy="74" r="30" fill="#ffffff" />
          <circle className="animate-blink" cx="100" cy="78" r="15" fill="#14342b" />
          <circle cx="107" cy="72" r="5" fill="#ffffff" />
        </g>
      ) : (
        <g>
          <circle cx="78" cy="76" r="20" fill="#ffffff" />
          <circle cx="122" cy="76" r="20" fill="#ffffff" />
          <circle className="animate-blink" cx="80" cy="80" r="10" fill="#14342b" />
          <circle className="animate-blink" cx="124" cy="80" r="10" fill="#14342b" />
          <circle cx="84" cy="76" r="3.5" fill="#ffffff" />
          <circle cx="128" cy="76" r="3.5" fill="#ffffff" />
        </g>
      )}

      {/* toothy grin */}
      <path
        d="M70 130 Q100 168 130 130 Z"
        fill="#0b2e24"
      />
      <path d="M78 133 l7 12 l7 -12 Z" fill="#ffffff" />
      <path d="M93 134 l7 13 l7 -13 Z" fill="#ffffff" />
      <path d="M108 133 l7 12 l7 -12 Z" fill="#ffffff" />
    </svg>
  );
}
