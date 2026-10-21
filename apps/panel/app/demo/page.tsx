import type { Metadata } from "next";
import Link from "next/link";
import { Arrow } from "@/components/Arrow";
import { DemoPlayer } from "@/components/demo/DemoPlayer";

export const metadata: Metadata = {
  title: "Demo",
  description: "Watch Vera review a pull request, then review it yourself. A scripted demo with a fictional shop.",
};

// Copy is a draft in Nahuel's voice, for him to edit.
export default function Demo() {
  return (
    <>
      <div className="page-head">
        <p className="eyebrow">Demo</p>
        <h1>Watch Vera review a pull request, then review it yourself</h1>
        <p className="lede">
          A scripted run on a made-up shop&apos;s pull request. Vera maps the change, applies the team&apos;s rules,
          briefs each role, and checks that you understood it before you approve. Then everyone signs off at once.
        </p>
      </div>

      <DemoPlayer />

      <section className="section" aria-labelledby="real">
        <div className="grid-2">
          <div>
            <h2 id="real" style={{ marginBottom: 12 }}>What&apos;s real here</h2>
            <p className="muted">
              The run plays from a trace in the same format the real agents will write: every agent, tool call and model
              call, with its tokens and time. Costs come from the price table Vera uses. When the agents run on real pull
              requests, their traces play in this same viewer.
            </p>
          </div>
          <div>
            <h2 style={{ marginBottom: 12 }}>What&apos;s made up</h2>
            <p className="muted">
              Larkspur, its people and the pull request are fictional. The steps and numbers are illustrative, not
              measured: Vera hasn&apos;t run on real code yet.{" "}
              <Link href="/#status">Where it&apos;s at<Arrow /></Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
