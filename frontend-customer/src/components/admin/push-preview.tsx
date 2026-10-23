"use client";

import { useTranslations } from "next-intl";

import { useTenant } from "@/hooks/use-tenant";

/** The body as the push carries it: plain text (payloads.strip_to_text). */
function plain(html: string) {
  if (typeof window === "undefined") return html;
  return (
    new DOMParser().parseFromString(html, "text/html").body.textContent ?? ""
  ).trim();
}

/** A phone's lock screen showing the announcement as a push notification:
 *  her app's icon and name, the title in bold, the body clipped as phones do. */
export function PushPreview({ title, body }: { title: string; body: string }) {
  const tr = useTranslations("admin.messages.compose.preview");
  const brand = useTenant()?.brand_name || "";
  const text = plain(body);
  return (
    <figure className="space-y-2">
      <figcaption className="text-center text-xs text-muted-foreground">
        {tr("caption")}
      </figcaption>
      <div className="mx-auto aspect-[9/19] w-full max-w-[17rem] rounded-[2.5rem] border-[6px] border-neutral-900 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950 p-3 shadow-xl">
        <div className="mx-auto h-5 w-20 rounded-full bg-black" />
        <div className="mt-6 text-center text-white">
          <div className="text-xs font-medium opacity-80">{tr("date")}</div>
          <div className="text-5xl font-semibold tracking-tight">9:41</div>
        </div>
        <div className="mt-8 rounded-2xl bg-white/80 p-2.5 text-neutral-900 shadow backdrop-blur">
          <div className="flex items-start gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- same-origin dynamic icon route */}
            <img
              src="/pwa-icon?size=192"
              alt=""
              className="h-8 w-8 shrink-0 rounded-lg"
            />
            <div className="min-w-0 flex-1 text-[13px] leading-snug">
              <div className="flex justify-between gap-2">
                <span className="truncate font-semibold">
                  {title.trim() || brand || tr("title")}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-500">
                  {tr("now")}
                </span>
              </div>
              {text ? (
                <p className="line-clamp-4 break-words">{text}</p>
              ) : (
                <p className="text-neutral-500">{tr("body")}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
