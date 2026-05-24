// YSuresh Codes — email-finder.js

'use strict';

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Words in a URL that suggest a contact/about page
const CONTACT_KEYWORDS = ['contact', 'about', 'reach', 'connect', 'team', 'hello', 'get-in-touch'];

// Prefixes we deprioritise (still return them if nothing better found)
const LOW_PRIORITY = ['noreply', 'no-reply', 'donotreply', 'privacy', 'legal', 'unsubscribe', 'webmaster', 'postmaster'];

const NAV_TIMEOUT = 20_000;

async function findEmail(url, browser) {
  const visited = new Set();

  const homeResult = await scanPage(url, browser, visited);
  if (homeResult.best) return homeResult.best;

  if (homeResult.contactUrl) {
    const contactResult = await scanPage(homeResult.contactUrl, browser, visited);
    if (contactResult.best) return contactResult.best;
  }

  // Return any low-priority email we found as a last resort
  return homeResult.fallback || null;
}

async function scanPage(url, browser, visited) {
  if (visited.has(url)) return { best: null, fallback: null, contactUrl: null };
  visited.add(url);

  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);

  try {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    } catch {
      return { best: null, fallback: null, contactUrl: null };
    }

    const { emails, contactUrl } = await page.evaluate((contactKeywords) => {
      const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const found = new Set();

      // 1. mailto: links (most reliable)
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
        try {
          const email = decodeURIComponent(a.href.replace('mailto:', '')).split('?')[0].trim().toLowerCase();
          if (email) found.add(email);
        } catch (e) {
          const email = a.href.replace('mailto:', '').split('?')[0].trim().toLowerCase();
          if (email) found.add(email);
        }
      });

      // 2. Email patterns in visible text
      const bodyText = document.body?.innerText || '';
      const matches = bodyText.match(emailRegex) || [];
      matches.forEach(e => found.add(e.toLowerCase()));

      // 3. Look for a contact/about page link
      let contactUrl = null;
      const links = Array.from(document.querySelectorAll('a[href]'));
      for (const link of links) {
        const href = link.href?.toLowerCase() || '';
        const text = link.textContent?.toLowerCase() || '';
        if (contactKeywords.some(k => href.includes(k) || text.includes(k))) {
          // Make sure it's same-origin or relative
          try {
            const u = new URL(link.href);
            if (u.origin === window.location.origin) {
              contactUrl = link.href;
              break;
            }
          } catch {}
        }
      }

      return { emails: [...found], contactUrl };
    }, CONTACT_KEYWORDS);

    const best     = pickBest(emails);
    const fallback = emails.length > 0 ? emails[0] : null;

    return { best, fallback, contactUrl };

  } finally {
    await page.close();
  }
}

// Prefers common contact prefixes; deprioritises system/legal addresses
function pickBest(emails) {
  if (emails.length === 0) return null;

  const HIGH_PRIORITY = ['info', 'contact', 'hello', 'hi', 'enquir', 'inquir', 'office', 'mail', 'admin'];

  const useful = emails.filter(e => {
    const prefix = e.split('@')[0].toLowerCase();
    return !LOW_PRIORITY.some(lp => prefix.includes(lp));
  });

  const candidates = useful.length > 0 ? useful : emails;

  const scored = candidates.map(e => {
    const prefix = e.split('@')[0].toLowerCase();
    const score  = HIGH_PRIORITY.findIndex(hp => prefix.startsWith(hp));
    return { email: e, score: score === -1 ? 999 : score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.email || null;
}

module.exports = { findEmail };
