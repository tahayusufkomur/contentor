import { getTranslations } from "next-intl/server";
import { AssistantChapter } from "@/components/landing/assistant-chapter";
import { BuildChapter } from "@/components/landing/build-chapter";
import { Hero } from "@/components/landing/hero";
import { LooksChapter } from "@/components/landing/looks-chapter";
import { MoneyChapter } from "@/components/landing/money-chapter";
import { StartChapter } from "@/components/landing/start-chapter";
import { StudentsChapter } from "@/components/landing/students-chapter";
import { StudioChapter } from "@/components/landing/studio-chapter";
import { LocalNav } from "@/components/shared/local-nav";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { PlatformHeader } from "@/components/shared/platform-header";
import { getAuthUser } from "@/lib/auth";
import { CHAPTER_IDS } from "@/lib/landing";

/** The landing: eight chapters on real footage. Proof (the looks) comes
 * straight after the hero; nothing is tied to the scroll position. */
export default async function HomePage() {
  const [user, t] = await Promise.all([
    getAuthUser(),
    getTranslations("marketing.landingNav"),
  ]);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} sticky={false} />
      <LocalNav
        title={t("title")}
        items={CHAPTER_IDS.map((id) => ({ id, label: t(id) }))}
        cta={{ href: "/signup", label: t("cta") }}
      />
      <main>
        <Hero />
        <LooksChapter />
        <BuildChapter />
        <StudioChapter />
        <AssistantChapter />
        <StudentsChapter />
        <MoneyChapter />
        <StartChapter />
      </main>
      <PlatformFooter />
    </div>
  );
}
