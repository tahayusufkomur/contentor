import { cn } from "@/lib/utils";
import { Img, Txt, imageUrl, itemsOf } from "../kit";
import type { SectionProps } from "../types";
import { FILL, Kicker, PopSection, WRAP, str } from "./ui";

type Item = { title?: string; text?: string };

const TILE: (keyof typeof FILL)[] = [
  "lime",
  "pink",
  "lilac",
  "sun",
  "berry",
  "plum",
];

/** Each tile's shape takes a swatch that pops against the tile. */
const SHAPE_FILL: Record<string, string> = {
  lime: "var(--primary)",
  pink: "var(--accent)",
  lilac: "var(--pop-pink)",
  sun: "var(--primary)",
  berry: "var(--accent)",
  plum: "var(--pop-pink)",
};

/** Small cut-paper shapes, one per tile (decorative). */
const SHAPES = [
  <circle key="c" cx="24" cy="24" r="19" />,
  <path
    key="f"
    d="M24 4c4 0 5 7 9 9s11-1 11 5-6 6-6 6 6 1 6 7-7 4-11 6-5 9-9 9-5-7-9-9-11 1-11-5 6-6 6-6-6-1-6-7 7-4 11-6 5-9 9-9z"
  />,
  <path key="h" d="M5 30a19 19 0 0 1 38 0z" />,
  <path key="p" d="M18 5h12v13h13v12H30v13H18V30H5V18h13z" />,
  <rect
    key="r"
    x="9"
    y="9"
    width="30"
    height="30"
    rx="9"
    transform="rotate(45 24 24)"
  />,
  <path key="t" d="M24 6l19 34H5z" strokeLinejoin="round" />,
];

/** lg grid is 3 columns: the image (if any) spans 2 rows, the first tile spans
 *  2 columns, and the last tile stretches so every row closes cleanly. */
function spans(n: number, withImage: boolean) {
  const lg: number[] = Array.from({ length: n }, (_, i) => (i === 0 ? 2 : 1));
  const rem = ((withImage ? 2 : 0) + lg.reduce((a, b) => a + b, 0)) % 3;
  if (n > 1 && rem === 1) lg[n - 1] = 3;
  if (n > 1 && rem === 2) lg[n - 1] = 2;
  const smOdd = ((withImage ? 2 : 0) + n) % 2 === 1;
  return lg.map((s, i) =>
    cn(
      s === 2 && "lg:col-span-2",
      s === 3 && "lg:col-span-3",
      s === 1 && "lg:col-span-1",
      smOdd && i === n - 1 ? "sm:col-span-2" : "sm:col-span-1",
    ),
  );
}

/** Bento of colour tiles in different sizes, all ink-outlined. */
export function BenefitsBento({ block, editable }: SectionProps) {
  const items = itemsOf<Item>(block, "items");
  const withImage = Boolean(imageUrl(block.image));
  const cls = spans(items.length, withImage);
  return (
    <PopSection bg="var(--background)" className="py-20 md:py-28">
      <div className={WRAP}>
        <div className="grid items-end gap-x-12 gap-y-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Kicker block={block} editable={editable} fill="pink" />
            <Txt
              block={block}
              field="heading"
              editable={editable}
              as="h2"
              className="pop-display pop-h2 mt-6"
              placeholder="Heading"
            />
          </div>
          <Txt
            block={block}
            field="intro"
            editable={editable}
            as="p"
            className="pop-lede max-w-[32rem] text-muted-foreground lg:col-span-5 lg:pb-2"
          />
        </div>

        <ul className="mt-14 grid grid-flow-dense gap-5 sm:grid-cols-2 md:mt-16 lg:grid-cols-3 lg:gap-6">
          {withImage && (
            <li className="row-span-2 sm:col-span-1 lg:col-span-1">
              <div className="pop-card h-full min-h-[22rem] overflow-hidden">
                <Img
                  value={block.image}
                  alt={str(block.heading)}
                  className="h-full min-h-[22rem] w-full"
                />
              </div>
            </li>
          )}
          {items.map((it, i) => {
            const fill = TILE[i % TILE.length];
            const wide = i === 0 || cls[i].includes("lg:col-span-3");
            const darkTile = fill === "berry" || fill === "plum";
            return (
              <li
                key={i}
                className={cn(
                  "pop-card relative flex min-h-[15rem] flex-col justify-end overflow-hidden p-6 pt-24 sm:pt-28 md:p-8 md:pt-32",
                  FILL[fill],
                  cls[i],
                )}
              >
                <svg
                  viewBox="0 0 48 48"
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rotate-12 sm:h-32 sm:w-32 md:h-36 md:w-36"
                  style={{
                    fill: SHAPE_FILL[fill],
                    stroke: "var(--foreground)",
                    strokeWidth: 1.2,
                  }}
                >
                  {SHAPES[i % SHAPES.length]}
                </svg>
                <div className="relative">
                  <h3
                    className={cn(
                      "pop-h3",
                      wide
                        ? "text-[clamp(1.75rem,1.2rem+1.6vw,2.5rem)]"
                        : "text-[1.75rem]",
                    )}
                  >
                    {it.title}
                  </h3>
                  <p
                    className={cn(
                      "mt-3 max-w-[34rem] text-base leading-relaxed",
                      darkTile ? "opacity-90" : "text-muted-foreground",
                    )}
                  >
                    {it.text}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </PopSection>
  );
}
