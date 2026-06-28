// scripts/screenshot-map/auth.js
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

function sessionCookie(jwt, host) {
  return {
    name: "contentor_access_token",
    value: jwt,
    domain: host,
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  };
}

function mintSessionJwt(role, tenantSlug) {
  const args = [
    "compose", "exec", "-T", "django",
    "python", "manage.py", "issue_login_token", "--role", role,
  ];
  if (tenantSlug) args.push("--tenant", tenantSlug);
  try {
    return execFileSync("docker", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || "").toString().trim();
    throw new Error(`issue_login_token failed for role=${role}: ${detail}`);
  }
}

async function getContext(browser, { role, host, tenantSlug }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (role !== "anon") {
    const jwt = mintSessionJwt(role, role === "superadmin" ? "" : tenantSlug);
    await context.addCookies([sessionCookie(jwt, host)]);
  }
  return context;
}

module.exports = { sessionCookie, mintSessionJwt, getContext, REPO_ROOT };
