import type auth from "../messages/en/auth.json";
import type common from "../messages/en/common.json";
import type marketing from "../messages/en/marketing.json";
import type pricing from "../messages/en/pricing.json";
import type site from "@shared/i18n/messages/en/site.json";
import type studio from "@shared/i18n/messages/en/studio.json";

declare module "next-intl" {
  interface AppConfig {
    Messages: {
      marketing: typeof marketing;
      pricing: typeof pricing;
      auth: typeof auth;
      common: typeof common;
      site: typeof site;
      studio: typeof studio;
    };
  }
}
