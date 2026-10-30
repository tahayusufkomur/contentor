export type ImpersonationScope = "platform" | "studio";

/** Who authorised a hand-off token ("platform" = a superadmin, "studio" = a
 *  creator opening a student's view), read from its payload before it is
 *  redeemed. Unsigned and unchecked: it only picks the language of the page
 *  that redeems it, the server decides everything else. */
export function scopeOfToken(token: string | null): ImpersonationScope | null {
  try {
    const payload = token?.split(".")[1];
    if (!payload) return null;
    const { scope } = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return scope === "platform" || scope === "studio" ? scope : null;
  } catch {
    return null;
  }
}
