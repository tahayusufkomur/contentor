import { createTranslator } from "next-intl";
import { mergeMessages } from "@shared/i18n/locales";
import adminEn from "../../../messages/en/admin.json";
import adminTr from "../../../messages/tr/admin.json";
import adminDe from "../../../messages/de/admin.json";
import adminPl from "../../../messages/pl/admin.json";
import blocksEn from "../../../messages/en/blocks.json";
import blocksTr from "../../../messages/tr/blocks.json";
import blocksDe from "../../../messages/de/blocks.json";
import blocksPl from "../../../messages/pl/blocks.json";
import { say, type Say, type Translator } from "../blocks/say";

const ADMIN: Record<string, unknown> = {
  en: adminEn,
  tr: adminTr,
  de: adminDe,
  pl: adminPl,
};
const BLOCKS: Record<string, unknown> = {
  en: blocksEn,
  tr: blocksTr,
  de: blocksDe,
  pl: blocksPl,
};

const strict = (locale: string, namespace: string, messages: unknown): Say =>
  say(
    createTranslator({
      locale,
      messages: messages as never,
      namespace: namespace as never,
      // A key the library asks for and no message has is a bug, not a fallback.
      onError: (err) => {
        throw err;
      },
    }) as unknown as Translator,
  );

/** The block library's two voices as the app builds them: names in the
 *  creator's language, a new block's words in the site's (each over English). */
export function blockWords(creator: string, site: string) {
  return {
    ui: strict(
      creator,
      "admin.owner.blockLib",
      mergeMessages(
        { admin: adminEn } as never,
        { admin: ADMIN[creator] } as never,
      ),
    ),
    site: strict(
      site,
      "blocks",
      mergeMessages(
        { blocks: blocksEn } as never,
        { blocks: BLOCKS[site] } as never,
      ),
    ),
  };
}
