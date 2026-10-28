// Who has signed off, from what happened on the PR: approving reviews and
// `/vera sign-off` comments (Nahuel's call, 28 Oct 2026: both count, since
// GitHub won't let authors approve their own PRs). Plain code: a role is
// signed off when someone Vera asked for it has signed off, nothing else.

import { ROLES, type Role } from "./config.ts";
import type { Ask } from "./route.ts";

/** What happened on the PR, oldest first. `trusted` is GitHub's word that
 * the person can write to the repo (owner, member or collaborator). */
export type SignoffEvent =
  | { kind: "review"; who: string; state: string; trusted: boolean }
  | { kind: "comment"; who: string; roles: Role[] | "all"; trusted: boolean };

export type RoleStatus = { role: Role; asked: string[]; by?: string; byAuthor?: boolean };
export type Signoff = { roles: RoleStatus[]; done: boolean };

const COMMAND = /^\s*\/vera\s+sign-?off\b([^\n]*)/im;
const ALIASES: Record<string, Role> = { engineering: "engineer", engineers: "engineer", designer: "design", documentation: "docs", pm: "product" };

/** The roles a comment signs off for: "all" for a bare `/vera sign-off`,
 * the named ones for `/vera sign-off design docs`, null if it isn't one. */
export function parseSignoff(body: string): Role[] | "all" | null {
  const m = COMMAND.exec(body);
  if (!m) return null;
  const roles = [...new Set(m[1]!.toLowerCase().split(/[\s,]+/).map((w) => ALIASES[w] ?? w).filter((w): w is Role => (ROLES as readonly string[]).includes(w)))];
  return roles.length ? roles : "all";
}

const login = (handle: string) => handle.replace(/^@/, "").toLowerCase();
const isTeam = (handle: string) => handle.includes("/");

export function signoff(asks: Ask[], author: string, events: SignoffEvent[]): Signoff {
  // Each person's signed-off roles, replayed in order: an approval covers all
  // their roles, a comment the ones it names, a request for changes clears them.
  const state = new Map<string, { all: boolean; roles: Set<Role>; trusted: boolean }>();
  for (const e of events) {
    const who = login(e.who);
    const s = state.get(who) ?? { all: false, roles: new Set<Role>(), trusted: e.trusted };
    if (e.kind === "review" && e.state === "APPROVED") s.all = true;
    else if (e.kind === "review" && e.state === "CHANGES_REQUESTED") {
      s.all = false;
      s.roles.clear();
    } else if (e.kind === "comment") {
      if (e.roles === "all") s.all = true;
      else for (const r of e.roles) s.roles.add(r);
    }
    state.set(who, s);
  }
  const signed = (who: string, role: Role) => {
    const s = state.get(who);
    return !!s && (s.all || s.roles.has(role));
  };

  const byRole = new Map<Role, string[]>();
  for (const a of asks) byRole.set(a.role, [...(byRole.get(a.role) ?? []), a.who]);
  const roles: RoleStatus[] = [...byRole].map(([role, asked]) => {
    let by = asked.filter((h) => !isTeam(h)).map(login).find((h) => signed(h, role));
    // Vera can't read team membership with the default token, so a team's
    // part is signed off by anyone with write access other than the author.
    if (!by && asked.some(isTeam)) by = [...state.keys()].find((h) => h !== login(author) && state.get(h)!.trusted && signed(h, role));
    return { role, asked, ...(by ? { by: `@${by}`, byAuthor: by === login(author) } : {}) };
  });
  return { roles, done: roles.every((r) => r.by) };
}

/** Whether a sign-off from this person counts for any of these roles: they
 * were asked for one, or a team was and they can write to the repo. */
export function counts(asks: Ask[], author: string, who: string, trusted: boolean, roles: Role[] | "all"): boolean {
  return asks.some((a) => (roles === "all" || roles.includes(a.role)) &&
    (isTeam(a.who) ? trusted && login(who) !== login(author) : login(a.who) === login(who)));
}
