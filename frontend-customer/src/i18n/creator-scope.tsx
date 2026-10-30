"use client";

import { cloneElement, createContext, useContext } from "react";
import { useLocale } from "next-intl";
import { InLocale, SiteLocaleBoundary } from "@shared/i18n/site-preview";

// A site+owner page (surface.ts) runs on ONE next-intl locale: the site's. The
// creator's own words (admin.*, studio.*) are loaded in her language, but
// without this their plurals, dates and numbers would follow the site's rules
// ("2 kursów" for a Polish creator on an English site). OwnerLocales says which
// two languages are in play; AsCreator wraps owner chrome, and AsSite the site
// content inside it (the sidebar's children), so each formats in its own
// language. Where the two are the same nothing is added.
const Locales = createContext<{ creator: string; site: string } | null>(null);

export function OwnerLocales({
  creator,
  site,
  children,
}: {
  creator: string;
  site: string;
  children: React.ReactNode;
}) {
  return (
    <Locales.Provider value={{ creator, site }}>{children}</Locales.Provider>
  );
}

function In({
  of,
  children,
}: {
  of: "creator" | "site";
  children: React.ReactNode;
}) {
  const locales = useContext(Locales);
  const current = useLocale();
  const target = locales?.[of];
  return target && target !== current ? (
    <InLocale locale={target}>{children}</InLocale>
  ) : (
    <>{children}</>
  );
}

/** Owner tools: the creator's plurals, dates and numbers. */
export const AsCreator = ({ children }: { children: React.ReactNode }) => (
  <In of="creator">{children}</In>
);

/** What visitors see (the page inside the owner chrome): the site's. */
export const AsSite = ({ children }: { children: React.ReactNode }) => (
  <In of="site">{children}</In>
);

/** The page with the owner's tools around it, as the public layout mounts it.
 *  `tools` is the owner chrome (an element taking the page as its children):
 *  it formats in the creator's language, the page inside it in the site's, and
 *  every SitePreview in the tools shows the site's too (SiteLocaleBoundary, as
 *  in the studio). */
export function OwnerFrame({
  creator,
  site,
  tools,
  children,
}: {
  creator: string;
  site: string;
  tools: React.ReactElement<{ children?: React.ReactNode }>;
  children: React.ReactNode;
}) {
  return (
    <OwnerLocales creator={creator} site={site}>
      <SiteLocaleBoundary locale={site}>
        <AsCreator>
          {cloneElement(tools, undefined, <AsSite>{children}</AsSite>)}
        </AsCreator>
      </SiteLocaleBoundary>
    </OwnerLocales>
  );
}
