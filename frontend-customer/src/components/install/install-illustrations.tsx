import type { ReactNode } from "react";

// Theme-aware install-step illustrations. Colors reference the app's OKLCH design
// tokens DIRECTLY as `var(--token)` (the tokens are full oklch() colors, so they
// must NOT be wrapped in hsl()). All art is decorative — the adjacent step text
// carries the meaning — so the SVGs are aria-hidden.

function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 130 235" className={className} role="img" aria-hidden="true">
      <rect x="5" y="3" width="120" height="229" rx="24" fill="var(--foreground)" />
      <rect x="11" y="11" width="108" height="213" rx="18" fill="var(--card)" />
      <rect x="50" y="15" width="30" height="7" rx="3.5" fill="var(--foreground)" />
      {children}
      <rect x="49" y="214" width="32" height="4" rx="2" fill="var(--muted-foreground)" opacity="0.45" />
    </svg>
  );
}

export function IosShareStep({ className }: { className?: string }) {
  return (
    <PhoneFrame className={className}>
      <rect x="20" y="30" width="90" height="13" rx="6.5" fill="var(--muted)" />
      <rect x="26" y="34" width="40" height="5" rx="2.5" fill="var(--muted-foreground)" opacity="0.45" />
      <rect x="20" y="54" width="64" height="8" rx="4" fill="var(--muted-foreground)" opacity="0.8" />
      <rect x="20" y="70" width="90" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
      <rect x="20" y="82" width="78" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
      <rect x="20" y="98" width="90" height="50" rx="6" fill="var(--secondary)" />
      <rect x="11" y="188" width="108" height="26" fill="var(--background)" />
      <line x1="11" y1="188" x2="119" y2="188" stroke="var(--border)" strokeWidth="1.5" />
      <path d="M28 196 l-6 5 l6 5" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      <path d="M46 196 l6 5 l-6 5" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      <rect x="92" y="195" width="14" height="12" rx="2.5" fill="none" stroke="var(--muted-foreground)" strokeWidth="2" opacity="0.5" />
      <circle cx="65" cy="201" r="14" fill="var(--primary)" opacity="0.12" />
      <g stroke="var(--primary)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M59 200 v7 a2 2 0 0 0 2 2 h8 a2 2 0 0 0 2 -2 v-7" />
        <path d="M65 204 v-12" />
        <path d="M61 196 l4 -4 l4 4" />
      </g>
    </PhoneFrame>
  );
}

export function IosAddStep({ label, className }: { label: string; className?: string }) {
  return (
    <PhoneFrame className={className}>
      <rect x="20" y="34" width="60" height="7" rx="3.5" fill="var(--muted-foreground)" opacity="0.3" />
      <rect x="20" y="48" width="80" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.2" />
      <rect x="11" y="11" width="108" height="213" rx="18" fill="var(--foreground)" opacity="0.18" />
      <rect x="15" y="86" width="100" height="130" rx="14" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="58" y="93" width="14" height="3.5" rx="1.75" fill="var(--muted-foreground)" opacity="0.4" />
      <rect x="24" y="104" width="20" height="20" rx="6" fill="var(--muted)" />
      <rect x="50" y="104" width="20" height="20" rx="6" fill="var(--muted)" />
      <rect x="76" y="104" width="20" height="20" rx="6" fill="var(--muted)" />
      <rect x="19" y="138" width="92" height="24" rx="7" fill="var(--primary)" opacity="0.12" />
      <rect x="19" y="138" width="92" height="24" rx="7" fill="none" stroke="var(--primary)" strokeWidth="1.5" />
      <rect x="25" y="145" width="11" height="11" rx="2.5" fill="none" stroke="var(--primary)" strokeWidth="2" />
      <path d="M30.5 148 v5 M28 150.5 h5" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
      <text x="41" y="153" fontSize="6" fontWeight="600" fill="var(--primary)">{label}</text>
      <rect x="29" y="174" width="64" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
      <rect x="29" y="190" width="54" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
    </PhoneFrame>
  );
}

export function IosConfirmStep({ label, className }: { label: string; className?: string }) {
  return (
    <PhoneFrame className={className}>
      <rect x="11" y="11" width="108" height="213" rx="18" fill="var(--foreground)" opacity="0.18" />
      <rect x="16" y="40" width="98" height="78" rx="12" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
      <text x="24" y="56" fontSize="7.5" fill="var(--muted-foreground)" opacity="0.7">Cancel</text>
      <rect x="82" y="47" width="26" height="14" rx="7" fill="var(--primary)" />
      <text x="95" y="56.5" fontSize="7.5" fontWeight="700" fill="var(--primary-foreground)" textAnchor="middle">{label}</text>
      <rect x="24" y="74" width="26" height="26" rx="7" fill="var(--primary)" opacity="0.85" />
      <rect x="56" y="78" width="50" height="7" rx="3.5" fill="var(--muted-foreground)" opacity="0.7" />
      <rect x="56" y="90" width="38" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
    </PhoneFrame>
  );
}

export function AndroidMenuStep({ className }: { className?: string }) {
  return (
    <PhoneFrame className={className}>
      <rect x="11" y="22" width="108" height="24" fill="var(--background)" />
      <line x1="11" y1="46" x2="119" y2="46" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="20" y="29" width="76" height="11" rx="5.5" fill="var(--muted)" />
      <circle cx="107" cy="34" r="12" fill="var(--primary)" opacity="0.12" />
      <g fill="var(--primary)">
        <circle cx="107" cy="29" r="2.4" />
        <circle cx="107" cy="34" r="2.4" />
        <circle cx="107" cy="39" r="2.4" />
      </g>
      <rect x="20" y="58" width="64" height="8" rx="4" fill="var(--muted-foreground)" opacity="0.7" />
      <rect x="20" y="74" width="90" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.25" />
      <rect x="20" y="86" width="80" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.25" />
      <rect x="20" y="104" width="90" height="50" rx="6" fill="var(--secondary)" />
    </PhoneFrame>
  );
}

export function AndroidInstallStep({ label, className }: { label: string; className?: string }) {
  return (
    <PhoneFrame className={className}>
      <rect x="11" y="22" width="108" height="24" fill="var(--background)" />
      <line x1="11" y1="46" x2="119" y2="46" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="20" y="29" width="76" height="11" rx="5.5" fill="var(--muted)" />
      <g fill="var(--muted-foreground)" opacity="0.5">
        <circle cx="107" cy="29" r="2.4" />
        <circle cx="107" cy="34" r="2.4" />
        <circle cx="107" cy="39" r="2.4" />
      </g>
      <rect x="58" y="44" width="58" height="150" rx="9" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="64" y="54" width="40" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
      <rect x="64" y="68" width="34" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
      <rect x="61" y="80" width="52" height="22" rx="6" fill="var(--primary)" opacity="0.13" />
      <g stroke="var(--primary)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M68 86 v8 M64.5 90.5 l3.5 3.5 l3.5 -3.5" />
        <path d="M64 98 h8" />
      </g>
      <text x="75" y="93.5" fontSize="6" fontWeight="600" fill="var(--primary)">{label}</text>
      <rect x="64" y="112" width="38" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
      <rect x="64" y="126" width="42" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
      <rect x="64" y="140" width="30" height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
    </PhoneFrame>
  );
}

export function AndroidConfirmStep({ label, className }: { label: string; className?: string }) {
  return (
    <PhoneFrame className={className}>
      <rect x="11" y="11" width="108" height="213" rx="18" fill="var(--foreground)" opacity="0.18" />
      <rect x="18" y="74" width="94" height="92" rx="12" fill="var(--card)" stroke="var(--border)" strokeWidth="1.5" />
      <rect x="28" y="86" width="26" height="26" rx="7" fill="var(--primary)" />
      <rect x="60" y="89" width="44" height="7" rx="3.5" fill="var(--muted-foreground)" opacity="0.75" />
      <rect x="60" y="101" width="32" height="5" rx="2.5" fill="var(--muted-foreground)" opacity="0.35" />
      <text x="62" y="140" fontSize="7.5" fill="var(--muted-foreground)" opacity="0.6">Cancel</text>
      <rect x="70" y="130" width="34" height="16" rx="8" fill="var(--primary)" />
      <text x="87" y="141" fontSize="7.5" fontWeight="700" fill="var(--primary-foreground)" textAnchor="middle">{label}</text>
    </PhoneFrame>
  );
}

export function InstalledCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="var(--primary)" opacity="0.12" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="var(--primary)" strokeWidth="5" />
      <path d="M37 50 l9 10 l18 -20" fill="none" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
