// YSuresh Codes — scraper.js

'use strict';

const puppeteer = require('puppeteer');

const NAV_TIMEOUT = 45_000;

async function scrapeWebsites(directoryUrl, maxResults = 20) {
  console.log(`\n🌐 Scraping directory: ${directoryUrl}\n`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);

    console.log('  Loading page…');
    await page.goto(directoryUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

    // Scroll to bottom to trigger lazy-loaded content
    await autoScroll(page);

    const rawLinks = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        const text = a.innerText?.trim() || a.textContent?.trim() || '';

        if (!href || seen.has(href)) return;
        seen.add(href);

        const heading = (
          a.closest('[class*="firm"], [class*="company"], [class*="card"], [class*="result"], li, article')
            ?.querySelector('h1,h2,h3,h4,h5,strong')
            ?.innerText?.trim()
        ) || text;

        results.push({ href, text, heading });
      });

      return results;
    });

    console.log(`  Found ${rawLinks.length} links on the page. Filtering for firm entries…`);

    const origin = new URL(directoryUrl).origin;

    // Heuristic: find links that look like firm profile pages or external firm sites
    const profileLinks = rawLinks.filter(l => {
      const u = l.href.toLowerCase();
      return (
        // Internal profile-style paths
        (u.startsWith(origin) && (
          u.includes('/firm') ||
          u.includes('/law') ||
          u.includes('/profile') ||
          u.includes('/company') ||
          u.includes('/ranking') ||
          u.includes('/directory')
        )) ||
        // External links that look like firm websites (not social media / generic)
        (!u.startsWith(origin) &&
          !u.includes('google.') &&
          !u.includes('facebook.') &&
          !u.includes('linkedin.') &&
          !u.includes('twitter.') &&
          !u.includes('javascript:') &&
          !u.includes('mailto:') &&
          u.startsWith('http') &&
          l.text.length > 2)
      );
    });

    console.log(`  ${profileLinks.length} candidate firm links found.`);

    const businesses = [];

    for (const link of profileLinks.slice(0, maxResults * 2)) {
      if (businesses.length >= maxResults) break;

      const isInternal = link.href.startsWith(origin);

      if (isInternal) {
        process.stdout.write(`  Following profile: ${link.href.slice(0, 80)}… `);
        const firmData = await extractFromProfilePage(browser, link.href, origin);
        if (firmData) {
          businesses.push(firmData);
          console.log(`✓ ${firmData.name} → ${firmData.website}`);
        } else {
          console.log('skipped (no website found)');
        }
        await sleep(500);
      } else {
        const name = link.heading || link.text || new URL(link.href).hostname;
        if (name && link.href) {
          businesses.push({
            name,
            website: link.href,
            address: 'N/A',
            phone: 'N/A',
            rating: null,
            placeId: null,
          });
          console.log(`  ✓ ${name} → ${link.href}`);
        }
      }
    }

    console.log(`\n  Scraped ${businesses.length} businesses with websites.\n`);
    return businesses;

  } finally {
    await browser.close();
  }
}

async function extractFromProfilePage(browser, profileUrl, directoryOrigin) {
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    page.setDefaultNavigationTimeout(20_000);

    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });

    const result = await page.evaluate((directoryOrigin) => {
      const name = (
        document.querySelector('h1')?.innerText ||
        document.querySelector('h2')?.innerText ||
        document.querySelector('[class*="firm-name"], [class*="company-name"], [class*="title"]')?.innerText ||
        document.title
      )?.trim();

      let website = null;
      document.querySelectorAll('a[href]').forEach(a => {
        if (website) return;
        const href = a.href;
        if (
          href &&
          href.startsWith('http') &&
          !href.startsWith(directoryOrigin) &&
          !href.includes('google.') &&
          !href.includes('facebook.') &&
          !href.includes('linkedin.') &&
          !href.includes('twitter.') &&
          !href.includes('javascript:') &&
          !href.includes('mailto:')
        ) {
          website = href;
        }
      });

      return name && website ? { name, website } : null;
    }, directoryOrigin);

    await page.close();

    if (!result) return null;

    return {
      name: result.name,
      website: normaliseUrl(result.website),
      address: 'N/A',
      phone: 'N/A',
      rating: null,
      placeId: null,
    };
  } catch {
    return null;
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 150);
    });
  });
  await sleep(1000);
}

function normaliseUrl(url) {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { scrapeWebsites };
