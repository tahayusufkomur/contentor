"use client";

import Link from "next/link";

import { useTenant } from "@/hooks/use-tenant";

/** Brand, © year, the site's own nav links and any social links the coach set.
 * A public site that ends at the last block reads as unfinished. */
export function PublicFooter() {
  const config = useTenant();
  if (!config) return null;
  const links = config.navbar_config?.links ?? [];
  const social = Object.entries(config.social_links ?? {}).filter(
    ([, url]) => url,
  );

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-[var(--site-wrap,80rem)] flex-col gap-4 px-[var(--site-gutter,1rem)] py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-[var(--site-gutter-md,1.5rem)]">
        <p>
          © {new Date().getFullYear()} {config.brand_name}
        </p>
        {links.length > 0 && (
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
        {social.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {social.map(([name, url]) => (
              <li key={name}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="capitalize transition-colors hover:text-foreground"
                >
                  {name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}
