// Push reminders at 6 am, noon and 7 pm Medellín time (11:00, 17:00 and 00:00 UTC).
import webpush from "web-push";
import { db, env, dayNum, getUser, APP_URL } from "../lib/core.mjs";
import { PLAN, PARTS, label } from "../lib/plan.mjs";

function message(slot, d, p) {
  const [ref] = PLAN[d - 1];
  if (slot === "morning") return { title: `Day ${d} · 40 Days`, body: `Good morning! Your morning reading: ${label(PARTS[d - 1][0])}.` };
  if (slot === "midday") {
    if (p.m && p.d) return null;
    return { title: "Midday reading", body: p.m ? `Time for your midday reading: ${label(PARTS[d - 1][1])}.` : `Still time to catch up: ${ref}.` };
  }
  if (p.m && p.d && p.n) return null;
  return { title: "Finish today strong", body: `Your night reading: ${label(PARTS[d - 1][2])}. Close the day with the Word.` };
}

export default async () => {
  const pub = env("VAPID_PUBLIC"), priv = env("VAPID_PRIVATE");
  if (!pub || !priv) return console.warn("VAPID keys not set");
  webpush.setVapidDetails("mailto:" + env("BREVO_SENDER", "hola@realglobal.org"), pub, priv);
  const h = new Date().getUTCHours();
  const slot = h >= 9 && h < 15 ? "morning" : h >= 15 && h < 21 ? "midday" : "night";
  const d = dayNum();
  if (d < 1 || d > 40) return;
  const store = db();
  const { blobs } = await store.list({ prefix: "push/" });
  let sent = 0;
  await Promise.all(blobs.map(async ({ key }) => {
    const rec = await store.get(key, { type: "json" });
    if (!rec) return;
    const u = await getUser(rec.email);
    if (!u) return store.delete(key);
    const msg = message(slot, d, (u.progress || {})[d] || {});
    if (!msg) return;
    try {
      await webpush.sendNotification(rec.sub, JSON.stringify({ ...msg, url: `${APP_URL()}/?day=${d}` }), { TTL: 4 * 3600 });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await store.delete(key);
      else console.error("push failed", e.statusCode, e.body);
    }
  }));
  console.log(`reminders ${slot} day ${d}: sent ${sent} of ${blobs.length}`);
};

export const config = { schedule: "0 0,11,17 * * *" };
