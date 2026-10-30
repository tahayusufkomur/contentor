"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { makeBlockLibrary } from "./registry";
import { say } from "./say";

/** The block library for the owner tools: block, field and template names in the
 *  creator's language, new blocks and built-in templates written in the site's
 *  (the `blocks` messages are always the site's: see i18n/surface.ts). */
export function useBlockLibrary() {
  const ui = useTranslations("admin.owner.blockLib");
  const site = useTranslations("blocks");
  return useMemo(() => makeBlockLibrary(say(ui), say(site)), [ui, site]);
}
