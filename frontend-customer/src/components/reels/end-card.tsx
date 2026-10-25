import { QrCode } from "@/components/covers/cover-qr";
import { parseLook } from "@/lib/covers/palette";
import type { ReelEndCard } from "@/types/reels";

/** A reel's last seconds: the coach's logo, name, a line, and the site's address with its QR code, in the
 *  look's colours and fonts. Sized in container units, so the same card is the 1080 px wide picture the
 *  browser sidecar takes (/render/reel) and the one in the editor's preview. */
export function EndCard({ card }: { card: ReelEndCard }) {
  const { style } = parseLook(card.look);
  const display = `'${style.fonts.display}', Georgia, serif`;
  const body = `'${style.fonts.body}', system-ui, sans-serif`;
  const ground = card.colors.primary || "#171614";
  const ink = card.colors.primaryForeground || "#ffffff";
  return (
    <div className="h-full w-full [container-type:inline-size]">
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-[5cqw] px-[10cqw] text-center"
        style={{ background: ground, color: ink, fontFamily: body }}
      >
        {card.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage link, drawn as is
          <img
            src={card.logo}
            alt=""
            className="max-h-[24cqw] max-w-[64cqw] object-contain"
          />
        ) : null}
        <p
          className="text-[9cqw] font-bold leading-[1.05]"
          style={{ fontFamily: display }}
        >
          {card.name}
        </p>
        <p className="text-[5.2cqw] leading-snug opacity-90">{card.line}</p>
        <div className="mt-[2cqw] h-[46cqw] w-[46cqw] rounded-[4cqw] bg-white p-[3cqw]">
          <QrCode text={card.site} fill="#111111" back="#ffffff" />
        </div>
        <p className="text-[5.6cqw] font-semibold tracking-wide">{card.host}</p>
      </div>
    </div>
  );
}
