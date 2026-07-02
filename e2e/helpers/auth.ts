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

async function roleContext(browser: Browser, role: string, host: string, tenant?: string) {
  const args = ["issue_login_token", "--role", role];
  if (tenant) args.push("--tenant", tenant);
  const jwt = manage(args);
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
