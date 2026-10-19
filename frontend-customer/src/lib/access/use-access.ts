"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clientFetch } from "@/lib/api-client";
import { ApiError } from "@/types/api";
import { parsePrice, type AccessPayload, type Ways } from "@/lib/access/ways";

const base = (kind: string, id: number) =>
  `/api/v1/admin/access/${kind}/${id}/`;

/**
 * An item's ways in. `id` null is an item not created yet: the choices for a
 * new one. The owning form saves with `save(id)` (after it has an id) and
 * shows the creator's sentence from the ApiError it throws.
 */
export function useAccess(kind: string, id: number | null) {
  const [payload, setPayload] = useState<AccessPayload | null>(null);
  const [ways, setWays] = useState<Ways | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const run = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const data = await clientFetch<AccessPayload>(
        id ? base(kind, id) : `${base(kind, 0)}?choices=1`,
      );
      if (run !== latest.current) return;
      setPayload(data);
      setWays(data.ways);
    } catch (err) {
      if (run !== latest.current) return;
      setError(
        (err instanceof ApiError && (err.data.detail as string)) ||
          "I could not load how students get this.",
      );
    } finally {
      if (run === latest.current) setLoading(false);
    }
  }, [kind, id]);

  useEffect(() => {
    setPayload(null);
    setWays(null);
    void reload();
  }, [reload]);

  const save = useCallback(
    async (itemId: number) => {
      if (!ways) return;
      // "49,90" is read as 49.90 here; the server takes a plain number.
      const buy = ways.buy && {
        ...ways.buy,
        price: parsePrice(ways.buy.price) ?? ways.buy.price,
      };
      const data = await clientFetch<AccessPayload>(base(kind, itemId), {
        method: "PUT",
        body: JSON.stringify({ ways: { ...ways, buy } }),
      });
      setPayload(data);
      setWays(data.ways);
    },
    [kind, ways],
  );

  return { payload, ways, setWays, loading, error, save, reload };
}
