import { NavLink } from "@/components/ui/nav-link";
import { Wordmark } from "@/components/shared/logo-mark";

interface AuthShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** The 4:5 coach photograph beside the form (spec 5.5; Phase 1 manifest).
 * Inlined rather than reading `@/lib/media` because AuthShell is imported by
 * client pages (/login, /callback) and media.json belongs on the server. */
const PHOTO = {
  src: "/media/stills/still-yoga.avif",
  srcSmall: "/media/stills/still-yoga-small.avif",
  width: 1600,
  height: 2000,
} as const;

/** White auth page (spec 5.5): a 420 px centred form; on desktop one 4:5
 * coach photograph fills the other half with the wordmark over it. The
 * photograph is decoration (alt=""), so a failed load paints nothing over
 * the second paper beneath it. No aurora, no grid, no gradient text. */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  const photo = PHOTO;

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-muted lg:block">
        {photo && (
          <img
            src={photo.src}
            srcSet={`${photo.srcSmall} ${photo.width / 2}w, ${photo.src} ${photo.width}w`}
            sizes="50vw"
            width={photo.width}
            height={photo.height}
            alt=""
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <NavLink
          href="/"
          className="absolute left-8 top-8 inline-flex rounded-full bg-background px-3.5 py-1.5"
        >
          <Wordmark className="text-base" />
        </NavLink>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-10 flex justify-center lg:hidden">
            <NavLink href="/">
              <Wordmark className="text-base" />
            </NavLink>
          </div>

          <div className="text-center">
            {eyebrow && (
              <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
            )}
            <h1 className="mt-2 text-title-2 text-balance text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-3 text-body text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-6 text-center">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
