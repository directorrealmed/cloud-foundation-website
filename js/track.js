/* Cloud Foundation — measurement for Google Ad Grants.
 *
 * Fill in the three IDs below once (GA4 "G-…", Google Ads "AW-…" and the
 * conversion label for "Donation intent"). Until they are filled in, nothing
 * loads and nothing is sent.
 *
 * Conversions this file reports (import them into Google Ads from GA4):
 *   donate_click     click to a Stripe donation link, or copying the Zelle address — PRIMARY
 *   donation_complete Stripe redirected here after payment (/thanks?d=1)          — PRIMARY, best
 *   generate_lead    contact / volunteer form submitted (fires on /thanks)         — PRIMARY
 *   contact_click    mailto: or tel: link clicked                            — SECONDARY
 *   view_give_page   reached /give                                           — SECONDARY (observe only)
 * Ad Grants policy: page views and time on site must never be primary
 * conversions. Keep view_give_page as "secondary" in Google Ads.
 */
(function () {
  var GA4_ID = 'G-03ZK5QJ636';
  var ADS_ID = '';          // e.g. 'AW-123456789'
  var ADS_DONATE_LABEL = ''; // e.g. 'AbC-D_efG-h12_34-567'

  if (!GA4_ID && !ADS_ID) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + (GA4_ID || ADS_ID);
  document.head.appendChild(s);

  gtag('js', new Date());
  if (GA4_ID) gtag('config', GA4_ID);
  if (ADS_ID) gtag('config', ADS_ID);

  // Keep the Google Ads click id (gclid) and campaign on the visit so
  // form submissions can be attributed to the ad that brought them.
  try {
    var q = new URLSearchParams(location.search);
    ['gclid', 'utm_source', 'utm_campaign', 'utm_term'].forEach(function (k) {
      if (q.get(k)) sessionStorage.setItem('cf_' + k, q.get(k));
    });
  } catch (e) {}

  function send(name, params) {
    gtag('event', name, params || {});
  }

  var path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/give') send('view_give_page');
  var isGift = /[?&]d=1/.test(location.search);
  if (path === '/thanks' && isGift) send('donation_complete');
  if (path === '/thanks' && !isGift) send('generate_lead', { form: /\/serve/.test(document.referrer) ? 'volunteer' : /\/contact/.test(document.referrer) ? 'contact' : 'unknown' });

  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (/zeffy\.com|donorbox|givebutter|paypal\.com\/donate|stripe\.com/i.test(href)) {
      send('donate_click', { link_url: href, link_text: (a.textContent || '').trim().slice(0, 80), page: path });
      if (ADS_ID && ADS_DONATE_LABEL) send('conversion', { send_to: ADS_ID + '/' + ADS_DONATE_LABEL });
    } else if (/^mailto:|^tel:/i.test(href)) {
      send('contact_click', { method: href.split(':')[0], page: path });
    }
  });

  // Copying the Zelle address is a real donation signal for this charity.
  document.addEventListener('copy', function () {
    var t = String(window.getSelection && window.getSelection());
    if (/give@fundacioncloud\.com/i.test(t)) send('donate_click', { link_url: 'zelle', page: path });
  });

  // Attach ad attribution to Netlify form submissions.
  document.querySelectorAll('form[data-netlify]').forEach(function (f) {
    try {
      ['gclid', 'utm_campaign', 'utm_term'].forEach(function (k) {
        var v = sessionStorage.getItem('cf_' + k);
        if (!v) return;
        var i = f.querySelector('input[name="' + k + '"]');
        if (i) i.value = v;
      });
    } catch (e) {}
  });
})();
