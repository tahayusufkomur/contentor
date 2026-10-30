import type admin from "../messages/en/admin.json";
import type blocks from "../messages/en/blocks.json";
import type common from "../messages/en/common.json";
import type pwa from "../messages/en/pwa.json";
import type student from "../messages/en/student.json";
import type site from "@shared/i18n/messages/en/site.json";
import type studio from "@shared/i18n/messages/en/studio.json";

declare module "next-intl" {
  interface AppConfig {
    Messages: {
      admin: typeof admin;
      blocks: typeof blocks;
      student: typeof student;
      common: typeof common;
      pwa: typeof pwa;
      site: typeof site;
      studio: typeof studio;
    };
  }
}
