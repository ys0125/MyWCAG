#!/usr/bin/env node
// YSuresh Codes — single-audit.js

'use strict';

require('dotenv').config();

const path          = require('path');
const fs            = require('fs');
const { auditWebsite }  = require('./auditor');
const { generateReport } = require('./reporter');

const url       = process.argv[2];
const threshold = parseInt(process.argv[3] || '50', 10);
const outputDir = path.resolve(process.argv[4] || './reports');

if (!url) {
  console.error('Usage: node src/single-audit.js <url> [threshold] [output-dir]');
  process.exit(1);
}

(async () => {
  console.log('\n════════════════════════════════════════');
  console.log('  Single-Site WCAG Audit');
  console.log('════════════════════════════════════════');
  console.log(`  URL      : ${url}`);
  console.log(`  Threshold: ${threshold}/100`);
  console.log(`  Output   : ${outputDir}\n`);

  fs.mkdirSync(outputDir, { recursive: true });

  console.log('⚡ Running Lighthouse + axe-core…\n');
  const audit = await auditWebsite(url);

  const score = audit.score;
  console.log(`\n  Lighthouse score : ${score !== null ? score + '/100' : 'ERROR'}`);
  console.log(`  axe violations   : ${audit.axeViolations.length}`);
  console.log(`  axe passes       : ${audit.axePassCount}`);

  const business = {
    name:    new URL(url).hostname.replace(/^www\./, ''),
    website: url,
    address: 'N/A',
    phone:   'N/A',
    rating:  null,
  };

  console.log('\n📄 Generating PDF report…');
  const pdfPath = await generateReport(business, audit, outputDir, { threshold });
  console.log(`✔  Saved: ${pdfPath}`);
  console.log('\n════════════════════════════════════════\n');
})().catch(err => {
  console.error(`\n❌ Error: ${err.message}`);
  process.exit(1);
});
