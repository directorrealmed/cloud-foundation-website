# 40 Days (English)

English edition of Iglesia Real's 40 Días app: read the whole Bible in 40 days
(October 7 – November 15, 2026). Live at https://40days.realglobal.org
(Netlify project `real-40-days`). This folder is its own site; the Cloud
Foundation site blocks `/40days/*`.

- `public/` static app (single page `index.html`, privacy page, service worker)
- `netlify/functions/api.mjs` JSON API at `/api/*` (accounts, progress, prayer wall, groups, follow-up, CSV export for admins)
- `netlify/functions/reminders.mjs` push reminders, 6 am / noon / 7 pm Medellín time
- `netlify/functions/daily-emails.mjs` daily reading email via Brevo, 6:30 am Medellín time
- `netlify/lib/plan.mjs` the 40-day plan, generated from `public/index.html`; keep both in sync

Data lives in the Netlify Blobs store `real40en`.

Environment variables (Netlify project settings): `SESSION_SECRET`, `VAPID_PUBLIC`,
`VAPID_PRIVATE`, `BREVO_KEY`, `BREVO_SENDER`, `ADMIN_EMAILS`, `CONEXION_EMAILS`,
`WHATSAPP_CHANNEL`, `ZOOM_TIME`, `ZOOM_LINK`, `APP_URL`, `BREVO_LIST_ID` (English sign-ups, list 5), `BREVO_LIST_RECURSOS` (English resources opt-in, list 6).

Deploy from this folder (`netlify deploy --prod` once linked to `real-40-days`).
