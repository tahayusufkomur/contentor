import { beforeEach, describe, expect, it, vi } from "vitest";

// There is no DOM here, so React's hooks are stood in for by a one-slot memo:
// useCallback keeps its function while the deps are equal, as React does
// between renders. Without a useCallback in the hook, every call is new.
let slot: { fn: unknown; deps: unknown[] } | undefined;
const navigateProvider = vi.fn();
let locale = "tr";

vi.mock("react", async (orig) => ({
  ...(await orig<typeof import("react")>()),
  useCallback: (fn: unknown, deps: unknown[]) => {
    if (!slot || deps.some((d, i) => d !== slot!.deps[i])) slot = { fn, deps };
    return slot.fn;
  },
}));
vi.mock("next-intl", () => ({ useLocale: () => locale }));
vi.mock("@shared/navigation/navigation-provider", () => ({
  useNavigate: () => navigateProvider,
}));
vi.mock("@/components/ui/nav-link", () => ({ NavLink: () => null }));

import { useLocaleNavigate } from "@/i18n/navigation";

describe("useLocaleNavigate", () => {
  beforeEach(() => {
    slot = undefined;
    locale = "tr";
    navigateProvider.mockClear();
  });

  it("keeps its identity between renders in the same language", () => {
    // The callback page lists it in an effect's deps: a new identity would
    // re-run the effect and post the one-time sign-in token twice.
    expect(useLocaleNavigate()).toBe(useLocaleNavigate());
  });

  it("changes with the language and navigates to the localized address", () => {
    const tr = useLocaleNavigate();
    locale = "de";
    const de = useLocaleNavigate();
    expect(de).not.toBe(tr);
    de("/pricing");
    expect(navigateProvider).toHaveBeenCalledWith("/de/pricing");
  });
});
