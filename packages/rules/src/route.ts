// Who is asked about a change: the agents propose (which areas it touches,
// whether it makes a design decision, how sure they are); this decides, from
// what the team declared. Three outcomes per role: ask directly, ask the lead
// when Vera isn't sure, or stay quiet (BUILD-PLAN, Routing).

import { areaOf, type Ownership, type Person, type Role } from "./config.ts";

export type AreaGuess = { area: string; confidence: "high" | "medium" | "low"; reason: string };
export type DesignGuess = { decision: boolean; confidence: "high" | "medium" | "low"; what: string };

/** ask: Vera is sure. ask-lead: unsure, so the lead is asked who should
 * review. suggest: unsure and no lead declared, so its best candidates are
 * shown, marked as unsure (Nahuel's call, 25 Oct 2026). */
export type Ask = { who: string; role: Role; action: "ask" | "ask-lead" | "suggest"; why: string };
export type Plan = { asks: Ask[]; notes: string[] };

const DOCS = /(^|\/)(docs?|documentation)\/|\.mdx?$/i;

function inArea(o: Ownership, area: string, role: Role): Person[] {
  return o.people.filter((p) => p.role === role && p.areas.includes(area));
}

function leadOf(o: Ownership, area?: string): string | undefined {
  return (area && o.areas.find((a) => a.name === area)?.lead) || o.lead || o.people.find((p) => p.role === "lead")?.handle;
}

export function route(o: Ownership, paths: string[], areas: AreaGuess[], design: DesignGuess | null): Plan {
  const asks: Ask[] = [];
  const notes: string[] = [];
  const add = (a: Ask) => {
    if (!asks.some((x) => x.who === a.who && x.role === a.role)) asks.push(a);
  };
  const askLead = (role: Role, why: string, area?: string) => {
    const lead = leadOf(o, area);
    if (lead) add({ who: lead, role, action: "ask-lead", why });
    else notes.push(`${why.replace(/\.$/, "")}. No lead is declared to ask.`);
  };

  if (o.source === "none") notes.push("No .vera.yml or CODEOWNERS: Vera can name the areas but not the people.");
  const sure = areas.filter((a) => a.confidence === "high" && o.areas.some((x) => x.name === a.area));
  const top = areas[0];

  // Engineering: the owners of each area Vera is sure about; otherwise the lead.
  for (const a of sure) {
    const owners = inArea(o, a.area, "engineer");
    for (const p of owners) add({ who: p.handle, role: "engineer", action: "ask", why: `owns ${a.area}` });
    if (!owners.length) askLead("engineer", `No engineer declared for ${a.area}`, a.area);
  }
  if (!sure.length && o.source !== "none") {
    const declared = top && o.areas.some((x) => x.name === top.area);
    const why = !top ? "No declared area matches" : declared ? `Not sure which area this is (best guess ${top.area}, ${top.confidence})` : `No declared area fits (it looks like ${top.area})`;
    if (leadOf(o, top?.area)) askLead("engineer", why, top?.area);
    else {
      // No lead to ask: show the owners of the top candidates, marked as unsure.
      const candidates = areas.filter((a) => a.confidence !== "low" && o.areas.some((x) => x.name === a.area)).slice(0, 2);
      for (const a of candidates) {
        for (const p of inArea(o, a.area, "engineer")) add({ who: p.handle, role: "engineer", action: "suggest", why: `possibly ${a.area} (${a.confidence})` });
      }
      notes.push(candidates.length ? `${why}. No lead is declared, so the possible owners above are a starting point, not a sure answer.` : `${why}. No lead is declared to ask.`);
    }
  }

  // Design: only when the change makes a design decision.
  if (design?.decision) {
    const area = sure[0]?.area ?? top?.area;
    const designers = area ? inArea(o, area, "design") : [];
    if (design.confidence === "high" && designers.length) {
      for (const p of designers) add({ who: p.handle, role: "design", action: "ask", why: `design decision (${design.confidence})` });
    } else if (o.source !== "none") {
      askLead("design", designers.length ? `Might be a design decision (${design.confidence})` : `Design decision (${design.confidence}), but no designer is declared${area ? ` for ${area}` : ""}`, area);
    }
  }

  // Docs: changes to documentation go to the area's docs people.
  if (paths.some((p) => DOCS.test(p))) {
    const area = sure[0]?.area;
    const writers = area ? inArea(o, area, "docs") : o.people.filter((p) => p.role === "docs");
    for (const p of writers) add({ who: p.handle, role: "docs", action: "ask", why: "changes documentation" });
  }

  return { asks, notes };
}

/** Who should check one file in the engineer's brief: the engineers asked
 * who own the file's area, else every engineer asked (which may be the
 * lead, when Vera wasn't sure). Empty when no engineer was asked. */
export function checkerFor(o: Ownership, asks: Ask[], path: string): string[] {
  const engineers = asks.filter((a) => a.role === "engineer");
  const area = areaOf(o, path);
  const owners = area ? engineers.filter((a) => inArea(o, area, "engineer").some((p) => p.handle === a.who)) : [];
  return [...new Set((owners.length ? owners : engineers).map((a) => a.who))];
}
