import type { ReactNode } from "react";

const FRAME = "hsl(var(--border))";
const CARD = "hsl(var(--card))";
const MUTED = "hsl(var(--muted))";
const FAINT = "hsl(var(--muted-foreground))";
const ACCENT = "hsl(var(--primary))";

function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 120 200" className={className} role="img" aria-hidden="true">
      <rect x="8" y="4" width="104" height="192" rx="16" fill={CARD} stroke={FRAME} strokeWidth="2" />
      <rect x="48" y="10" width="24" height="5" rx="2.5" fill={FAINT} opacity="0.35" />
      {children}
    </svg>
  );
}

function ContentLines() {
  return (
    <g fill={MUTED}>
      <rect x="20" y="72" width="80" height="9" rx="4.5" />
      <rect x="20" y="88" width="58" height="7" rx="3.5" />
      <rect x="20" y="102" width="68" height="7" rx="3.5" />
    </g>
  );
}

export function ToolbarIcon({ variant, className }: { variant: "share" | "menu"; className?: string }) {
  const bottom = variant === "share";
  const barY = bottom ? 170 : 18;
  return (
    <PhoneFrame className={className}>
      <ContentLines />
      <rect x="8" y={barY} width="104" height="24" fill={MUTED} opacity="0.5" />
      {variant === "share" ? (
        <g stroke={ACCENT} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <rect x="52" y={barY + 8} width="16" height="12" rx="2" />
          <path d={`M60 ${barY + 12} V${barY - 2}`} />
          <path d={`M56 ${barY + 2} L60 ${barY - 2} L64 ${barY + 2}`} />
        </g>
      ) : (
        <g fill={ACCENT}>
          <circle cx="96" cy={barY + 6} r="2.2" />
          <circle cx="96" cy={barY + 12} r="2.2" />
          <circle cx="96" cy={barY + 18} r="2.2" />
        </g>
      )}
      <circle cx={variant === "share" ? 60 : 96} cy={barY + 12} r="15" fill="none" stroke={ACCENT} strokeWidth="1.5" opacity="0.5" />
    </PhoneFrame>
  );
}

export function MenuSheet({ side, label, className }: { side: "bottom" | "top"; label: string; className?: string }) {
  const sheetY = side === "bottom" ? 120 : 22;
  return (
    <PhoneFrame className={className}>
      <ContentLines />
      <rect x="14" y={sheetY} width="92" height="68" rx="10" fill={CARD} stroke={FRAME} strokeWidth="1.5" />
      <rect x="22" y={sheetY + 10} width="76" height="14" rx="4" fill={ACCENT} opacity="0.15" stroke={ACCENT} strokeWidth="1.5" />
      <text x="28" y={sheetY + 20} fontSize="7" fill={ACCENT} fontWeight="600">{label}</text>
      <rect x="22" y={sheetY + 32} width="64" height="7" rx="3.5" fill={MUTED} />
      <rect x="22" y={sheetY + 46} width="70" height="7" rx="3.5" fill={MUTED} />
    </PhoneFrame>
  );
}

export function ConfirmDialog({ label, className }: { label: string; className?: string }) {
  return (
    <PhoneFrame className={className}>
      <ContentLines />
      <rect x="8" y="4" width="104" height="192" rx="16" fill={FAINT} opacity="0.15" />
      <rect x="22" y="76" width="76" height="48" rx="10" fill={CARD} stroke={FRAME} strokeWidth="1.5" />
      <rect x="34" y="86" width="52" height="6" rx="3" fill={MUTED} />
      <rect x="40" y="102" width="40" height="14" rx="7" fill={ACCENT} />
      <text x="60" y="111.5" fontSize="7" fill="hsl(var(--primary-foreground))" fontWeight="600" textAnchor="middle">{label}</text>
    </PhoneFrame>
  );
}

export function InstalledCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-hidden="true">
      <circle cx="32" cy="32" r="28" fill={ACCENT} opacity="0.12" />
      <circle cx="32" cy="32" r="20" fill="none" stroke={ACCENT} strokeWidth="3" />
      <path d="M23 32 L29 38 L41 26" fill="none" stroke={ACCENT} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
