import { serverFetch } from "@/lib/api-server";
import type { Block } from "@/types/tenant";
import type { DynamicDataKey } from "./types";
import { dynamicKeysForBlocks } from "./registry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DynamicData = Partial<Record<DynamicDataKey, any>>;

/**
 * Fetch (server-side) only the datasets referenced by the page's enabled
 * blocks. A page with no dynamic blocks makes zero extra requests. Each fetch
 * is independent — one failing endpoint leaves its slice undefined and the
 * block renders its own empty state rather than failing the page.
 */
export async function fetchDynamicData(blocks: Block[]): Promise<DynamicData> {
  const keys = dynamicKeysForBlocks(blocks);
  const out: DynamicData = {};
  await Promise.all(
    [...keys].map(async (key) => {
      try {
        switch (key) {
          case "courses":
            out.courses = await serverFetch("/api/v1/courses/");
            break;
          case "plans":
            out.plans = await serverFetch("/api/v1/billing/plans/");
            break;
          case "events": {
            const now = new Date();
            const to = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
            const fmt = (d: Date) => d.toISOString().split("T")[0];
            out.events = await serverFetch(
              `/api/v1/calendar/?from=${fmt(now)}&to=${fmt(to)}`,
            );
            break;
          }
          case "storeProducts":
            out.storeProducts = await serverFetch("/api/v1/billing/store/");
            break;
        }
      } catch {
        // leave this slice undefined — the block shows its own empty state
      }
    }),
  );
  return out;
}
