"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/shared/logo-mark";

export function PlatformFooter() {
  const t = useTranslations("common.footer");
  const tNav = useTranslations("common.nav");

  const sections = [
    {
      heading: t("product"),
      links: [
        { label: tNav("features"), href: "/#features" },
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
    <footer className="mt-32 bg-muted">
      <div className="mx-auto max-w-media px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center">
              <Wordmark className="text-base" />
            </Link>
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
                    <Link
                      href={link.href}
                      className="text-caption text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t pt-6 text-[12px] text-muted-foreground">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
