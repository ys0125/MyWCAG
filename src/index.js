#!/usr/bin/env node
// YSuresh Codes — index.js

'use strict';

require('dotenv').config();

const { Command }        = require('commander');
const path               = require('path');
const fs                 = require('fs');
const puppeteer          = require('puppeteer');
const { discoverWebsites } = require('./discovery');
const { scrapeWebsites }   = require('./scraper');
const { auditWebsite }     = require('./auditor');
const { generateReport }   = require('./reporter');
const { AuditCache }       = require('./cache');
const { sendReport }       = require('./emailer');


const program = new Command();

program
  .name('wcag-auditor')
  .description(
    'Discover businesses via Google Places, audit their websites for WCAG\n' +
    'accessibility, and generate a PDF report for any site below the threshold.'
  )
  .version('1.0.0')

  .option('-n, --niche <niche>',
    'Business type to search for (e.g. "law firms", "dentists") — required unless --source-url is used')

  .option('-l, --location <location>',
    'City / region to search in (e.g. "Vancouver, BC") — required unless --source-url is used')

  .option('-t, --threshold <number>',
    'Lighthouse score threshold; sites scoring below this receive a report (0–100)',
    parseIntArg, 65)

  .option('-m, --max-results <number>',
    'Maximum number of businesses to discover',
    parseIntArg, 20)

  .option('-o, --output <dir>',
    'Directory to write PDF reports into',
    './reports')

  .option('--source-url <url>',
    'Scrape businesses from a directory URL instead of using Google Places\n' +
    '                              e.g. --source-url "https://www.lexpert.ca/rankings"')

  .option('--skip-discovery',
    'Skip Google Places lookup; read businesses from --input-csv instead')

  .option('--input-csv <file>',
    'Path to a CSV file with columns: name, website (used with --skip-discovery)')

  .option('--dry-run',
    'Discover and list businesses but do not run audits or create PDFs')

  .option('--cache-file <file>',
    'Path to the JSON cache file of previously audited sites',
    './audited.json')

  .option('--no-cache',
    'Ignore the cache and re-audit all sites')

  .option('--email-list <file>',
    'Path to a CSV with columns: website, email — used to look up recipient addresses')

  .option('--send-emails',
    'Send PDF reports by email after generating them (requires GMAIL_USER + GMAIL_APP_PASSWORD in .env)');

program.parse();
const opts = program.opts();


(async () => {
  try {
    await run(opts);
  } catch (err) {
    console.error(`\n❌  Fatal error: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
})();

async function run(opts) {
  banner();

  let businesses;

  if (opts.sourceUrl) {
    businesses = await scrapeWebsites(opts.sourceUrl, opts.maxResults);
  } else if (opts.skipDiscovery) {
    if (!opts.inputCsv) {
      throw new Error('--skip-discovery requires --input-csv <file>');
    }
    businesses = readCsv(opts.inputCsv);
    console.log(`📂 Loaded ${businesses.length} businesses from ${opts.inputCsv}`);
  } else {
    businesses = await discoverWebsites({
      niche:      opts.niche,
      location:   opts.location,
      maxResults: opts.maxResults,
    });
  }

  if (businesses.length === 0) {
    console.log('⚠  No businesses with websites found. Try a different niche or location.');
    return;
  }

  if (opts.dryRun) {
    console.log('\n📋 Dry-run mode — discovered businesses:\n');
    businesses.forEach((b, i) =>
      console.log(`  ${i + 1}. ${b.name}\n     ${b.website}\n     ${b.address}\n`)
    );
    return;
  }

  const emailList = {};
  if (opts.emailList) {
    try {
      const lines = fs.readFileSync(path.resolve(opts.emailList), 'utf8')
        .split('\n').filter(Boolean);
      const start = lines[0].toLowerCase().includes('website') ? 1 : 0;
      for (const line of lines.slice(start)) {
        const [website, email] = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (website && email) emailList[website] = email;
      }
      console.log(`📧 Loaded ${Object.keys(emailList).length} email addresses from ${opts.emailList}`);
    } catch (err) {
      console.warn(`⚠  Could not read email list: ${err.message}`);
    }
  }

  const outputDir = path.resolve(opts.output);
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`📁 Reports will be saved to: ${outputDir}\n`);

  const cache = new AuditCache(path.resolve(opts.cacheFile));
  if (opts.cache) {
    console.log(`💾 Cache: ${cache.size} site(s) already audited (${path.resolve(opts.cacheFile)})`);
  } else {
    console.log('💾 Cache disabled — all sites will be re-audited.');
  }

  const toAudit = opts.cache
    ? businesses.filter(b => {
        if (cache.has(b.website)) {
          console.log(`  ⏭  Skipping ${b.name} (already audited)`);
          return false;
        }
        return true;
      })
    : businesses;

  if (toAudit.length === 0) {
    console.log('\n✅ All sites have already been audited. Nothing to do.');
    printSummary(cache.list().map(e => ({
      business: e.business, audit: e.auditResult, belowThreshold: e.auditResult.score !== null && e.auditResult.score < opts.threshold
    })), [], opts.threshold, outputDir);
    return;
  }

  console.log(`\n🔍 Auditing ${toAudit.length} site(s) (${businesses.length - toAudit.length} skipped from cache)\n`);

  console.log('🌐 Launching browser…');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
    ],
  });

  const results   = [];
  const reports   = [];
  const threshold = opts.threshold;

  try {
  for (let i = 0; i < toAudit.length; i++) {
    const biz = toAudit[i];
    console.log(`\n[${i + 1}/${toAudit.length}] ${biz.name}`);
    console.log(`  URL: ${biz.website}`);

    let auditResult;
    try {
      auditResult = await auditWebsite(biz.website, browser, threshold);
    } catch (err) {
      console.warn(`  ⚠  Audit failed: ${err.message}`);
      auditResult = {
        url:              biz.website,
        score:            null,
        lighthouseAudits: {},
        axeViolations:    [],
        axePassCount:     0,
        error:            err.message,
      };
    }

    const score = auditResult.score;
    const scoreStr = score !== null ? `${score}/100` : 'ERROR (Lighthouse failed)';
    const below = score !== null && score < threshold;

    console.log(`  ✅ Lighthouse score: ${scoreStr}  ${below ? `— BELOW threshold (${threshold})` : '— OK'}`);
    console.log(`  🔬 axe violations: ${auditResult.axeViolations.length}`);

    if (opts.cache) cache.set(biz.website, biz, auditResult);

    results.push({ business: biz, audit: auditResult, belowThreshold: below });

    if (below) {
      console.log(`  📄 Generating PDF report…`);
      try {
        const pdfPath = await generateReport(
          biz,
          auditResult,
          outputDir,
          { niche: opts.niche, location: opts.location, threshold },
        );
        console.log(`  ✔  Report saved: ${path.basename(pdfPath)}`);
        reports.push(pdfPath);

        if (opts.sendEmails) {
          const recipientEmail = emailList[normaliseUrl(biz.website)] || emailList[biz.website];
          if (recipientEmail) {
            try {
              process.stdout.write(`  📧 Sending email to ${recipientEmail}… `);
              await sendReport(biz, auditResult, pdfPath, recipientEmail);
              console.log('✔  Sent');
            } catch (err) {
              console.error(`❌  Email failed: ${err.message}`);
            }
          } else {
            console.log(`  📧 No email address found for ${biz.name} — skipping send`);
          }
        }
      } catch (err) {
        console.error(`  ❌  PDF generation failed: ${err.message}`);
      }
    }
  }
  } finally {
    await browser.close();
    console.log('\n🌐 Browser closed.');
  }

  printSummary(results, reports, threshold, outputDir);
}


function printSummary(results, reports, threshold, outputDir) {
  const total    = results.length;
  const belowArr = results.filter(r => r.belowThreshold);
  const aboveArr = results.filter(r => !r.belowThreshold && r.audit.score !== null);
  const errArr   = results.filter(r => r.audit.error && r.audit.score === null);
  const avgScore = results
    .filter(r => r.audit.score !== null)
    .reduce((sum, r, _, a) => sum + r.audit.score / a.length, 0);

  console.log('\n' + '═'.repeat(60));
  console.log('  AUDIT SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Sites audited  : ${total}`);
  console.log(`  Avg score      : ${isNaN(avgScore) ? 'N/A' : Math.round(avgScore)}/100`);
  console.log(`  Below threshold (< ${threshold}): ${belowArr.length}`);
  console.log(`  Above threshold         : ${aboveArr.length}`);
  if (errArr.length) console.log(`  Errors (no score)       : ${errArr.length}`);
  console.log('─'.repeat(60));

  if (belowArr.length > 0) {
    console.log('\n  Sites requiring attention:');
    for (const r of belowArr) {
      console.log(`    • ${r.business.name} — ${r.audit.score}/100 — ${r.business.website}`);
    }
  }

  if (reports.length > 0) {
    console.log(`\n  📂 ${reports.length} PDF report(s) saved to:\n     ${outputDir}`);
  } else {
    console.log(`\n  🎉 All sites met the accessibility threshold of ${threshold}/100.`);
  }
  console.log('═'.repeat(60) + '\n');
}


function banner() {
  console.log('\n' + '═'.repeat(60));
  console.log('   WCAG Accessibility Auditor  v1.0.0');
  console.log('   Lighthouse + axe-core  ·  PDF reports');
  console.log('═'.repeat(60) + '\n');
}

function parseIntArg(value) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) throw new Error(`Expected a number, got: ${value}`);
  return parsed;
}

function readCsv(filePath) {
  const content = fs.readFileSync(path.resolve(filePath), 'utf8');
  const lines   = content.split('\n').filter(Boolean);

  const start = lines[0].toLowerCase().includes('name') ? 1 : 0;

  return lines.slice(start).map(line => {
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    return {
      name:    cols[0] || 'Unknown',
      website: normaliseUrl(cols[1] || ''),
      address: cols[2] || 'N/A',
      phone:   cols[3] || 'N/A',
      rating:  null,
      placeId: null,
    };
  }).filter(b => b.website);
}

function normaliseUrl(url) {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
