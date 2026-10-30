import { createTranslator } from "next-intl";
import common from "../../messages/en/common.json";

/** `common` in English, whatever language the page is in: for text only a
 *  superadmin reads (the impersonation hand-off and a platform-scope
 *  impersonation banner). The superadmin tools stay English. */
export const tEnglish = createTranslator({
  locale: "en",
  messages: { common },
  namespace: "common",
});
