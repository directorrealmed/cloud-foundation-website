/**
 * GRANT GUARDIAN — Cloud Foundation Inc. Google Ad Grants compliance + CTR autopilot
 *
 * Paste into Google Ads → Tools → Bulk actions → Scripts → (+) New script.
 * Authorise, run once with DRY_RUN = true, read the log/email, then set
 * DRY_RUN = false and schedule it DAILY (early morning). Optionally add a second
 * copy scheduled HOURLY with HOURLY_MODE = true during the last 7 days of a
 * month that is close to the 5% line.
 *
 * What it does every run
 *   1. Measures account CTR month-to-date and projects month end.
 *   2. Enforces the Ad Grants rules it can enforce by itself:
 *        - pauses keywords with Quality Score 1 or 2
 *        - pauses single-word keywords that are not on the brand allowlist
 *   3. Protects CTR (self-modifying layer):
 *        - pauses keywords that have had a fair chance and still have low CTR
 *        - adds exact-match negatives for search terms that get shown but not clicked
 *        - pauses a responsive search ad that trails its sibling badly (keeps >= 2)
 *        - EMERGENCY: if month-to-date CTR is under the safety line, pauses the
 *          worst keywords (by CTR) until projected CTR is back above it
 *   4. Audits what it cannot fix and tells you: campaigns with < 2 ad groups,
 *      ad groups with < 2 ads, campaigns with < 2 sitelinks, campaigns with no
 *      location targeting, zero conversions in 30 days, under-spending the grant.
 *   5. Labels everything it touches ("AG Guard: …") so every change is reversible,
 *      logs a row to a Google Sheet and emails a summary.
 *
 * Nothing is deleted. Every change is a pause or a negative keyword, and is labelled.
 */

var CONFIG = {
  DRY_RUN: true,                         // true = report only, change nothing
  EMAIL: 'director@cloudfoundation.us',  // comma-separate for more people
  SPREADSHEET_URL: '',                   // optional: a blank Google Sheet URL for the daily log
  HOURLY_MODE: false,                    // true = only run the CTR emergency check

  // Ad Grants line is 5.00%. We steer to a higher line so a bad week never threatens it.
  GRANT_MIN_CTR: 0.05,
  SAFETY_CTR: 0.065,                     // emergency trimming starts below this
  KEYWORD_CTR_FLOOR: 0.03,               // a keyword under this after MIN_IMPR is paused
  KEYWORD_MIN_IMPR: 200,                 // ... once it has had this many impressions (30 days)
  KEYWORD_CONV_PROTECT_CTR: 0.02,        // converting keywords are kept down to this CTR

  SEARCH_TERM_MIN_IMPR: 40,              // search term shown this often ...
  SEARCH_TERM_MAX_CTR: 0.015,            // ... with CTR under this and no conversions → negative

  AD_MIN_IMPR: 1000,                     // ads compared once both have this many impressions
  AD_RELATIVE_FLOOR: 0.6,                // an ad under 60% of its best sibling's CTR is paused

  MAX_ACTIONS_PER_RUN: 40,               // hard cap on changes per run
  EMERGENCY_MAX_PAUSES: 25,

  // Single-word keywords are allowed only for your own brand (and a few Google exceptions).
  SINGLE_WORD_ALLOWLIST: ['cloudfoundation', 'cloudfoundation.us', 'fundacioncloud'],
  // Any keyword or ad group with this label is never touched by the guard.
  PROTECT_LABEL: 'AG Protect',

  GRANT_MONTHLY_BUDGET: 10000,
};

var LABELS = {
  QS: 'AG Guard: QS<=2',
  ONE_WORD: 'AG Guard: single word',
  LOW_CTR: 'AG Guard: low CTR',
  EMERGENCY: 'AG Guard: emergency',
  AD: 'AG Guard: weak ad',
};

var actions = [];
var warnings = [];
var budgetLeft = CONFIG.MAX_ACTIONS_PER_RUN;

function main() {
  ensureLabels();
  var protectedKw = protectedKeywordKeys();

  var mtd = accountStats('THIS_MONTH');
  var last7 = accountStats('LAST_7_DAYS');
  var conv30 = accountStats('LAST_30_DAYS').conversions;

  if (!CONFIG.HOURLY_MODE) {
    enforceQualityScore(protectedKw);
    enforceSingleWord(protectedKw);
    pauseLowCtrKeywords(protectedKw);
    negateDeadSearchTerms();
    pauseWeakAds();
    auditStructure(conv30, mtd);
  }
  emergencyTrim(mtd, protectedKw);

  report(mtd, last7, conv30);
}

/* ---------------------------------------------------------------- stats */

function accountStats(range) {
  var it = AdsApp.search(
    'SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions ' +
    'FROM customer WHERE segments.date DURING ' + range);
  var s = { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
  while (it.hasNext()) {
    var m = it.next().metrics;
    s.impressions += Number(m.impressions || 0);
    s.clicks += Number(m.clicks || 0);
    s.cost += Number(m.costMicros || 0) / 1e6;
    s.conversions += Number(m.conversions || 0);
  }
  s.ctr = s.impressions ? s.clicks / s.impressions : 0;
  return s;
}

function keywordRows(range) {
  var q =
    'SELECT campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ' +
    'ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ' +
    'ad_group_criterion.quality_info.quality_score' +
    (range ? ', metrics.impressions, metrics.clicks, metrics.conversions' : '') +
    ' FROM keyword_view WHERE campaign.status = ENABLED AND ad_group.status = ENABLED ' +
    'AND ad_group_criterion.status = ENABLED AND ad_group_criterion.negative = FALSE' +
    (range ? ' AND segments.date DURING ' + range : '');
  var it = AdsApp.search(q);
  var rows = [];
  while (it.hasNext()) {
    var r = it.next();
    var m = r.metrics || {};
    var impr = Number(m.impressions || 0), clicks = Number(m.clicks || 0);
    rows.push({
      campaign: r.campaign.name,
      adGroupId: r.adGroup.id,
      adGroup: r.adGroup.name,
      id: r.adGroupCriterion.criterionId,
      text: r.adGroupCriterion.keyword.text,
      match: r.adGroupCriterion.keyword.matchType,
      qs: r.adGroupCriterion.qualityInfo ? r.adGroupCriterion.qualityInfo.qualityScore : null,
      impressions: impr,
      clicks: clicks,
      conversions: Number(m.conversions || 0),
      ctr: impr ? clicks / impr : 0,
    });
  }
  return rows;
}

/* ---------------------------------------------------------- enforcement */

function enforceQualityScore(protectedKw) {
  keywordRows(null).forEach(function (k) {
    if (k.qs && k.qs <= 2 && !protectedKw[key(k)]) {
      pauseKeyword(k, LABELS.QS, 'Quality Score ' + k.qs + ' (Ad Grants forbids QS 1–2)');
    }
  });
}

function enforceSingleWord(protectedKw) {
  var allow = {};
  CONFIG.SINGLE_WORD_ALLOWLIST.forEach(function (w) { allow[w.toLowerCase()] = true; });
  keywordRows(null).forEach(function (k) {
    var words = k.text.replace(/[+"\[\]]/g, '').trim().split(/\s+/);
    if (words.length === 1 && !allow[words[0].toLowerCase()] && !protectedKw[key(k)]) {
      pauseKeyword(k, LABELS.ONE_WORD, 'single-word keyword (Ad Grants rule)');
    }
  });
}

function pauseLowCtrKeywords(protectedKw) {
  keywordRows('LAST_30_DAYS').forEach(function (k) {
    if (protectedKw[key(k)] || k.impressions < CONFIG.KEYWORD_MIN_IMPR) return;
    var floor = k.conversions > 0 ? CONFIG.KEYWORD_CONV_PROTECT_CTR : CONFIG.KEYWORD_CTR_FLOOR;
    if (k.ctr < floor) {
      pauseKeyword(k, LABELS.LOW_CTR,
        'CTR ' + pct(k.ctr) + ' on ' + k.impressions + ' impressions (floor ' + pct(floor) + ')');
    }
  });
}

function negateDeadSearchTerms() {
  var it = AdsApp.search(
    'SELECT campaign.name, ad_group.id, search_term_view.search_term, search_term_view.status, ' +
    'metrics.impressions, metrics.clicks, metrics.conversions FROM search_term_view ' +
    'WHERE segments.date DURING LAST_30_DAYS AND campaign.status = ENABLED ' +
    'AND ad_group.status = ENABLED AND metrics.impressions >= ' + CONFIG.SEARCH_TERM_MIN_IMPR);
  while (it.hasNext()) {
    var r = it.next();
    var term = r.searchTermView.searchTerm;
    var status = r.searchTermView.status;
    if (status === 'EXCLUDED' || status === 'ADDED_EXCLUDED') continue;
    var impr = Number(r.metrics.impressions), clicks = Number(r.metrics.clicks);
    var conv = Number(r.metrics.conversions || 0);
    if (conv > 0 || clicks / impr >= CONFIG.SEARCH_TERM_MAX_CTR) continue;
    if (term.split(/\s+/).length > 10 || term.length > 80) continue; // keyword length limits
    act('Negative [' + term + '] in ' + r.campaign.name + ' › ' + r.adGroup.id +
        ' — ' + impr + ' impr, CTR ' + pct(clicks / impr), function () {
      var ag = AdsApp.adGroups().withIds([r.adGroup.id]).get();
      if (ag.hasNext()) ag.next().createNegativeKeyword('[' + term + ']');
    });
  }
}

function pauseWeakAds() {
  var it = AdsApp.search(
    'SELECT ad_group.id, ad_group.name, ad_group_ad.ad.id, metrics.impressions, metrics.clicks ' +
    'FROM ad_group_ad WHERE ad_group_ad.status = ENABLED AND ad_group.status = ENABLED ' +
    'AND campaign.status = ENABLED AND segments.date DURING LAST_30_DAYS');
  var groups = {};
  while (it.hasNext()) {
    var r = it.next();
    var g = groups[r.adGroup.id] = groups[r.adGroup.id] || { name: r.adGroup.name, ads: [] };
    var impr = Number(r.metrics.impressions);
    g.ads.push({ id: r.adGroupAd.ad.id, impr: impr, ctr: impr ? Number(r.metrics.clicks) / impr : 0 });
  }
  var enabledCounts = adCountsByAdGroup();
  Object.keys(groups).forEach(function (gid) {
    var g = groups[gid];
    if ((enabledCounts[gid] || 0) < 3) return; // never drop below 2 ads
    var mature = g.ads.filter(function (a) { return a.impr >= CONFIG.AD_MIN_IMPR; });
    if (mature.length < 2) return;
    mature.sort(function (a, b) { return b.ctr - a.ctr; });
    var worst = mature[mature.length - 1];
    if (worst.ctr < mature[0].ctr * CONFIG.AD_RELATIVE_FLOOR) {
      act('Pause ad ' + worst.id + ' in "' + g.name + '" — CTR ' + pct(worst.ctr) +
          ' vs best ' + pct(mature[0].ctr) + '. Write a replacement using the winner\'s angle.',
        function () {
          var ads = AdsApp.ads().withIds([[gid, worst.id]]).get();
          if (ads.hasNext()) { var ad = ads.next(); ad.pause(); ad.applyLabel(LABELS.AD); }
        });
    }
  });
}

/* --------------------------------------------------------- emergency */

function emergencyTrim(mtd, protectedKw) {
  var day = new Date().getDate();
  if (day < 4 || mtd.impressions < 1000 || mtd.ctr >= CONFIG.SAFETY_CTR) return;

  warnings.push('EMERGENCY: month-to-date CTR ' + pct(mtd.ctr) + ' is under the safety line ' +
    pct(CONFIG.SAFETY_CTR) + '. Trimming the lowest-CTR keywords.');

  var rows = keywordRows('THIS_MONTH').filter(function (k) {
    return k.impressions >= 30 && !protectedKw[key(k)] && k.ctr < CONFIG.SAFETY_CTR;
  });
  rows.sort(function (a, b) { return a.ctr - b.ctr; });

  var impr = mtd.impressions, clicks = mtd.clicks, paused = 0;
  for (var i = 0; i < rows.length && clicks / impr < CONFIG.SAFETY_CTR; i++) {
    if (paused >= CONFIG.EMERGENCY_MAX_PAUSES) break;
    var k = rows[i];
    impr -= k.impressions;
    clicks -= k.clicks;
    pauseKeyword(k, LABELS.EMERGENCY, 'emergency trim, CTR ' + pct(k.ctr) + ' this month');
    paused++;
  }
  if (impr > 0) {
    warnings.push('Projected CTR after trim (if those impressions had never happened): ' +
      pct(clicks / impr) + '. Remaining days will pull the real number up toward the new mix.');
  }
}

/* ------------------------------------------------------------ audits */

function auditStructure(conv30, mtd) {
  var agByCampaign = {}, campaigns = {};
  var it = AdsApp.search('SELECT campaign.id, campaign.name, ad_group.id FROM ad_group ' +
    'WHERE campaign.status = ENABLED AND ad_group.status = ENABLED');
  while (it.hasNext()) {
    var r = it.next();
    campaigns[r.campaign.id] = r.campaign.name;
    agByCampaign[r.campaign.id] = (agByCampaign[r.campaign.id] || 0) + 1;
  }
  Object.keys(campaigns).forEach(function (cid) {
    if (agByCampaign[cid] < 2) warnings.push('Campaign "' + campaigns[cid] + '" has fewer than 2 active ad groups (Ad Grants rule).');
  });

  var counts = adCountsByAdGroup(), names = adGroupNames();
  Object.keys(names).forEach(function (gid) {
    if ((counts[gid] || 0) < 2) warnings.push('Ad group "' + names[gid] + '" has fewer than 2 active ads (Ad Grants rule).');
  });

  // Sitelinks: account-level ones count for every campaign.
  var accountSitelinks = countRows('SELECT customer_asset.asset FROM customer_asset ' +
    "WHERE customer_asset.field_type = 'SITELINK' AND customer_asset.status = ENABLED");
  var siteByCampaign = {};
  it = AdsApp.search('SELECT campaign.id FROM campaign_asset ' +
    "WHERE campaign_asset.field_type = 'SITELINK' AND campaign_asset.status = ENABLED AND campaign.status = ENABLED");
  while (it.hasNext()) { var c = it.next().campaign.id; siteByCampaign[c] = (siteByCampaign[c] || 0) + 1; }
  Object.keys(campaigns).forEach(function (cid) {
    if ((siteByCampaign[cid] || 0) + accountSitelinks < 2) {
      warnings.push('Campaign "' + campaigns[cid] + '" has fewer than 2 sitelinks (Ad Grants rule).');
    }
  });

  var geo = {};
  it = AdsApp.search('SELECT campaign.id FROM campaign_criterion ' +
    "WHERE campaign_criterion.type = 'LOCATION' AND campaign_criterion.negative = FALSE AND campaign.status = ENABLED");
  while (it.hasNext()) geo[it.next().campaign.id] = true;
  Object.keys(campaigns).forEach(function (cid) {
    if (!geo[cid]) warnings.push('Campaign "' + campaigns[cid] + '" has no location targeting (Ad Grants requires relevant geo-targeting).');
  });

  if (conv30 < 1) warnings.push('No conversions recorded in the last 30 days. Check the tag on cloudfoundation.us and the GA4 import.');

  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var pace = mtd.cost / now.getDate() * daysInMonth;
  if (now.getDate() >= 7 && pace < CONFIG.GRANT_MONTHLY_BUDGET * 0.5) {
    warnings.push('Spending pace ' + money(pace) + '/month of the ' + money(CONFIG.GRANT_MONTHLY_BUDGET) +
      ' grant. Add high-intent ad groups (see ads/campaigns) rather than loosening match types.');
  }
}

/* ----------------------------------------------------------- helpers */

function pauseKeyword(k, label, why) {
  act('Pause keyword ' + k.match + ' "' + k.text + '" (' + k.campaign + ' › ' + k.adGroup + ') — ' + why,
    function () {
      var kws = AdsApp.keywords().withIds([[k.adGroupId, k.id]]).get();
      if (kws.hasNext()) { var kw = kws.next(); kw.pause(); kw.applyLabel(label); }
    });
}

function act(description, fn) {
  if (budgetLeft <= 0) { warnings.push('Action cap reached; skipped: ' + description); return; }
  budgetLeft--;
  actions.push((CONFIG.DRY_RUN ? '[DRY RUN] ' : '') + description);
  if (!CONFIG.DRY_RUN) {
    try { fn(); } catch (e) { warnings.push('Failed: ' + description + ' — ' + e); }
  }
}

function ensureLabels() {
  if (CONFIG.DRY_RUN) return;
  var existing = {};
  var it = AdsApp.labels().get();
  while (it.hasNext()) existing[it.next().getName()] = true;
  Object.keys(LABELS).map(function (k) { return LABELS[k]; }).concat([CONFIG.PROTECT_LABEL])
    .forEach(function (n) { if (!existing[n]) AdsApp.createLabel(n); });
}

function protectedKeywordKeys() {
  var out = {};
  var labels = AdsApp.labels().withCondition("label.name = '" + CONFIG.PROTECT_LABEL + "'").get();
  if (!labels.hasNext()) return out;
  var it = labels.next().keywords().get();
  while (it.hasNext()) {
    var kw = it.next();
    out[kw.getAdGroup().getId() + '~' + kw.getId()] = true;
  }
  return out;
}

function adCountsByAdGroup() {
  var out = {};
  var it = AdsApp.search('SELECT ad_group.id FROM ad_group_ad WHERE ad_group_ad.status = ENABLED ' +
    'AND ad_group.status = ENABLED AND campaign.status = ENABLED');
  while (it.hasNext()) { var id = it.next().adGroup.id; out[id] = (out[id] || 0) + 1; }
  return out;
}

function adGroupNames() {
  var out = {};
  var it = AdsApp.search('SELECT ad_group.id, ad_group.name FROM ad_group ' +
    'WHERE ad_group.status = ENABLED AND campaign.status = ENABLED');
  while (it.hasNext()) { var r = it.next(); out[r.adGroup.id] = r.adGroup.name; }
  return out;
}

function countRows(q) { var n = 0, it = AdsApp.search(q); while (it.hasNext()) { it.next(); n++; } return n; }
function key(k) { return k.adGroupId + '~' + k.id; }
function pct(x) { return (x * 100).toFixed(2) + '%'; }
function money(x) { return '$' + Math.round(x).toLocaleString('en-US'); }

/* ------------------------------------------------------------ report */

function report(mtd, last7, conv30) {
  var status = mtd.ctr >= CONFIG.SAFETY_CTR ? 'SAFE' : mtd.ctr >= CONFIG.GRANT_MIN_CTR ? 'WATCH' : 'AT RISK';
  var lines = [
    'Cloud Foundation — Ad Grants guard (' + (CONFIG.DRY_RUN ? 'dry run' : 'live') + ')',
    '',
    'Status: ' + status,
    'Month-to-date CTR: ' + pct(mtd.ctr) + '  (' + mtd.clicks + ' clicks / ' + mtd.impressions + ' impressions)',
    'Last 7 days CTR:   ' + pct(last7.ctr),
    'Spend MTD: ' + money(mtd.cost) + '   Conversions (30d): ' + conv30.toFixed(1),
    '',
    'Changes (' + actions.length + '):',
  ].concat(actions.length ? actions.map(function (a) { return ' • ' + a; }) : [' • none'])
   .concat(['', 'Needs a human (' + warnings.length + '):'])
   .concat(warnings.length ? warnings.map(function (w) { return ' • ' + w; }) : [' • nothing']);

  var body = lines.join('\n');
  Logger.log(body);

  if (CONFIG.SPREADSHEET_URL) {
    var sh = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL).getSheets()[0];
    if (sh.getLastRow() === 0) sh.appendRow(['Date', 'Status', 'MTD CTR', '7d CTR', 'MTD impr', 'MTD clicks', 'MTD spend', 'Conv 30d', 'Changes', 'Warnings']);
    sh.appendRow([new Date(), status, mtd.ctr, last7.ctr, mtd.impressions, mtd.clicks, mtd.cost, conv30,
      actions.join('\n'), warnings.join('\n')]);
  }

  var urgent = status !== 'SAFE' || warnings.length > 0;
  if (CONFIG.EMAIL && (urgent || !CONFIG.HOURLY_MODE)) {
    MailApp.sendEmail(CONFIG.EMAIL, '[Ad Grants ' + status + '] CTR ' + pct(mtd.ctr) + ' — ' +
      actions.length + ' changes, ' + warnings.length + ' to review', body);
  }
}
