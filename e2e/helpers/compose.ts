import { execFileSync } from "node:child_process";
import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export function manage(args: string[]): string {
  try {
    return execFileSync(
      "docker",
      ["compose", "exec", "-T", "django", "python", "manage.py", ...args],
      { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    const detail = (e.stderr || e.stdout || e.message || "").toString().trim();
    throw new Error(`manage.py ${args.join(" ")} failed: ${detail}`);
  }
}
