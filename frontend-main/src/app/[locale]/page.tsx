import { EarningsChapter } from "@/components/landing/earnings-chapter";
import { FounderChapter } from "@/components/landing/founder-chapter";
import { Hero } from "@/components/landing/hero";
import { LooksChapter } from "@/components/landing/looks-chapter";
import { StartChapter } from "@/components/landing/start-chapter";
import { TeamChapter } from "@/components/landing/team-chapter";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { PlatformHeader } from "@/components/shared/platform-header";
import { getAuthUser } from "@/lib/auth";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return pageMetadata((await params).locale, "/", "marketing.meta");
}

/** The landing, built around the team the hero promises: what it is (the
 * creator and her whole team), who it is for, the team at work, what she
 * could earn, the founder behind it, then price, questions and the last call.
 * One sticky header; nothing is tied to the scroll position. */
export default async function HomePage() {
  const user = await getAuthUser();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <main>
        <Hero />
        <LooksChapter />
        <TeamChapter />
        <EarningsChapter />
        <FounderChapter />
        <StartChapter />
      </main>
      <PlatformFooter />
    </div>
  );
}
