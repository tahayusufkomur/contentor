import { createElement, type FC, type ReactNode } from "react";
import { renderToStaticMarkup as renderBare } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import admin from "../../../../messages/en/admin.json";
import site from "../../../../../packages/shared/src/i18n/messages/en/site.json";

// createElement wants the children among this provider's props; pass them as arguments.
const Intl = NextIntlClientProvider as FC<{
  locale: string;
  messages: Record<string, unknown>;
  children?: ReactNode;
}>;

/** renderToStaticMarkup inside an English provider holding the studio and site messages. */
export const renderToStaticMarkup = (el: Parameters<typeof renderBare>[0]) =>
  renderBare(
    createElement(Intl, { locale: "en", messages: { admin, site } }, el),
  );
