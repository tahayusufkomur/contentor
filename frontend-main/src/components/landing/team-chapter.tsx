import { Suspense, type ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ChannelFanout } from "@/components/landing/channel-fanout";
import { FoundScene } from "@/components/landing/found-scene";
import { NightSale } from "@/components/landing/night-scenes";
import { PaymentFeed } from "@/components/landing/payment-feed";
import { TeamTabs } from "@/components/landing/team-tabs";
import { Chapter } from "@/components/motion/chapter";
import { MediaVideo } from "@/components/ui/media-video";
import {
  LIVE_CLIPS,
  TEAM_CLIP,
  TEAM_ROLES,
  type TeamRole,
} from "@/lib/landing";
import { media } from "@/lib/media";
import { fetchPlans } from "@/lib/plans-server";

/** The designer at work: the setup interview, a look picked, the site built. */
function SetupClip({ label }: { label: string }) {
  const clip = media(TEAM_CLIP);
  return (
    <MediaVideo
      src={clip.src}
      webm={clip.webm}
      phoneSrc={clip.phoneSrc}
      // landing-media.test.ts guarantees every clip has a poster.
      poster={clip.poster!}
      width={clip.width}
      height={clip.height}
      posterLoading="lazy"
      label={label}
      className="rounded-tile"
    />
  );
}

/** The producer at work: Mara's live class followed on a laptop, a tablet and
 * a phone, the class playing on each screen. */
async function LiveScene({ label }: { label: string }) {
  const t = await getTranslations("marketing.team.roles.producer");
  return (
    <figure role="group" aria-label={label} className="relative pt-12">
      <p className="absolute left-0 top-0 inline-flex items-center gap-2 rounded-full bg-[#dc2626] px-3 py-1.5 text-caption font-semibold text-white">
        <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" />
        {t("live")}
      </p>
      <div className="grid grid-cols-3 gap-2.5 md:gap-4">
        {LIVE_CLIPS.map(({ key, media: k }) => {
          const m = media(k);
          return (
            <div key={key}>
              <MediaVideo
                src={m.src}
                webm={m.webm}
                phoneSrc={m.phoneSrc}
                poster={m.poster!}
                width={m.width}
                height={m.height}
                posterLoading="lazy"
                label={t(`devices.${key}`)}
                className="rounded-2xl"
              />
              <p className="mt-2 text-caption text-muted-foreground">
                {t(`devices.${key}`)}
              </p>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

/** The feed in the currency the visitor's plans are priced in. */
async function LocalPaymentFeed({ label }: { label: string }) {
  const plans = await fetchPlans();
  return <PaymentFeed label={label} currency={plans?.currency ?? "USD"} />;
}

const SCENES: Record<TeamRole, (label: string) => ReactNode> = {
  designer: (label) => <SetupClip label={label} />,
  marketer: (label) => <FoundScene label={label} />,
  producer: (label) => <LiveScene label={label} />,
  community: (label) => <ChannelFanout label={label} />,
  assistant: (label) => <NightSale label={label} />,
  // Dollars until the plans answer, then the visitor's currency.
  cashier: (label) => (
    <Suspense fallback={<PaymentFeed label={label} currency="USD" />}>
      <LocalPaymentFeed label={label} />
    </Suspense>
  ),
};

/** "Meet your team": the hero's six roles, each at work in the real product
 * or a drawn scene of it, one at a time on a dark stage. */
export async function TeamChapter() {
  const t = await getTranslations("marketing.team");
  return (
    <Chapter
      id="team"
      dark
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <TeamTabs
        label={t("tabsLabel")}
        tabs={TEAM_ROLES.map(({ key, ms }) => ({
          key,
          ms,
          name: t(`roles.${key}.name`),
          title: t(`roles.${key}.title`),
          text: t(`roles.${key}.text`),
          tools: t(`roles.${key}.tools`),
          scene: SCENES[key](t(`roles.${key}.sceneLabel`)),
        }))}
      />
    </Chapter>
  );
}
