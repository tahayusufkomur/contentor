"use client";

import { useTranslations } from "next-intl";
import { LocaleNavLink } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Wordmark } from "@/components/shared/logo-mark";

/** `flush` drops the top margin for pages whose last section is already
 * `bg-muted`, so no paper strip shows between two muted bands. */
export function PlatformFooter({ flush = false }: { flush?: boolean }) {
  const t = useTranslations("common.footer");
  const tNav = useTranslations("common.nav");

  const sections = [
    {
      heading: t("product"),
      links: [
        { label: tNav("howItWorks"), href: "/#path" },
        { label: tNav("pricing"), href: "/pricing" },
        { label: tNav("getStarted"), href: "/signup" },
      ],
    },
    {
      heading: t("company"),
      links: [
        { label: t("about"), href: "#" },
        { label: t("contact"), href: "#" },
      ],
    },
    {
      heading: t("legal"),
      links: [
        { label: t("privacy"), href: "#" },
        { label: t("terms"), href: "#" },
      ],
    },
  ];

  return (
    <footer className={flush ? "border-t bg-muted" : "mt-32 bg-muted"}>
      <div className="mx-auto max-w-media px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <LocaleNavLink href="/" className="inline-flex items-center">
              <Wordmark className="text-xl" />
            </LocaleNavLink>
            <p className="mt-3 text-caption text-muted-foreground">
              {t("tagline")}
            </p>
          </div>

          {sections.map((section) => (
            <div key={section.heading}>
              <p className="text-caption font-semibold text-foreground">
                {section.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.href === "#" ? (
                      <a
                        href={link.href}
                        className="text-caption text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <LocaleNavLink
                        href={link.href}
                        className="text-caption text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </LocaleNavLink>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6 text-[12px] text-muted-foreground">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
