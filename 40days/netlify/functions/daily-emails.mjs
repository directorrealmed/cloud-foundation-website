// Daily email with the day's reading and each person's progress, 6:30 am Medellín time (11:30 UTC).
import { db, dayNum, allUsers, summarize, sendEmail, emailLayout, esc, APP_URL } from "../lib/core.mjs";
import { PLAN, PARTS, label } from "../lib/plan.mjs";

export default async () => {
  const d = dayNum();
  if (d < 1 || d > 40) return;
  const store = db();
  // Only one send per day, even if the schedule fires twice.
  const { modified } = await store.setJSON(`meta/emailed-${d}`, { at: new Date().toISOString() }, { onlyIfNew: true });
  if (!modified) return console.log(`day ${d} already emailed`);
  const [ref, , focus, principle] = PLAN[d - 1];
  const users = (await allUsers()).filter((u) => u.consent && u.email);
  const versions = users.map((u) => {
    const s = summarize(u), first = u.name.split(" ")[0];
    const behind = Math.max(0, d - 1 - s.days);
    const progress = s.chapters
      ? `<p>So far you've completed <b>${s.days} ${s.days === 1 ? "day" : "days"}</b> and read <b>${s.chapters.toLocaleString("en-US")} chapters</b> (${Math.round(s.chapters / 1189 * 100)}% of the Bible).${behind ? " Don't worry about the days you missed: read today's portion with everyone and catch up when you can." : " Keep going!"}</p>`
      : `<p>Haven't started yet? Today is a great day to begin. Read today's portion with everyone and catch up on earlier days when you can.</p>`;
    return {
      to: [{ email: u.email, name: u.name }],
      subject: `Day ${d}: ${ref}`,
      htmlContent: emailLayout(`Good morning, ${esc(first)}. Day ${d} of 40`, `
<p style="font-size:18px;font-weight:700;color:#23232F;margin:0 0 6px">${esc(ref)}</p>
<p>${esc(focus)}</p>
<p style="font-style:italic;color:#23232F">“${esc(principle)}”</p>
<p><b>Morning:</b> ${esc(label(PARTS[d - 1][0]))}<br><b>Midday:</b> ${esc(label(PARTS[d - 1][1]))}<br><b>Night:</b> ${esc(label(PARTS[d - 1][2]))}</p>
${progress}`, { href: `${APP_URL()}/?day=${d}`, label: `Open Day ${d}` }),
    };
  });
  for (let i = 0; i < versions.length; i += 500) {
    const chunk = versions.slice(i, i + 500);
    await sendEmail({ subject: chunk[0].subject, html: chunk[0].htmlContent, versions: chunk });
  }
  console.log(`daily email day ${d}: ${versions.length} recipients`);
};

export const config = { schedule: "30 11 * * *" };
