// The few Slack Web API calls the server makes. Form-encoded, which every
// method accepts (the read methods don't take JSON bodies).

export type Fetch = typeof fetch;
export type SlackMessage = {
  ts: string;
  text?: string;
  user?: string;
  bot_id?: string;
  thread_ts?: string;
  blocks?: unknown[];
  metadata?: { event_type?: string; event_payload?: Record<string, unknown> };
};
type Reply = { ok: boolean; error?: string; ts?: string; channel?: string; messages?: SlackMessage[]; view?: { id: string } };

export function api(token: string, fetchImpl: Fetch = fetch) {
  async function call(method: string, params: Record<string, unknown>): Promise<Reply> {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) form.set(k, typeof v === "string" ? v : JSON.stringify(v));
    const res = await fetchImpl(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const r = (await res.json()) as Reply;
    if (!r.ok) throw new Error(`Slack ${method}: ${r.error ?? "failed"}`);
    return r;
  }
  return {
    /** A thread, oldest first, with each message's metadata. */
    thread: async (channel: string, ts: string) => (await call("conversations.replies", { channel, ts, limit: 200, include_all_metadata: true })).messages ?? [],
    /** The latest messages in a conversation, newest first. */
    recent: async (channel: string) => (await call("conversations.history", { channel, limit: 50, include_all_metadata: true })).messages ?? [],
    post: async (m: { channel: string; thread_ts: string; text: string; metadata?: object }) =>
      (await call("chat.postMessage", { ...m, unfurl_links: false, unfurl_media: false })).ts!,
    update: async (m: { channel: string; ts: string; text: string }) => { await call("chat.update", m); },
    /** Opens a form (a modal) for the person who pressed a button; returns its id. */
    openView: async (trigger_id: string, view: object) => (await call("views.open", { trigger_id, view })).view!.id,
    updateView: async (view_id: string, view: object) => { await call("views.update", { view_id, view }); },
  };
}
export type Api = ReturnType<typeof api>;
