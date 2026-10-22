// Shared helpers for the 40 Days (English) functions: storage, auth, dates and email.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";
import { chaptersRead, daysDone } from "./plan.mjs";

export const env = (k, d = "") => (globalThis.Netlify ? Netlify.env.get(k) : process.env[k]) || d;
export const db = () => getStore({ name: "real40en", consistency: "strong" });
export const APP_URL = () => env("APP_URL", "https://40days.realglobal.org");

// ---------- dates: the plan runs on Medellín time (UTC-5, no DST)
export const START_UTC = Date.UTC(2026, 9, 7);
export function dayNum(now = new Date()) {
  const bog = new Date(now.getTime() - 5 * 3600e3);
  const t = Date.UTC(bog.getUTCFullYear(), bog.getUTCMonth(), bog.getUTCDate());
  return Math.floor((t - START_UTC) / 864e5) + 1;
}

// ---------- json responses
export const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
export const fail = (error, status = 400) => json({ error }, status);

// ---------- passwords and tokens
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const a = Buffer.from(hash, "hex"), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const secret = () => {
  const s = env("SESSION_SECRET");
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
};
const sign = (s) => crypto.createHmac("sha256", secret()).update(s).digest("base64url");
export function makeToken(email) {
  const body = Buffer.from(JSON.stringify({ e: email, x: Date.now() + 120 * 864e5 })).toString("base64url");
  return `${body}.${sign(body)}`;
}
export function readToken(token) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = sign(body);
  if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(body, "base64url").toString());
    return x > Date.now() ? e : null;
  } catch { return null; }
}
export const hashId = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
export const randomId = (n = 12) => crypto.randomBytes(n).toString("base64url");
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const randomCode = (n) => Array.from(crypto.randomBytes(n), (b) => CODE_ABC[b % CODE_ABC.length]).join("");

// ---------- users
export const userKey = (email) => `users/${email.toLowerCase()}`;
export async function getUser(email) {
  return email ? db().get(userKey(email), { type: "json" }) : null;
}
export const saveUser = (u) => db().setJSON(userKey(u.email), u);
const listEnv = (k) => env(k).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const isAdmin = (email) => listEnv("ADMIN_EMAILS").includes(email);
export function publicUser(u) {
  return {
    name: u.name, email: u.email, progress: u.progress || {}, version: u.version || "NIV",
    admin: isAdmin(u.email), consent: !!u.consent, code: u.code, comms: !!u.comms,
    whatsapp: u.whatsapp || "", church: u.church, country: u.country, city: u.city,
    wants_prayer: !!u.wants_prayer, wants_jesus: !!u.wants_jesus,
  };
}
export async function allUsers() {
  const store = db();
  const { blobs } = await store.list({ prefix: "users/" });
  const out = [];
  for (let i = 0; i < blobs.length; i += 50) {
    const batch = await Promise.all(blobs.slice(i, i + 50).map((b) => store.get(b.key, { type: "json" })));
    out.push(...batch.filter(Boolean));
  }
  return out;
}
export function summarize(u) {
  return { days: daysDone(u.progress), chapters: chaptersRead(u.progress) };
}

// ---------- email (Brevo)
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export async function sendEmail({ to, subject, html, versions, replyTo }) {
  const key = env("BREVO_KEY");
  if (!key) { console.warn("BREVO_KEY not set; email skipped:", subject); return false; }
  const body = {
    sender: { email: env("BREVO_SENDER", "hola@realglobal.org"), name: "40 Days · Iglesia Real" },
    subject, htmlContent: html,
    ...(versions ? { messageVersions: versions } : { to: Array.isArray(to) ? to : [to] }),
    ...(replyTo ? { replyTo } : {}),
  };
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) console.error("Brevo error", r.status, await r.text());
  return r.ok;
}
export function emailLayout(title, inner, cta) {
  const btn = cta ? `<p style="margin:28px 0 8px"><a href="${cta.href}" style="background:#23232F;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;display:inline-block">${esc(cta.label)}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#EEF2F8;font-family:Helvetica,Arial,sans-serif;color:#23232F">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
<p style="font-weight:800;letter-spacing:.08em;font-size:13px;margin:0 0 18px">IGLESIA REAL · 40 DAYS</p>
<div style="background:#fff;border-radius:22px;padding:26px 24px">
<h1 style="font-size:26px;line-height:1.2;margin:0 0 14px">${title}</h1>
<div style="font-size:16px;line-height:1.6;color:#4A4A5C">${inner}</div>${btn}
</div>
<p style="font-size:12px;color:#77778A;margin:18px 6px">You're getting this because you signed up for 40 Days at ${esc(APP_URL().replace(/^https?:\/\//, ""))}. Iglesia Real · Calle 19A #27-250, Medellín, Colombia.</p>
</div></body></html>`;
}
export const conexionEmails = () => listEnv("CONEXION_EMAILS");
