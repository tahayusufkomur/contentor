import { useEffect, useState } from "react";

import { clientFetch } from "@/lib/api-client";

export type SetupGroup = "site" | "content" | "business" | "live" | "extras";

export interface SetupItem {
  key: string;
  group: SetupGroup;
  done: boolean;
  source: "auto" | "manual" | null;
  optional: boolean;
}

export interface SetupStatus {
  items: SetupItem[];
  progress: { done: number; total: number };
  demo_present: boolean;
  dismissed: boolean;
}

export interface DemoContent {
  present: boolean;
  counts: Record<string, number>;
  ids: Record<string, string[]>;
}

// Module-level caches: every mount point (bubble, panel, sidebar row,
// dashboard card, badges) shares one fetch and stays in sync.
let statusCache: SetupStatus | null = null;
const statusListeners = new Set<(s: SetupStatus | null) => void>();
let statusInflight: Promise<void> | null = null;

function broadcastStatus(next: SetupStatus | null) {
  statusCache = next;
  statusListeners.forEach((listener) => listener(next));
}

export function refreshSetupStatus(): Promise<void> {
  statusInflight ??= clientFetch<SetupStatus>("/api/v1/admin/setup-status/")
    .then(broadcastStatus)
    .catch(() => {}) // fail-soft: surfaces render nothing
    .finally(() => {
      statusInflight = null;
    }) as Promise<void>;
  return statusInflight;
}

export function useSetupStatus(): SetupStatus | null {
  const [status, setStatus] = useState<SetupStatus | null>(statusCache);
  useEffect(() => {
    statusListeners.add(setStatus);
    if (statusCache === null) void refreshSetupStatus();
    return () => {
      statusListeners.delete(setStatus);
    };
  }, []);
  return status;
}

export async function patchSetup(body: Record<string, unknown>): Promise<void> {
  try {
    const next = await clientFetch<SetupStatus>("/api/v1/admin/setup-status/", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    broadcastStatus(next);
  } catch {
    /* fail-soft */
  }
}

let demoCache: DemoContent | null = null;
const demoListeners = new Set<(d: DemoContent | null) => void>();
let demoInflight: Promise<void> | null = null;

function broadcastDemo(next: DemoContent | null) {
  demoCache = next;
  demoListeners.forEach((listener) => listener(next));
}

export function refreshDemoContent(): Promise<void> {
  demoInflight ??= clientFetch<DemoContent>("/api/v1/admin/demo-content/")
    .then(broadcastDemo)
    .catch(() => {})
    .finally(() => {
      demoInflight = null;
    }) as Promise<void>;
  return demoInflight;
}

export function useDemoContent(): DemoContent | null {
  const [demo, setDemo] = useState<DemoContent | null>(demoCache);
  useEffect(() => {
    demoListeners.add(setDemo);
    if (demoCache === null) void refreshDemoContent();
    return () => {
      demoListeners.delete(setDemo);
    };
  }, []);
  return demo;
}

export async function eraseDemoContent(): Promise<Record<
  string,
  number
> | null> {
  try {
    const res = await clientFetch<{ deleted: Record<string, number> }>(
      "/api/v1/admin/demo-content/erase/",
      { method: "POST" },
    );
    await Promise.all([refreshSetupStatus(), refreshDemoContent()]);
    return res.deleted;
  } catch {
    return null;
  }
}
