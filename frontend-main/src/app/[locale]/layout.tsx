import { notFound } from "next/navigation";

import { routing } from "@/i18n/routing";

// The root layout owns <html> and the providers; this one only turns away an
// address in a language that does not exist (or is not enabled yet).
export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!routing.locales.includes(params.locale)) notFound();
  return children;
}
