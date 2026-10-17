import { env, environmentName } from "@/lib/env";
import { DEFAULT_A, DEFAULT_CNAME } from "@/lib/domains";

/**
 * The few calls the platform makes to Vercel's REST API, to put a client's
 * own domain on the project (and take it off). One POST or GET each; no SDK.
 * The token lives only in Vercel's environment settings, never in the
 * database or the browser.
 */

export type VercelConfig = { token: string; projectId: string; teamId?: string; environmentId?: string };

/**
 * All set → domains go on Vercel automatically. Token without project (or the reverse) is a misconfiguration.
 * Production never uses OI_VERCEL_ENVIRONMENT_ID, even if it's ticked there by mistake: that would put a
 * client's real domain on staging's environment, serving staging's fake data.
 */
export function vercelConfig(): VercelConfig | null {
  const e = env();
  if (!e.OI_VERCEL_TOKEN && !e.OI_VERCEL_PROJECT_ID) return null;
  if (!e.OI_VERCEL_TOKEN || !e.OI_VERCEL_PROJECT_ID) throw new Error("Vercel domains are half configured: set both OI_VERCEL_TOKEN and OI_VERCEL_PROJECT_ID.");
  const environmentId = environmentName() === "production" ? undefined : e.OI_VERCEL_ENVIRONMENT_ID;
  return { token: e.OI_VERCEL_TOKEN, projectId: e.OI_VERCEL_PROJECT_ID, teamId: e.OI_VERCEL_TEAM_ID, environmentId };
}

export class VercelError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(cfg: VercelConfig, method: string, path: string, body?: unknown): Promise<T> {
  const url = new URL(`https://api.vercel.com${path}`);
  if (cfg.teamId) url.searchParams.set("teamId", cfg.teamId);
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${cfg.token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } } & T;
  if (!res.ok) throw new VercelError(res.status, json.error?.code ?? "unknown", json.error?.message ?? `Vercel answered ${res.status}`);
  return json;
}

const project = (cfg: VercelConfig) => `/v10/projects/${encodeURIComponent(cfg.projectId)}`;
const projectV9 = (cfg: VercelConfig) => `/v9/projects/${encodeURIComponent(cfg.projectId)}`;

export type ProjectDomain = {
  name: string;
  verified: boolean;
  redirect?: string | null;
  customEnvironmentId?: string | null;
  gitBranch?: string | null;
  verification?: { type: string; domain: string; value: string; reason?: string }[];
};

/**
 * Staging and production share one Vercel project, so a domain on it may
 * belong to the other side. Ours: on our environment (staging's custom
 * one, or none for production) and not tied to a branch. Anything else is
 * never adopted, redirected or removed from here.
 */
export function onOurSide(cfg: VercelConfig, d: Pick<ProjectDomain, "customEnvironmentId" | "gitBranch">): boolean {
  return (d.customEnvironmentId ?? null) === (cfg.environmentId ?? null) && !d.gitBranch;
}

const ELSEWHERE = "That domain is set up on the other side of output/input (live or staging).";

/** The host as it stands on the project, if it's there and on our side; null when it isn't there or isn't ours. */
export async function ourProjectDomain(cfg: VercelConfig, name: string): Promise<ProjectDomain | null> {
  try {
    const d = await getProjectDomain(cfg, name);
    return onOurSide(cfg, d) ? d : null;
  } catch (err) {
    if (err instanceof VercelError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Put a host on the project (on staging's environment when set), maybe redirecting to another.
 * Already there on our side is fine (`created: false`); on the other side it's refused untouched.
 */
export async function addProjectDomain(cfg: VercelConfig, name: string, redirect?: string): Promise<ProjectDomain & { created: boolean }> {
  try {
    const d = await call<ProjectDomain>(cfg, "POST", `${project(cfg)}/domains`, {
      name,
      ...(redirect ? { redirect, redirectStatusCode: 308 } : {}),
      ...(cfg.environmentId ? { customEnvironmentId: cfg.environmentId } : {}),
    });
    return { ...d, created: true };
  } catch (err) {
    if (err instanceof VercelError && err.status === 409 && /already.*(project|assigned)|domain_already_in_use_by_project|domain_already_exists/i.test(`${err.code} ${err.message}`)) {
      const existing = await getProjectDomain(cfg, name).catch(() => null);
      if (existing && !onOurSide(cfg, existing)) throw new VercelError(409, "domain_in_other_environment", ELSEWHERE);
      // On our side already: make sure it redirects the way it should, and carry on.
      if (existing) {
        if ((existing.redirect ?? null) !== (redirect ?? null)) return { ...(await setRedirect(cfg, name, redirect ?? null)), created: false };
        return { ...existing, created: false };
      }
    }
    throw err;
  }
}

export async function getProjectDomain(cfg: VercelConfig, name: string): Promise<ProjectDomain> {
  return call<ProjectDomain>(cfg, "GET", `${projectV9(cfg)}/domains/${encodeURIComponent(name)}`);
}

export async function setRedirect(cfg: VercelConfig, name: string, redirect: string | null): Promise<ProjectDomain> {
  return call<ProjectDomain>(cfg, "PATCH", `${projectV9(cfg)}/domains/${encodeURIComponent(name)}`, { redirect, redirectStatusCode: redirect ? 308 : null });
}

/** Ask Vercel to check an ownership (TXT) record again. */
export async function verifyProjectDomain(cfg: VercelConfig, name: string): Promise<ProjectDomain> {
  return call<ProjectDomain>(cfg, "POST", `${projectV9(cfg)}/domains/${encodeURIComponent(name)}/verify`);
}

/** Off the project. Not there is fine; on the other side (live vs staging) it's left alone. */
export async function removeProjectDomain(cfg: VercelConfig, name: string): Promise<void> {
  if (!(await ourProjectDomain(cfg, name))) return;
  try {
    await call(cfg, "DELETE", `${projectV9(cfg)}/domains/${encodeURIComponent(name)}`);
  } catch (err) {
    if (err instanceof VercelError && err.status === 404) return;
    throw err;
  }
}

/** Whether DNS for a host reaches Vercel, and the records Vercel recommends for it. */
export async function domainConfig(cfg: VercelConfig, name: string): Promise<{ misconfigured: boolean; a: string[]; cname: string[] }> {
  const r = await call<{ misconfigured?: boolean; recommendedIPv4?: { rank: number; value: string[] }[]; recommendedCNAME?: { rank: number; value: string }[] }>(cfg, "GET", `/v6/domains/${encodeURIComponent(name)}/config`);
  const a = [...(r.recommendedIPv4 ?? [])].sort((x, y) => x.rank - y.rank).flatMap((x) => x.value);
  const cname = [...(r.recommendedCNAME ?? [])].sort((x, y) => x.rank - y.rank).map((x) => x.value.replace(/\.$/, ""));
  return { misconfigured: r.misconfigured !== false, a: [...new Set([...a, DEFAULT_A])], cname: [...new Set([...cname, DEFAULT_CNAME])] };
}
