import type { DefaultText } from "@shared/email/editor/factory";
import enSite from "../../../../packages/shared/src/i18n/messages/en/site.json";

/** The default words a new block starts with, as an English site writes them. */
export const englishText: DefaultText = (key) => enSite.email.defaults[key];
