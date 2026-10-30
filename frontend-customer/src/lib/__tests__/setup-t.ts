import { createTranslator } from "next-intl";
import en from "../../../messages/en/admin.json";
import type { T } from "../setup-flow";

/** The setup flow's translator for a language: `admin.setupFlow` laid over English. */
export const setupT = (locale = "en", messages: unknown = en): T =>
  createTranslator({
    locale,
    messages: { admin: messages } as never,
    namespace: "admin.setupFlow" as never,
  }) as unknown as T;

export const tEn = setupT();
