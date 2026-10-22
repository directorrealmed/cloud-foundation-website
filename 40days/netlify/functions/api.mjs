// JSON API for the 40 Days (English) app, served at /api/*.
import {
  db, env, json, fail, dayNum, APP_URL, hashPassword, checkPassword, makeToken, readToken, hashId, randomId, randomCode,
  getUser, saveUser, userKey, publicUser, isAdmin, allUsers, summarize, sendEmail, emailLayout, esc, conexionEmails, syncContact,
} from "../lib/core.mjs";
import { PLAN } from "../lib/plan.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATS = ["Request", "Gratitude", "Testimony"];
const later = (ctx, p) => (ctx?.waitUntil ? ctx.waitUntil(p) : p);
const clip = (s, n) => String(s ?? "").trim().slice(0, n);

async function auth(req) {
  const h = req.headers.get("authorization") || "";
  const email = readToken(h.startsWith("Bearer ") ? h.slice(7) : "");
  return email ? getUser(email) : null;
}

// ---------- public
async function getConfig() {
  return json({
    zoom: { hora: env("ZOOM_TIME"), link: env("ZOOM_LINK") },
    whatsapp_channel: env("WHATSAPP_CHANNEL"),
    vapid: env("VAPID_PUBLIC"),
    ended: dayNum() > 41,
  });
}
async function stats() {
  const store = db();
  const cached = await store.get("meta/stats", { type: "json" });
  if (cached && Date.now() - cached.ts < 3 * 60e3) return json(cached.data);
  const users = await allUsers();
  const data = {
    people: users.length,
    countries: new Set(users.map((u) => u.country).filter(Boolean)).size,
    chapters: users.reduce((n, u) => n + summarize(u).chapters, 0),
  };
  await store.setJSON("meta/stats", { ts: Date.now(), data });
  return json(data);
}

// ---------- accounts
async function signup(b, ctx) {
  const email = clip(b.email, 120).toLowerCase(), name = clip(b.name, 80);
  if (!name) return fail("Enter your name.");
  if (!EMAIL_RE.test(email)) return fail("Enter a valid email.");
  if (String(b.password || "").length < 6) return fail("Your password needs at least 6 characters.");
  if (!b.consent) return fail("To create your account, please check the consent box.");
  const token = makeToken(email);
  const store = db();
  let code = randomCode(6);
  while (!(await store.setJSON(`codes/${code}`, { email }, { onlyIfNew: true })).modified) code = randomCode(6);
  const u = {
    email, name, pass: hashPassword(String(b.password)), code, createdAt: Date.now(),
    whatsapp: clip(b.whatsapp, 30), country: clip(b.country, 60), city: clip(b.city, 80),
    church: ["real", "other", "none"].includes(b.church) ? b.church : "", comms: !!b.comms,
    consent: true, consentAt: new Date().toISOString(), age_ok: !!b.age_ok,
    ref: clip(b.ref, 12) || undefined, progress: {}, version: "NIV",
  };
  const { modified } = await store.setJSON(userKey(email), u, { onlyIfNew: true });
  if (!modified) { await store.delete(`codes/${code}`); return fail("There's already an account with this email. Log in instead.", 409); }
  later(ctx, Promise.all([welcomeEmail(u), syncContact(u)]));
  return json({ token, user: publicUser(u) });
}
async function login(b) {
  const email = clip(b.email, 120).toLowerCase();
  const u = await getUser(email);
  if (!u || !checkPassword(String(b.password || ""), u.pass)) return fail("Wrong email or password.", 401);
  return json({ token: makeToken(email), user: publicUser(u) });
}
async function forgot(b) {
  const email = clip(b.email, 120).toLowerCase();
  const u = EMAIL_RE.test(email) && (await getUser(email));
  if (u) {
    const token = randomId(24);
    await db().setJSON(`resets/${token}`, { email, exp: Date.now() + 3600e3 });
    const link = `${APP_URL()}/?reset=${token}`;
    await sendEmail({
      to: { email, name: u.name }, subject: "Reset your 40 Days password",
      html: emailLayout("Reset your password", `<p>Hi ${esc(u.name.split(" ")[0])},</p><p>Tap the button to create a new password. The link works for 1 hour. If you didn't ask for this, you can ignore this email.</p>`, { href: link, label: "Create a new password" }),
    });
  }
  return json({ ok: true });
}
async function reset(b) {
  const store = db(), key = `resets/${clip(b.token, 64)}`;
  const r = await store.get(key, { type: "json" });
  if (!r || r.exp < Date.now()) return fail("This link has expired. Ask for a new one.", 400);
  if (String(b.password || "").length < 6) return fail("Your password needs at least 6 characters.");
  const u = await getUser(r.email);
  if (!u) return fail("This account no longer exists.", 404);
  u.pass = hashPassword(String(b.password));
  await saveUser(u);
  await store.delete(key);
  return json({ token: makeToken(u.email), user: publicUser(u) });
}
async function deleteMe(u, b) {
  if (!checkPassword(String(b.password || ""), u.pass)) return fail("That password isn't right.", 401);
  const store = db();
  if (u.group) await leaveGroup(u);
  const { blobs } = await store.list({ prefix: "prayers/" });
  for (const { key } of blobs) {
    const p = await store.get(key, { type: "json" });
    if (p && p.email === u.email) await store.delete(key);
  }
  await store.delete(`codes/${u.code}`);
  await store.delete(userKey(u.email));
  return json({ ok: true });
}

// ---------- prayer wall
async function listPrayers(u) {
  const store = db();
  const [{ blobs }, { blobs: prays }] = await Promise.all([store.list({ prefix: "prayers/" }), store.list({ prefix: "prays/" })]);
  const counts = {}, mineSet = new Set(), me = hashId(u.email);
  for (const { key } of prays) {
    const [, id, who] = key.split("/");
    counts[id] = (counts[id] || 0) + 1;
    if (who === me) mineSet.add(id);
  }
  const items = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean);
  const admin = isAdmin(u.email);
  const prayers = items
    .filter((p) => admin || (p.reports || []).length < 3 || p.email === u.email)
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 200)
    .map((p) => ({
      id: p.id, text: p.text, cat: p.cat, firma: p.anon ? "Anonymous" : p.firma, createdAt: p.createdAt,
      count: counts[p.id] || 0, praying: mineSet.has(p.id), mine: p.email === u.email, reported: (p.reports || []).includes(me),
    }));
  return json({ prayers });
}
async function postPrayer(u, b) {
  const text = clip(b.text, 500);
  if (text.length < 3) return fail("Write your request before posting.");
  const id = randomId(9);
  await db().setJSON(`prayers/${id}`, {
    id, text, cat: CATS.includes(b.cat) ? b.cat : "Request", anon: !!b.anon,
    firma: u.name.split(" ")[0], email: u.email, createdAt: Date.now(), reports: [],
  });
  return json({ ok: true, id });
}
async function prayerAction(u, id, action, method) {
  const store = db(), key = `prayers/${id}`;
  const p = await store.get(key, { type: "json" });
  if (!p) return fail("This request no longer exists.", 404);
  if (method === "DELETE" && !action) {
    if (p.email !== u.email && !isAdmin(u.email)) return fail("You can only delete your own requests.", 403);
    await store.delete(key);
    const { blobs } = await store.list({ prefix: `prays/${id}/` });
    await Promise.all(blobs.map((x) => store.delete(x.key)));
    return json({ ok: true });
  }
  if (action === "pray") {
    const pk = `prays/${id}/${hashId(u.email)}`;
    const was = await store.get(pk);
    if (was !== null) await store.delete(pk); else await store.set(pk, "1");
    const { blobs } = await store.list({ prefix: `prays/${id}/` });
    return json({ praying: was === null, count: blobs.length });
  }
  if (action === "report") {
    const me = hashId(u.email);
    if (!(p.reports || []).includes(me)) { p.reports = [...(p.reports || []), me]; await store.setJSON(key, p); }
    return json({ ok: true });
  }
  return fail("Not found", 404);
}

// ---------- reading groups
async function groupOf(u) {
  return u.group ? db().get(`groups/${u.group}`, { type: "json" }) : null;
}
async function leaveGroup(u) {
  const store = db(), g = await groupOf(u);
  if (g) {
    g.members = g.members.filter((m) => m !== u.email);
    if (g.members.length) await store.setJSON(`groups/${g.code}`, g); else await store.delete(`groups/${g.code}`);
  }
  delete u.group;
  await saveUser(u);
}
async function myGroup(u) {
  const g = await groupOf(u);
  if (!g) return json({ group: null });
  const today = Math.min(40, Math.max(1, dayNum()));
  const members = (await Promise.all(g.members.map(getUser))).filter(Boolean).map((m) => ({
    name: m.name.split(" ")[0], me: m.email === u.email, days: summarize(m).days, today: (m.progress || {})[today] || {},
  }));
  return json({ group: { name: g.name, code: g.code }, members });
}
async function createGroup(u, b) {
  const name = clip(b.name, 60);
  if (!name) return fail("Give your group a name.");
  if (u.group) await leaveGroup(u);
  const store = db();
  let code = randomCode(5);
  while (!(await store.setJSON(`groups/${code}`, { code, name, owner: u.email, members: [u.email], createdAt: Date.now() }, { onlyIfNew: true })).modified) code = randomCode(5);
  u.group = code;
  await saveUser(u);
  return json({ group: { name, code } });
}
async function joinGroup(u, b) {
  const code = clip(b.code, 10).toUpperCase(), store = db();
  const g = await store.get(`groups/${code}`, { type: "json" });
  if (!g) return fail("We couldn't find a group with that code.", 404);
  if (u.group === code) return json({ group: { name: g.name, code } });
  if (g.members.length >= 30) return fail("This group is full.");
  if (u.group) await leaveGroup(u);
  g.members = [...new Set([...g.members, u.email])];
  await store.setJSON(`groups/${code}`, g);
  u.group = code;
  await saveUser(u);
  return json({ group: { name: g.name, code } });
}

// ---------- pastoral follow-up
async function intent(u, b, ctx) {
  const kind = b.kind === "jesus" ? "jesus" : "pray";
  if (b.whatsapp) u.whatsapp = clip(b.whatsapp, 30);
  if (kind === "jesus") u.wants_jesus = true; else u.wants_prayer = true;
  await saveUser(u);
  const note = clip(b.note, 500), at = new Date().toISOString();
  await db().setJSON(`intents/${at}-${randomId(4)}`, { kind, note, email: u.email, name: u.name, whatsapp: u.whatsapp, country: u.country, city: u.city, church: u.church, at });
  const to = conexionEmails().map((email) => ({ email }));
  if (to.length) later(ctx, sendEmail({
    to, replyTo: { email: u.email, name: u.name },
    subject: kind === "jesus" ? `40 Days (English): ${u.name} wants to receive Jesus` : `40 Days (English): ${u.name} asked for prayer`,
    html: emailLayout(kind === "jesus" ? "Someone wants to receive Jesus" : "New prayer request", `
<p><b>${esc(u.name)}</b> · ${esc(u.email)}<br>WhatsApp: ${esc(u.whatsapp || "—")}<br>${esc([u.city, u.country].filter(Boolean).join(", "))} · Church: ${esc(u.church || "—")}</p>
${note ? `<p style="white-space:pre-wrap;background:#F3F4F8;padding:12px 14px;border-radius:12px">${esc(note)}</p>` : ""}
<p>From the English site (${esc(APP_URL())}). Please reply in English.</p>`),
  }));
  return json({ user: publicUser(u) });
}

// ---------- admin
async function exportCsv(u) {
  if (!isAdmin(u.email)) return fail("Only the team can do this.", 403);
  const users = await allUsers();
  const cols = ["name", "email", "whatsapp", "country", "city", "church", "comms", "wants_prayer", "wants_jesus", "days", "chapters", "createdAt", "ref"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = users.sort((a, b) => a.createdAt - b.createdAt).map((x) => {
    const s = summarize(x);
    return [x.name, x.email, x.whatsapp, x.country, x.city, x.church, !!x.comms, !!x.wants_prayer, !!x.wants_jesus, s.days, s.chapters, new Date(x.createdAt).toISOString(), x.ref].map(q).join(",");
  });
  return new Response([cols.join(","), ...rows].join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" } });
}

// ---------- emails
async function welcomeEmail(u) {
  const d = Math.min(40, Math.max(1, dayNum()));
  const [ref, , focus] = PLAN[d - 1];
  const mid = dayNum() > 1
    ? `<p>People from around the world joined the challenge of 40 days of fasting and the Word on October 7, so today is <b>Day ${d}</b>: ${esc(ref)}. Start with today's reading and read alongside everyone; you can go back to earlier days whenever you have time.</p>`
    : `<p>We start on October 7 with Genesis 1 – 30.</p>`;
  await sendEmail({
    to: { email: u.email, name: u.name }, subject: "Welcome to 40 Days",
    html: emailLayout(`Welcome, ${esc(u.name.split(" ")[0])}!`, `<p>You're in. Over 40 days we'll read the whole Bible together: three 30-minute readings a day (morning, midday and night).</p>${mid}<p style="font-style:italic">${esc(focus)}</p><p>Tip: on your phone, add the app to your Home Screen so it's one tap away and you can turn on reading reminders.</p>`, { href: `${APP_URL()}/`, label: "Open 40 Days" }),
  });
}

export default async (req, ctx) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const [a, b, c] = parts, m = req.method;
  let body = {};
  if (m !== "GET" && m !== "HEAD") { try { body = await req.json(); } catch {} }
  try {
    if (a === "config" && m === "GET") return getConfig();
    if (a === "stats" && m === "GET") return stats();
    if (a === "signup" && m === "POST") return signup(body, ctx);
    if (a === "login" && m === "POST") return login(body);
    if (a === "forgot" && m === "POST") return forgot(body);
    if (a === "reset" && m === "POST") return reset(body);
    if (a === "waitlist" && m === "POST") {
      const email = clip(body.email, 120).toLowerCase();
      if (!EMAIL_RE.test(email)) return fail("Enter a valid email.");
      await db().setJSON(`waitlist/${email}`, { email, name: clip(body.name, 80), consent: !!body.consent, at: new Date().toISOString() });
      return json({ ok: true });
    }

    const u = await auth(req);
    if (!u) return fail("Your session ended. Please log in again.", 401);
    if (a === "me") {
      if (m === "GET") return json({ user: publicUser(u) });
      if (m === "PATCH") { if ("comms" in body) u.comms = !!body.comms; await saveUser(u); later(ctx, syncContact(u)); return json({ user: publicUser(u) }); }
      if (m === "DELETE") { const r = await deleteMe(u, body); if (r.ok) later(ctx, syncContact(u, { remove: true })); return r; }
    }
    if (a === "progress" && m === "PUT") {
      const prog = {};
      for (let d = 1; d <= 40; d++) {
        const p = body.progress?.[d];
        if (p && typeof p === "object") prog[d] = Object.fromEntries(["m", "d", "n", "z", "a"].filter((k) => p[k]).map((k) => [k, true]));
      }
      u.progress = prog;
      if (["NIV", "KJV", "ESV", "NLT"].includes(body.version)) u.version = body.version;
      await saveUser(u);
      return json({ ok: true });
    }
    if (a === "consent" && m === "POST") { u.consent = true; u.consentAt = new Date().toISOString(); await saveUser(u); return json({ ok: true }); }
    if (a === "prayers") {
      if (!b && m === "GET") return listPrayers(u);
      if (!b && m === "POST") return postPrayer(u, body);
      if (b) return prayerAction(u, b, c, m);
    }
    if (a === "groups") {
      if (b === "mine" && m === "GET") return myGroup(u);
      if (!b && m === "POST") return createGroup(u, body);
      if (b === "join" && m === "POST") return joinGroup(u, body);
      if (b === "leave" && m === "POST") { await leaveGroup(u); return json({ ok: true }); }
    }
    if (a === "intent" && m === "POST") return intent(u, body, ctx);
    if (a === "push") {
      const store = db();
      if (b === "subscribe" && m === "POST") {
        const sub = body.sub;
        if (!sub?.endpoint || !sub?.keys) return fail("Invalid subscription.");
        await store.setJSON(`push/${hashId(sub.endpoint)}`, { sub, email: u.email });
        return json({ ok: true });
      }
      if (b === "unsubscribe" && m === "POST") { await store.delete(`push/${hashId(String(body.endpoint || ""))}`); return json({ ok: true }); }
    }
    if (a === "admin" && b === "export" && m === "GET") return exportCsv(u);
    return fail("Not found", 404);
  } catch (e) {
    console.error(e);
    return fail("Something went wrong. Please try again.", 500);
  }
};

export const config = { path: "/api/*" };
