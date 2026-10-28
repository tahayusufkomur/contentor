"use client";

import { useTranslations } from "next-intl";

/** "Loading" in the reader's language, for a screen reader. It is its own
 *  component so that Button, Spinner and ProgressLine read the message only
 *  while they are loading, not on every render. */
export function LoadingLabel() {
  return <>{useTranslations("common")("ui.loading")}</>;
}
