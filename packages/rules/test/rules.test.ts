import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, areasFor, fromCodeowners, fromVeraYml, matches, route } from "../src/index.ts";

const YML = `
lead: "@lena"
areas:
  - name: Checkout
    paths: ["src/checkout/", "app/views/cart/**"]
    description: Cart, payment and order confirmation
  - name: Search
    paths: ["src/search/"]
    lead: "@sam"
people:
  - { handle: "@ana", role: engineer, areas: [Checkout] }
  - { handle: "@dev", role: design, areas: [Checkout] }
  - { handle: "@wes", role: docs, areas: [Checkout, Search] }
`;

test("matches follows CODEOWNERS patterns", () => {
  assert.ok(matches("src/checkout/", "src/checkout/rounding.ts"));
  assert.ok(matches("*.vue", "app/a/b/Cart.vue"));
  assert.ok(matches("/docs/", "docs/setup.md"));
  assert.ok(!matches("/docs/", "src/docs/setup.md"));
  assert.ok(matches("app/views/cart/**", "app/views/cart/show.haml"));
  assert.ok(!matches("src/checkout/", "src/search/index.ts"));
});

test("reads .vera.yml and rejects mistakes with a plain message", () => {
  const o = fromVeraYml(YML);
  assert.equal(o.source, ".vera.yml");
  assert.equal(o.areas.length, 2);
  assert.equal(o.lead, "@lena");
  assert.throws(() => fromVeraYml("people:\n  - { handle: '@x', role: wizard }"), ConfigError);
  assert.throws(() => fromVeraYml("areas: [{ name: A }]\npeople:\n  - { handle: '@x', role: design, areas: [B] }"), /no area named B/);
});

test("reads CODEOWNERS, the last matching rule wins", () => {
  const o = fromCodeowners("# owners\n*.md @docs-team\nsrc/ @core\nsrc/ui/ @ui-team\n");
  assert.deepEqual([...areasFor(o, ["src/ui/Button.tsx", "src/api.ts", "README.md"])].sort(), [["@core", 1], ["@docs-team", 1], ["@ui-team", 1]]);
});

test("asks owners and the designer when Vera is sure", () => {
  const o = fromVeraYml(YML);
  const plan = route(o, ["src/checkout/rounding.ts"], [{ area: "Checkout", confidence: "high", reason: "rounding" }], { decision: true, confidence: "high", what: "new error message" });
  assert.deepEqual(plan.asks.map((a) => [a.who, a.role, a.action]), [["@ana", "engineer", "ask"], ["@dev", "design", "ask"]]);
});

test("asks the lead when Vera isn't sure, and stays quiet on design when there's no design decision", () => {
  const o = fromVeraYml(YML);
  const plan = route(o, ["src/search/index.ts"], [{ area: "Search", confidence: "medium", reason: "?" }], { decision: false, confidence: "high", what: "No design decision" });
  assert.deepEqual(plan.asks.map((a) => [a.who, a.role, a.action]), [["@sam", "engineer", "ask-lead"]]);
});

test("a design decision with no designer declared goes to the lead", () => {
  const o = fromVeraYml(YML);
  const plan = route(o, ["src/search/ui.vue"], [{ area: "Search", confidence: "high", reason: "search UI" }], { decision: true, confidence: "high", what: "new filter chips" });
  assert.ok(plan.asks.some((a) => a.who === "@sam" && a.role === "design" && a.action === "ask-lead"));
});

test("docs changes go to the area's writer", () => {
  const o = fromVeraYml(YML);
  const plan = route(o, ["src/checkout/README.md"], [{ area: "Checkout", confidence: "high", reason: "checkout docs" }], null);
  assert.ok(plan.asks.some((a) => a.who === "@wes" && a.role === "docs"));
});

test("with nothing declared, Vera names no people", () => {
  const plan = route({ source: "none", areas: [], people: [] }, ["a.ts"], [{ area: "Payments", confidence: "high", reason: "x" }], { decision: true, confidence: "high", what: "y" });
  assert.equal(plan.asks.length, 0);
  assert.match(plan.notes[0]!, /No .vera.yml or CODEOWNERS/);
});

test("unsure with no lead declared: suggest the top candidates, marked as unsure", () => {
  const o = fromCodeowners("/pkg/iam/ @access-squad @identity-squad\n/pkg/ @as-code\n");
  const plan = route(o, ["pkg/iam/user.go"], [
    { area: "@access-squad", confidence: "medium", reason: "IAM search" },
    { area: "@identity-squad", confidence: "medium", reason: "also IAM" },
    { area: "@as-code", confidence: "low", reason: "catch-all" },
  ], { decision: false, confidence: "high", what: "No design decision" });
  assert.deepEqual(plan.asks.map((a) => [a.who, a.action]), [["@access-squad", "suggest"], ["@identity-squad", "suggest"]]);
  assert.match(plan.notes.join(" "), /not a sure answer/);
});
