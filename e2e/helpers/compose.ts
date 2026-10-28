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

/** Set a tenant's site language and drop its cached config (300 s), or the frontends keep the old one. */
export function setSiteLanguage(schema: string, lang: string): void {
  manage([
    "shell",
    "-c",
    "from django.core.cache import cache\n" +
      "from django_tenants.utils import schema_context\n" +
      "from apps.tenant_config.models import TenantConfig\n" +
      `with schema_context('${schema}'):\n` +
      `    TenantConfig.objects.update(default_locale='${lang}')\n` +
      `cache.delete('tenant:${schema}:config')`,
  ]);
}
