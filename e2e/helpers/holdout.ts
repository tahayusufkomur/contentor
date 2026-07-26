import { createHash } from "node:crypto";

/**
 * Mirror of backend/apps/core/onboarding/experiments.py::assign_wizard_bucket.
 * The wizard's A/B bucket is a pure function of the signup email + region, so a
 * spec that wants a specific flow must pick an email that hashes into it —
 * otherwise every signup lands in a coin-flip flow and the spec is flaky by
 * construction.
 */
export function wizardBucket(email: string, region = "global"): "control" | "treatment" {
  const digest = createHash("sha256").update(`${email}:${region}`, "utf8").digest();
  return digest[digest.length - 1] & 1 ? "treatment" : "control";
}

/**
 * An email of the form `<prefix><n>@example.com` that lands in `want`. Half of
 * all candidates match, so this returns within a couple of iterations.
 */
export function bucketedEmail(prefix: string, want: "control" | "treatment", region = "global"): string {
  for (let n = 0; n < 100; n += 1) {
    const email = `${prefix}${n}@example.com`;
    if (wizardBucket(email, region) === want) return email;
  }
  throw new Error(`no ${want} email found for prefix ${prefix}`);
}
