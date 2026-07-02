import { execFileSync } from "node:child_process";
import { manage, REPO_ROOT } from "./helpers/compose";

export default async function globalSetup() {
  // 1. Stack must be up (make dev). Fail fast with a useful message.
  const health = await fetch("http://localhost/api/health/").catch(() => null);
  if (!health || !health.ok) {
    throw new Error("Stack is not running — start it with `make dev` first.");
  }
  // 2. Idempotent seed: plans/public tenant + demo tenants (incl. demo-yoga).
  manage(["seed_plans"]);
  execFileSync("docker", ["compose", "exec", "-T", "django", "python", "manage.py", "seed_all_demos"], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}
