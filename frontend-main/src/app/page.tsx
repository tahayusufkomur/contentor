import { getTranslations } from "next-intl/server";
import { BuildChapter } from "@/components/landing/build-chapter";
import { Hero } from "@/components/landing/hero";
import { LooksChapter } from "@/components/landing/looks-chapter";
import { LocalNav } from "@/components/shared/local-nav";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { PlatformHeader } from "@/components/shared/platform-header";
import { getAuthUser } from "@/lib/auth";
import { CHAPTER_IDS } from "@/lib/landing";

/** The landing: eight chapters on real footage (spec 5.4). Chapters are
 * server components; the motion kit beneath them is the client. */
export default async function HomePage() {
  const [user, t] = await Promise.all([getAuthUser(), getTranslations("marketing.landingNav")]);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <LocalNav
        title="Contentor"
        items={CHAPTER_IDS.map((id) => ({ id, label: t(id) }))}
        cta={{ href: "/signup", label: t("cta") }}
      />
      <main>
        <Hero />
        <BuildChapter />
        <LooksChapter />
      </main>
      <PlatformFooter />
    </div>
  );
}
