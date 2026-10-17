# Hand-off: finish the Ad Grants launch from the Mac

(Done 2026-10-15–17 except where noted in the PR; the branch is now based on the live redesign.) Paste everything below the line into Claude Code running **locally on the Mac** (Claude desktop app → Code → choose this repo on your computer, not a cloud environment). If the Claude Chrome extension is connected, Claude can do the browser steps; you type passwords and 2FA codes.

---

You are finishing the Google Ad Grants launch for Cloud Foundation Inc. (cloudfoundation.us, a US 501(c)(3) working in Colombia; $10,000/month Google Ad Grant; account CTR must stay >= 5% every month). Confirm with me before anything that changes the LIVE site or live Google Ads settings.

**Context — read first**
- Run `git fetch origin && git checkout ad-grants-setup`, then read `ads/README.md` (the playbook).
- That branch has: `js/track.js` (conversion tracking; IDs empty at top), working Netlify forms → `/thanks/`, `404.html`, `sitemap.xml`, `robots.txt`, phone link fixed to (786) 205-8800, restyled privacy page, `netlify.toml` (301s `/page.html` → `/page/`, blocks `/ads/*`), `ads/campaigns/*.csv` (built by `ads/build/build_campaigns.py`) and `ads/scripts/grant-guardian.js`.
- **The live site is NOT deployed from this repo.** Netlify project `cloud-foundation-preview` (site id f25b0563-5f01-447c-9d8c-b83175c08183) serves cloudfoundation.us from manual uploads of flat files (index.html, about.html, contact.html, kitchen.html, centers.html, colombia.html, serve.html, 404.html). Latest live deploy is "About page rewrite (Joel)", Oct 13 2026, id 6ace58637d282845af34f04e. Deploying the repo blindly would lose that rewrite.
- An empty review project already exists: `cloud-foundation-adgrants-preview` (site id 57662f7d-4131-4dd7-b453-003a09e53e5c).

**Steps**
1. **Merge the live files.**
   - Run `netlify login` and download live deploy 6ace58637d282845af34f04e (Dashboard → Deploys → that deploy → Download).
   - Diff each live page against the branch's `*/index.html`.
   - Port live-only content, at least the About rewrite, into the branch. Keep the branch's fixes: the track.js include, the form attributes, the hidden gclid/utm inputs, canonicals and the tel link.
   - Ask me whether URLs stay flat `.html` (then revert the canonicals and drop the 301 rule) or move to folders.
   - Commit.
2. **Preview deploy.**
   - Make a temp copy of the site without `ads/`, and add a `_headers` file there with `/*` → `X-Robots-Tag: noindex` (do not commit it).
   - Run `netlify deploy --prod --dir <copy> --site 57662f7d-4131-4dd7-b453-003a09e53e5c`.
   - Show me the URL, then test every page, both forms, and that `/ads/README.md` returns 404.
3. **Zeffy.**
   - Create three donation forms:
     - "Street Kitchen — El Calvario, Cali": $5 / $75 / $750 / $2,250
     - "Transformation Centers": $50 / $500 / $5,000 / $20,000
     - "Where Needed Most"
   - If Zeffy allows a post-payment redirect, set it to `https://cloudfoundation.us/thanks/?d=1`.
   - Add "Give by card" buttons on `/give`, `/kitchen`, `/centers` and the home page.
4. **GA4 + Google Ads.**
   - Create a GA4 web property and put its `G-` ID in `js/track.js`.
   - Link GA4 to Google Ads.
   - Import as **primary** conversions: `donate_click`, `generate_lead`, `donation_complete`. As **secondary**: `contact_click`, `view_give_page`.
   - Never make a pageview or time-on-site conversion primary.
5. **Go live, only after I approve the preview.**
   - Deploy to site f25b0563-5f01-447c-9d8c-b83175c08183.
   - Check Netlify Forms → Spam: the live forms show 0 verified submissions but recent timestamps.
   - Enable form email notifications to director@cloudfoundation.us.
   - Open a PR merging `ad-grants-setup` into master so GitHub matches live.
6. **Campaigns.**
   - In Google Ads Editor, go to Account → Import → From file and import, in order:
     1. `1-campaigns.csv`
     2. `2-keywords.csv`
     3. `3-negative-keyword-lists.csv`, as shared lists applied to all campaigns
     4. `4-responsive-search-ads.csv`
     5. `5-sitelinks-account.csv` and `6-callouts-account.csv`, at account level
   - Settings: Maximize conversions, Search only, United States, English.
   - Post only with my approval, and keep campaigns **paused** until a test conversion shows up, then enable them.
7. **Guard script.**
   - Google Ads → Tools → Bulk actions → Scripts: paste `ads/scripts/grant-guardian.js` and authorize.
   - Run it once with DRY_RUN true and show me the log.
   - Then set DRY_RUN false, create a blank Google Sheet for SPREADSHEET_URL, and schedule it daily at about 5am.
   - Also add the automated rule: pause enabled keywords with Quality Score < 3, daily at 11pm.
8. **Survey safety.**
   - Add a second admin in Google for Nonprofits so the annual Ad Grants survey is never missed.
   - Add calendar reminders: yearly for the survey, monthly for the review.

**Done means:**
- the preview is approved
- the live site is deployed with tracking and card forms
- a test conversion is visible in GA4 and Google Ads
- the campaigns are imported and enabled
- the guard script is scheduled
- I get a short summary of anything still pending
