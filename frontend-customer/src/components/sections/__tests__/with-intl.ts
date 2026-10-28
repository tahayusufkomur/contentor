import { createElement } from "react";
import type { FC, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import site from "@shared/i18n/messages/en/site.json";

const Intl = NextIntlClientProvider as FC<{
  locale: string;
  messages: Record<string, unknown>;
  children?: ReactNode;
}>;

/** `el` inside the English site messages: sections read their text from them. */
export const withIntl = (el: ReactNode) =>
  createElement(Intl, { locale: "en", messages: { site } }, el);
