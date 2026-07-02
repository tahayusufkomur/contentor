import { execFileSync } from "node:child_process";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export function manage(args: string[]): string {
  return execFileSync(
    "docker",
    ["compose", "exec", "-T", "django", "python", "manage.py", ...args],
    { cwd: REPO_ROOT, encoding: "utf8" }
  ).trim();
}
