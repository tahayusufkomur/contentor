import { Browser, BrowserContext } from "@playwright/test";
import { manage } from "./compose";

export const MAIN = "http://localhost";
export const TENANT_HOST = "demo-yoga.localhost";
export const TENANT = `http://${TENANT_HOST}`;

function cookie(jwt: string, domain: string) {
  return {
    name: "contentor_access_token",
    value: jwt,
    domain,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
  };
}

// issue_login_token boots manage.py inside the container (~2s per call) and
// the JWTs live for days — mint once per (role, tenant) and reuse all run.
const tokenCache = new Map<string, string>();

function issueToken(role: string, tenant?: string): string {
  const key = `${role}:${tenant ?? ""}`;
  let jwt = tokenCache.get(key);
  if (!jwt) {
    const args = ["issue_login_token", "--role", role];
    if (tenant) args.push("--tenant", tenant);
    jwt = manage(args);
    tokenCache.set(key, jwt);
  }
  return jwt;
}

async function roleContext(browser: Browser, role: string, host: string, tenant?: string) {
  const jwt = issueToken(role, tenant);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies([cookie(jwt, host)]);
  return ctx;
}

export const coachContext = (b: Browser): Promise<BrowserContext> =>
  roleContext(b, "coach", TENANT_HOST, "demo-yoga");
export const studentContext = (b: Browser): Promise<BrowserContext> =>
  roleContext(b, "student", TENANT_HOST, "demo-yoga");
export const superadminContext = (b: Browser): Promise<BrowserContext> =>
  roleContext(b, "superadmin", "localhost");
