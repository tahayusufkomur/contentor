import { EarningsChapter } from "@/components/landing/earnings-chapter";
import { Hero } from "@/components/landing/hero";
import { LooksChapter } from "@/components/landing/looks-chapter";
import { PathChapter } from "@/components/landing/path-chapter";
import { StartChapter } from "@/components/landing/start-chapter";
import { SupportChapter } from "@/components/landing/support-chapter";
import { PlatformFooter } from "@/components/shared/platform-footer";
import { PlatformHeader } from "@/components/shared/platform-header";
import { getAuthUser } from "@/lib/auth";

/** The landing, success-led: the promise, who it is for, the path to paying
 * students on real footage, who helps, what she could earn, then how to
 * start. One sticky header; nothing is tied to the scroll position. */
export default async function HomePage() {
  const user = await getAuthUser();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PlatformHeader user={user} />
      <main>
        <Hero />
        <LooksChapter />
        <PathChapter />
        <SupportChapter />
        <EarningsChapter />
        <StartChapter />
      </main>
      <PlatformFooter />
    </div>
  );
}
