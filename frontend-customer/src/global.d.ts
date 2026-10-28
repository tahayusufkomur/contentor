import type site from "@shared/i18n/messages/en/site.json";
import type studio from "@shared/i18n/messages/en/studio.json";

// ponytail: admin/student/common/pwa stay loose. Typing them from their JSON
// breaks ~37 existing dynamic keys (`focus.kinds.${kind}.…`, `setup.items.${id}…`)
// in 17 files. Tighten per namespace as the extraction tasks touch those files.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

declare module "next-intl" {
  interface AppConfig {
    Messages: {
      admin: Loose;
      student: Loose;
      common: Loose;
      pwa: Loose;
      site: typeof site;
      studio: typeof studio;
    };
  }
}
