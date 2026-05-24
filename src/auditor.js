// YSuresh Codes — auditor.js

'use strict';

const { AxePuppeteer } = require('@axe-core/puppeteer');

const NAV_TIMEOUT  = 45_000;
const LH_RETRIES   = 1;
const AXE_RETRIES  = 1;
const RETRY_DELAY  = 3_000;
const AXE_SETTLE   = 1_500;

async function auditWebsite(url, browser, threshold = 65) {
  const result = {
    url,
    score:            null,
    lighthouseAudits: {},
    axeViolations:    [],
    axePassCount:     0,
    error:            null,
  };

  const port = parseInt(new URL(browser.wsEndpoint()).port, 10);

  // retry loop: Lighthouse
  let lhAttempt = 0;
  while (lhAttempt <= LH_RETRIES) {
    try {
      if (lhAttempt === 0) {
        console.log(`    ⚡ Lighthouse…`);
      } else {
        console.log(`    ⚡ Lighthouse retry ${lhAttempt}…`);
      }

      const lighthouseMod = await import('lighthouse');
      const lighthouse    = lighthouseMod.default ?? lighthouseMod;

      const lhResult = await lighthouse(url, {
        logLevel:        'error',
        output:          'json',
        onlyCategories:  ['accessibility'],
        port,
        formFactor:      'desktop',
        screenEmulation: { disabled: true },
        throttling:      { cpuSlowdownMultiplier: 1 },
      });

      const lhr   = lhResult.lhr;
      const score = Math.round((lhr.categories.accessibility?.score ?? 0) * 100);

      const failedAudits = {};
      for (const [id, audit] of Object.entries(lhr.audits)) {
        if (audit.score !== null && audit.score < 1 && audit.scoreDisplayMode !== 'notApplicable') {
          failedAudits[id] = {
            title:        audit.title,
            description:  stripMarkdownLinks(audit.description),
            score:        Math.round((audit.score ?? 0) * 100),
            displayValue: audit.displayValue || null,
            nodes:        extractNodes(audit.details),
          };
        }
      }

      result.score            = score;
      result.lighthouseAudits = failedAudits;
      result.error            = null;
      break;

    } catch (err) {
      lhAttempt++;
      if (lhAttempt <= LH_RETRIES) {
        console.warn(`    ⚠  Lighthouse failed (${err.message}) — retrying in ${RETRY_DELAY / 1000}s…`);
        await sleep(RETRY_DELAY);
      } else {
        console.warn(`    ⚠  Lighthouse failed after ${LH_RETRIES + 1} attempts: ${err.message}`);
        if (process.env.DEBUG) console.error(err.stack);
        result.error = err.message;
      }
    }
  }

  // axe-core — only run if site failed the Lighthouse threshold
  if (result.score !== null && result.score >= threshold) {
    console.log(`    ⏭  axe-core skipped (score ${result.score} ≥ threshold ${threshold})`);
    return result;
  }

  // retry loop: axe-core
  let axeAttempt = 0;
  while (axeAttempt <= AXE_RETRIES) {
    let page = null;
    try {
      if (axeAttempt === 0) {
        console.log(`    🔬 axe-core…`);
      } else {
        console.log(`    🔬 axe-core retry ${axeAttempt}…`);
        await sleep(RETRY_DELAY);
      }

      page = await browser.newPage();
      page.setDefaultNavigationTimeout(NAV_TIMEOUT);

      // Navigate — fall back to domcontentloaded if networkidle2 times out
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      } catch {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      }

      // Wait briefly for JS-heavy pages to settle before axe runs
      await sleep(AXE_SETTLE);

      const axeResults = await new AxePuppeteer(page)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();

      await page.close();
      page = null;

      result.axeViolations = axeResults.violations || [];
      result.axePassCount  = (axeResults.passes || []).length;
      break;

    } catch (err) {
      // Always close the page if it's still open
      if (page) { try { await page.close(); } catch {} page = null; }

      axeAttempt++;
      if (axeAttempt <= AXE_RETRIES) {
        console.warn(`    ⚠  axe-core failed (${err.message}) — retrying…`);
      } else {
        console.warn(`    ⚠  axe-core failed after ${AXE_RETRIES + 1} attempts: ${err.message}`);
        if (!result.error) result.error = err.message;
      }
    }
  }

  return result;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractNodes(details) {
  if (!details) return [];
  const nodes = [];
  for (const item of (details.items || []).slice(0, 10)) {
    if (item.node?.snippet) {
      nodes.push({
        snippet:     item.node.snippet.slice(0, 200),
        selector:    item.node.selector || '',
        explanation: item.node.explanation || '',
      });
    } else if (item.url) {
      nodes.push({ snippet: item.url, selector: '', explanation: '' });
    }
  }
  return nodes;
}

function stripMarkdownLinks(text = '') {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

module.exports = { auditWebsite };
