import { getTranslations } from "next-intl/server";
import {
  BellRing,
  Mail,
  Send,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

/** Each channel: its badge, and where its card sits around the message. */
const CHANNELS: {
  key: "push" | "email" | "app";
  Icon: LucideIcon;
  badge: string;
  place: string;
}[] = [
  {
    key: "push",
    Icon: BellRing,
    badge: "bg-foreground",
    place: "col-start-1 row-start-1",
  },
  {
    key: "email",
    Icon: Mail,
    badge: "bg-marketing-accent",
    place: "col-start-2 row-start-1",
  },
  {
    key: "app",
    Icon: Smartphone,
    badge: "bg-muted-foreground",
    place: "col-span-2 row-start-3 mx-auto w-full max-w-[260px]",
  },
];

/** From the message (centre) out to each card's inner edge. */
const WIRES = [
  "M50 50 C50 35 30 38 26 16",
  "M50 50 C50 35 70 38 74 16",
  "M50 50 C50 62 50 70 50 84",
];

/** "Keep students coming back", drawn: the coach writes one reminder and it
 * lands as a push on the phone, an email and a note in the student's app,
 * the three ways announcements really go out. Reveals in order (wires,
 * message, channels); the dashes keep flowing outward unless reduced motion
 * is on. */
export async function ChannelFanout({ label }: { label: string }) {
  const t = await getTranslations("marketing.team.roles.community.scene");
  const title = t("title");
  const body = t("body");
  return (
    <figure
      role="img"
      aria-label={label}
      className="mx-auto w-full max-w-[560px]"
    >
      <Reveal
        stagger
        className="relative grid grid-cols-2 gap-x-3 gap-y-8 text-left sm:gap-x-8 sm:gap-y-12"
      >
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full text-muted-foreground/40"
        >
          {WIRES.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
              className="wire-flow"
            />
          ))}
        </svg>

        {/* The one message the coach sends. */}
        <div
          aria-hidden
          className="relative col-span-2 row-start-2 mx-auto w-full max-w-[300px] rounded-tile bg-foreground p-4 text-background shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center gap-2 text-caption opacity-70">
            <Send className="size-3.5" />
            {t("sent")}
          </div>
          <p className="mt-2 font-semibold">{title}</p>
          <p className="mt-0.5 text-sm opacity-80">{body}</p>
        </div>

        {CHANNELS.map(({ key, Icon, badge, place }) => (
          <div key={key} aria-hidden className={cn("relative", place)}>
            <div className="mb-2 flex items-center gap-1.5 text-caption font-medium text-muted-foreground">
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-md text-background",
                  badge,
                )}
              >
                <Icon className="size-3" />
              </span>
              {t(`channels.${key}`)}
            </div>
            <ChannelCard
              channel={key}
              title={title}
              body={body}
              from={t("from")}
              now={t("now")}
            />
          </div>
        ))}
      </Reveal>
    </figure>
  );
}

/** The same reminder as each channel would show it. */
function ChannelCard({
  channel,
  title,
  body,
  from,
  now,
}: {
  channel: (typeof CHANNELS)[number]["key"];
  title: string;
  body: string;
  from: string;
  now: string;
}) {
  const shell =
    "rounded-[14px] p-3 text-xs leading-snug shadow-[0_16px_40px_-20px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10";
  if (channel === "push")
    return (
      <div className={cn(shell, "bg-card")}>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="grid size-4 place-items-center rounded-[5px] bg-marketing-accent text-[9px] font-bold text-marketing-accent-foreground">
              {from[0]}
            </span>
            {from}
          </span>
          {now}
        </div>
        <p className="mt-1.5 font-semibold text-foreground">{title}</p>
        <p className="text-muted-foreground">{body}</p>
      </div>
    );
  if (channel === "email")
    return (
      <div className={cn(shell, "bg-card")}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-semibold text-foreground">
            <span className="size-1.5 rounded-full bg-marketing-accent" />
            {from}
          </span>
          <span className="text-[11px] text-muted-foreground">{now}</span>
        </div>
        <p className="mt-1 font-medium text-foreground">{title}</p>
        <p className="truncate text-muted-foreground">{body}</p>
      </div>
    );
  // The student's app: the note lands in their feed.
  return (
    <div className={cn(shell, "bg-card")}>
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-foreground text-[11px] font-bold text-background">
          {from[0]}
        </span>
        <span className="leading-tight">
          <span className="block font-semibold text-foreground">{from}</span>
          <span className="block text-[11px] text-muted-foreground">{now}</span>
        </span>
      </div>
      <p className="mt-2 font-medium text-foreground">{title}</p>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}
