// YSuresh Codes — reporter.js

'use strict';

const PDFDocument = require('pdfkit');
const fs   = require('fs');
const path = require('path');


const C = {
  navy:     '#1A365D',
  navyDark: '#0F2440',
  blue:     '#2B6CB0',
  accent:   '#3182CE',
  accentLt: '#63B3ED',
  red:      '#C53030',
  orange:   '#C05621',
  amber:    '#B7791F',
  green:    '#276749',
  greenLt:  '#C6F6D5',
  lightBg:  '#F7FAFC',
  paleBlu:  '#EBF8FF',
  border:   '#BEE3F8',
  borderGy: '#E2E8F0',
  text:     '#1A202C',
  textSub:  '#4A5568',
  muted:    '#718096',
  white:    '#FFFFFF',
  cardBg:   '#FAFBFC',
};

const IMPACT_COLOR = {
  critical: C.red,
  serious:  C.orange,
  moderate: C.amber,
  minor:    C.muted,
};
const IMPACT_LABEL = {
  critical: 'CRITICAL',
  serious:  'SERIOUS',
  moderate: 'MODERATE',
  minor:    'MINOR',
};


const M   = 48;             // page margin
const PW  = 595;            // A4 width  (pts)
const PH  = 842;            // A4 height (pts)
const CW  = PW - M * 2;    // content width
const HDR = 72;             // inner-page header height
const FTR = 32;             // footer height
const TOP = HDR + 24;       // first y after inner header
const BOT = PH - FTR - 20; // last safe y before footer


async function generateReport(business, audit, outputDir, meta = {}) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: M, bottom: M, left: M, right: M },
    info: {
      Title:   `WCAG Accessibility Report – ${business.name}`,
      Author:  'MyWCAG',
      Subject: 'Web Accessibility Compliance Report',
    },
    autoFirstPage: false,
  });

  const safeName = business.name.replace(/[^a-z0-9]/gi, '_').slice(0, 60);
  const filePath  = path.join(outputDir, `${safeName}_wcag_report.pdf`);
  const stream    = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const ctx = { doc, page: 1 };

  drawCover(ctx, business, audit, meta);
  drawSummary(ctx, business, audit);
  drawFindings(ctx, audit);

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}


function drawCover(ctx, business, audit, meta) {
  const { doc } = ctx;
  doc.addPage();

  const score      = audit.score ?? 0;
  const scoreColor = scoreToColor(score);
  const scoreLabel = scoreToLabel(score);

  doc.rect(0, 0, PW, 210).fill(C.navy);
  doc.rect(0, 207, PW, 3).fill(C.accent);

  doc.fillColor(C.accentLt).fontSize(10).font('Helvetica-Bold')
     .text('MyWCAG', M, 28, { width: CW, align: 'center', characterSpacing: 2 });

  doc.fillColor(C.white).fontSize(26).font('Helvetica-Bold')
     .text('Accessibility Report', M, 50, { width: CW, align: 'center' });

  doc.fillColor(C.paleBlu).fontSize(14).font('Helvetica')
     .text(business.name, M, 90, { width: CW, align: 'center' });

  if (business.website) {
    doc.fillColor(C.border).fontSize(9).font('Helvetica')
       .text(business.website, M, 114, { width: CW, align: 'center' });
  }

  const dateStr = new Date().toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.fillColor(C.border).fontSize(8.5).font('Helvetica')
     .text(`Prepared by MyWCAG  ·  ${dateStr}`, M, 136, { width: CW, align: 'center' });

  const badgeX = PW / 2 - 54, badgeY = 160;
  doc.roundedRect(badgeX, badgeY, 108, 22, 11).fill(C.accent);
  doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold')
     .text('WCAG 2.1 Level AA Audit', badgeX + 4, badgeY + 7, { width: 100, align: 'center' });

  // Score ring
  const cx = PW / 2, cy = 350, ro = 72, ri = 56;
  doc.circle(cx, cy, ro + 6).fill('#E2E8F0');
  doc.circle(cx, cy, ro).fill(C.white);
  doc.circle(cx, cy, ro - 2).fill(scoreColor);
  doc.circle(cx, cy, ri).fill(C.white); // inner cutout creates ring effect

  doc.fillColor(C.text).fontSize(40).font('Helvetica-Bold')
     .text(String(score), cx - 40, cy - 24, { width: 80, align: 'center' });
  doc.fillColor(C.muted).fontSize(10).font('Helvetica')
     .text('/ 100', cx - 40, cy + 18, { width: 80, align: 'center' });

  doc.fillColor(scoreColor).fontSize(14).font('Helvetica-Bold')
     .text(scoreLabel, M, cy + ro + 16, { width: CW, align: 'center' });
  doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
     .text('Google Lighthouse Accessibility Score', M, cy + ro + 34, { width: CW, align: 'center' });

  const lhFails  = Object.keys(audit.lighthouseAudits || {}).length;
  const axeTotal = (audit.axeViolations || []).length;
  const critCount = (audit.axeViolations || []).filter(v => v.impact === 'critical').length;

  const stats = [
    { val: String(lhFails),  label: 'Lighthouse Issues' },
    { val: String(axeTotal), label: 'WCAG Violations'   },
    { val: String(critCount),label: 'Critical Issues'   },
  ];

  const stripY = cy + ro + 60;
  const stripH = 58;
  const boxW   = (CW - 24) / 3;

  doc.rect(M, stripY, CW, stripH).fill(C.lightBg).stroke(C.borderGy);

  for (let i = 0; i < stats.length; i++) {
    const bx = M + i * (boxW + 12);
    if (i > 0) doc.rect(bx - 1, stripY + 10, 1, stripH - 20).fill(C.borderGy);

    const valColor = i === 2 && critCount > 0 ? C.red : C.navy;
    doc.fillColor(valColor).fontSize(22).font('Helvetica-Bold')
       .text(stats[i].val, bx, stripY + 8, { width: boxW, align: 'center' });
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
       .text(stats[i].label, bx, stripY + 36, { width: boxW, align: 'center' });
  }

  const cardY = stripY + stripH + 18;
  const cardH = 86;
  doc.roundedRect(M, cardY, CW, cardH, 6).fill(C.white).stroke(C.borderGy);

  doc.roundedRect(M, cardY, 4, cardH, 3).fill(C.accent);

  const col1 = M + 18, col2 = M + CW / 2 + 10;
  infoField(doc, 'Address', business.address || 'N/A', col1, cardY + 12);
  infoField(doc, 'Phone',   business.phone   || 'N/A', col2, cardY + 12);
  infoField(doc, 'Rating',  business.rating   ? `${business.rating} / 5  ★` : 'N/A', col1, cardY + 48);

  if (meta.niche || meta.location) {
    infoField(doc, 'Audit Scope', [meta.niche, meta.location].filter(Boolean).join(' · '), col2, cardY + 48);
  }

  coverFooter(doc);
  ctx.page++;
}


function drawSummary(ctx, business, audit) {
  const { doc } = ctx;
  doc.addPage();
  innerHeader(doc, 'Executive Summary', business.name);
  let y = TOP;

  const score     = audit.score ?? 0;
  const lhFails   = Object.keys(audit.lighthouseAudits || {}).length;
  const axeTotal  = (audit.axeViolations || []).length;
  const axePasses = audit.axePassCount ?? 0;
  const critCount = (audit.axeViolations || []).filter(v => v.impact === 'critical').length;

  const boxes = [
    { val: String(score),    sub: '/ 100',          label: 'Lighthouse Score',    color: scoreToColor(score) },
    { val: String(lhFails),  sub: 'rules failed',   label: 'Lighthouse Issues',   color: lhFails > 0  ? C.orange : C.green },
    { val: String(axeTotal), sub: 'violations',     label: 'WCAG Violations',     color: axeTotal > 0 ? C.orange : C.green },
    { val: String(critCount),sub: 'critical',       label: 'Highest Severity',    color: critCount > 0 ? C.red : C.green },
  ];

  const bw = (CW - 18) / 4;
  for (let i = 0; i < boxes.length; i++) {
    const bx = M + i * (bw + 6);
    doc.roundedRect(bx, y, bw, 68, 5).fill(C.white).stroke(C.borderGy);
    doc.roundedRect(bx, y, bw, 5, 3).fill(boxes[i].color);
    doc.fillColor(boxes[i].color).fontSize(26).font('Helvetica-Bold')
       .text(boxes[i].val, bx + 4, y + 14, { width: bw - 8, align: 'center' });
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica')
       .text(boxes[i].sub, bx + 4, y + 43, { width: bw - 8, align: 'center' });
    doc.fillColor(C.textSub).fontSize(7.5).font('Helvetica-Bold')
       .text(boxes[i].label.toUpperCase(), bx + 4, y + 55, { width: bw - 8, align: 'center', characterSpacing: 0.3 });
  }
  y += 80;

  const meaning = score >= 90
    ? 'This website meets most accessibility standards. Minor improvements may still be needed for full WCAG 2.1 AA compliance.'
    : score >= 70
    ? 'This website has some accessibility issues that should be addressed. Users with disabilities may experience difficulties in certain areas.'
    : score >= 50
    ? 'This website has significant accessibility barriers. A considerable number of users relying on assistive technologies will encounter problems.'
    : 'This website has critical accessibility failures. Users with disabilities may be largely unable to use this site. Urgent remediation is recommended.';

  const bgColor = score >= 90 ? C.greenLt : score >= 70 ? '#FEFCBF' : score >= 50 ? '#FEEBC8' : '#FED7D7';
  const bdColor = score >= 90 ? C.green : score >= 70 ? C.amber : score >= 50 ? C.orange : C.red;
  const mh = doc.heightOfString(meaning, { width: CW - 48 }) + 20;

  doc.roundedRect(M, y, CW, mh, 5).fill(bgColor).stroke(bdColor);
  doc.rect(M, y, 4, mh).fill(bdColor);
  doc.fillColor(C.text).fontSize(9.5).font('Helvetica')
     .text(meaning, M + 18, y + 10, { width: CW - 28, lineGap: 3 });
  y += mh + 16;

  if (y + 40 > BOT) { pageBreak(ctx, 'Executive Summary'); y = TOP; }
  y = sectionHeading(doc, 'Violations by Severity', y);

  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of audit.axeViolations || []) {
    if (v.impact in counts) counts[v.impact]++;
  }
  const maxCount = Math.max(...Object.values(counts), 1);
  const barMax   = CW - 160;

  for (const [impact, count] of Object.entries(counts)) {
    const color = IMPACT_COLOR[impact];
    const barW  = Math.round((count / maxCount) * barMax);
    doc.roundedRect(M, y, CW, 28, 3).fill(C.lightBg);

    doc.roundedRect(M, y, 82, 28, 3).fill(color);
    doc.fillColor(C.white).fontSize(8).font('Helvetica-Bold')
       .text(IMPACT_LABEL[impact], M + 2, y + 10, { width: 78, align: 'center' });

    doc.roundedRect(M + 90, y + 9, barMax, 10, 3).fill(C.borderGy);
    if (barW > 0) doc.roundedRect(M + 90, y + 9, barW, 10, 3).fill(color);

    doc.fillColor(C.text).fontSize(10).font('Helvetica-Bold')
       .text(String(count), M + 90 + barMax + 8, y + 8, { width: 36, align: 'right' });

    y += 32;
  }
  y += 14;

  if (y + 40 > BOT) { pageBreak(ctx, 'Executive Summary'); y = TOP; }
  y = sectionHeading(doc, 'Audit Overview', y);

  const tableRows = [
    ['Website Audited',        business.website || 'N/A'],
    ['Lighthouse Score',       `${audit.score ?? 'N/A'} / 100`],
    ['Lighthouse Issues',      `${lhFails} rule${lhFails !== 1 ? 's' : ''} failed`],
    ['axe-core Violations',    `${axeTotal} issue${axeTotal !== 1 ? 's' : ''} found`],
    ['axe-core Checks Passed', `${axePasses} passed`],
    ['WCAG Target',            'WCAG 2.1 Level AA'],
    ['Report Date',            new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })],
  ];

  for (let i = 0; i < tableRows.length; i++) {
    const [label, value] = tableRows[i];
    doc.rect(M, y, CW, 22).fill(i % 2 === 0 ? C.lightBg : C.white);
    doc.fillColor(C.muted).fontSize(8.5).font('Helvetica')
       .text(label, M + 10, y + 6, { width: CW / 2 - 10 });
    doc.fillColor(C.text).fontSize(8.5).font('Helvetica-Bold')
       .text(value, M + CW / 2, y + 6, { width: CW / 2 - 10, align: 'right' });
    y += 22;
  }
  y += 16;

  if (y + 60 > BOT) { pageBreak(ctx, 'Executive Summary'); y = TOP; }
  y = sectionHeading(doc, 'Priority Recommendations', y);

  const recs = buildRecommendations(audit);
  for (const rec of recs) {
    const h = doc.heightOfString(rec.text, { width: CW - 52 });
    if (y + h + 20 > BOT) { pageBreak(ctx, 'Executive Summary'); y = TOP; }

    const badgeColor = rec.level === 'high' ? C.red : rec.level === 'medium' ? C.orange : C.blue;
    const label      = rec.level === 'high' ? 'HIGH' : rec.level === 'medium' ? 'MED' : 'LOW';

    doc.roundedRect(M, y, CW, h + 16, 4).fill(C.white).stroke(C.borderGy);
    doc.roundedRect(M, y, 4, h + 16, 3).fill(badgeColor);

    doc.roundedRect(M + 10, y + (h + 16) / 2 - 9, 28, 18, 3).fill(badgeColor);
    doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold')
       .text(label, M + 10, y + (h + 16) / 2 - 3, { width: 28, align: 'center' });

    doc.fillColor(C.text).fontSize(9).font('Helvetica')
       .text(rec.text, M + 46, y + 8, { width: CW - 52, lineGap: 3 });
    y += h + 24;
  }

  innerFooter(doc, ctx.page);
  ctx.page++;
}


function drawFindings(ctx, audit) {
  const { doc } = ctx;
  const lhFails = Object.entries(audit.lighthouseAudits || {});
  const axeViolations = [...(audit.axeViolations || [])].sort(
    (a, b) => (['critical', 'serious', 'moderate', 'minor'].indexOf(a.impact) -
               ['critical', 'serious', 'moderate', 'minor'].indexOf(b.impact))
  );

  if (lhFails.length === 0 && axeViolations.length === 0) return;

  doc.addPage();
  innerHeader(doc, 'Detailed Findings', 'All identified accessibility issues — plain-English explanations and fix guidance');
  let y = TOP;

  if (lhFails.length > 0) {
    if (y + 50 > BOT) { pageBreak(ctx, 'Detailed Findings'); y = TOP; }

    y = sectionHeading(doc, `Lighthouse  —  ${lhFails.length} Failed Rule${lhFails.length !== 1 ? 's' : ''}`, y);

    doc.fillColor(C.muted).fontSize(8.5).font('Helvetica-Oblique')
       .text('Lighthouse measures your site against Google\'s accessibility rules. Each issue below failed its check and needs attention.',
             M + 4, y, { width: CW - 8 });
    y += 24;

    for (const [id, a] of lhFails) {
      const impact    = scoreToImpact(a.score);
      const fixGuide  = lighthouseFixGuide(id, a);
      const cardH     = estimateLighthouseCardH(doc, a, fixGuide);

      if (y + cardH > BOT) { pageBreak(ctx, 'Detailed Findings'); y = TOP; }

      y = drawFindingCard(doc, y, {
        impact,
        source:         'Lighthouse',
        title:          a.title,
        wcagTags:       [],
        whatItMeans:    cleanDescription(a.description),
        howToFix:       fixGuide,
        affectedCount:  a.nodes?.length || 0,
        exampleSnippet: null,
      });
      y += 10;
    }
    y += 6;
  }

  if (axeViolations.length > 0) {
    if (y + 50 > BOT) { pageBreak(ctx, 'Detailed Findings'); y = TOP; }

    y = sectionHeading(doc, `axe-core  —  ${axeViolations.length} WCAG Violation${axeViolations.length !== 1 ? 's' : ''}`, y);

    doc.fillColor(C.muted).fontSize(8.5).font('Helvetica-Oblique')
       .text('axe-core tests against WCAG 2.1 Level A and AA criteria used by assistive technologies such as screen readers and keyboard navigation.',
             M + 4, y, { width: CW - 8 });
    y += 24;

    for (const v of axeViolations) {
      const fixBullets   = parseFailureSummary(v.nodes || []);
      const exSnippet    = pickCleanSnippet(v.nodes || []);
      const cardH        = estimateAxeCardH(doc, v, fixBullets, exSnippet);

      if (y + cardH > BOT) { pageBreak(ctx, 'Detailed Findings'); y = TOP; }

      y = drawFindingCard(doc, y, {
        impact:         v.impact || 'minor',
        source:         'axe-core',
        title:          v.help || v.id,
        wcagTags:       (v.tags || []).filter(t => /^wcag\d/.test(t)),
        whatItMeans:    cleanDescription(v.description),
        howToFix:       fixBullets,
        affectedCount:  (v.nodes || []).length,
        exampleSnippet: exSnippet,
      });
      y += 10;
    }
  }

  innerFooter(doc, ctx.page);
}


function drawFindingCard(doc, y, opts) {
  const { impact, source, title, wcagTags,
          whatItMeans, howToFix, affectedCount, exampleSnippet } = opts;

  const accentColor = IMPACT_COLOR[impact] || C.muted;
  const impactLabel = IMPACT_LABEL[impact] || 'INFO';

  const cardH = estimateCardHeight(doc, opts);
  doc.roundedRect(M, y, CW, cardH, 5).fill(C.white).stroke(C.borderGy);

  doc.roundedRect(M, y, 5, cardH, 3).fill(accentColor);

  let iy = y + 12;

  const srcW = 64, srcH = 18;
  const srcX = M + CW - srcW - 4;
  doc.roundedRect(srcX, iy, srcW, srcH, 3).fill(C.lightBg).stroke(C.borderGy);
  doc.fillColor(C.textSub).fontSize(7).font('Helvetica-Bold')
     .text(source.toUpperCase(), srcX, iy + 5, { width: srcW, align: 'center', characterSpacing: 0.5 });

  doc.roundedRect(M + 12, iy, 70, 18, 3).fill(accentColor);
  doc.fillColor(C.white).fontSize(7.5).font('Helvetica-Bold')
     .text(impactLabel, M + 12, iy + 5, { width: 70, align: 'center' });

  iy += 24;

  doc.fillColor(C.navy).fontSize(11).font('Helvetica-Bold')
     .text(title, M + 12, iy, { width: CW - 24 });
  iy += doc.heightOfString(title, { width: CW - 24 }) + 5;

  // WCAG tags
  if (wcagTags.length > 0) {
    const tagStr = wcagTags.map(t => formatWcagTag(t)).join('   ·   ');
    doc.fillColor(C.accent).fontSize(8).font('Helvetica-Bold')
       .text(tagStr, M + 12, iy, { width: CW - 24 });
    iy += 14;
  }

  doc.rect(M + 12, iy, CW - 24, 0.75).fill(C.borderGy);
  iy += 10;

  doc.fillColor(C.textSub).fontSize(8).font('Helvetica-Bold')
     .text('WHAT THIS MEANS', M + 12, iy, { characterSpacing: 0.5 });
  iy += 13;

  doc.fillColor(C.text).fontSize(9).font('Helvetica')
     .text(whatItMeans, M + 12, iy, { width: CW - 24, lineGap: 3 });
  iy += doc.heightOfString(whatItMeans, { width: CW - 24 }) + 10;

  if (howToFix && howToFix.length > 0) {
    doc.fillColor(C.textSub).fontSize(8).font('Helvetica-Bold')
       .text('HOW TO FIX', M + 12, iy, { characterSpacing: 0.5 });
    iy += 13;

    for (const bullet of howToFix) {
      const bh = doc.heightOfString(bullet, { width: CW - 36 });
      doc.circle(M + 18, iy + 5, 2.5).fill(accentColor);
      doc.fillColor(C.text).fontSize(9).font('Helvetica')
         .text(bullet, M + 28, iy, { width: CW - 42, lineGap: 3 });
      iy += bh + 6;
    }
    iy += 4;
  }

  doc.roundedRect(M + 12, iy, CW - 24, 18, 3).fill(C.lightBg);
  doc.fillColor(C.muted).fontSize(8).font('Helvetica-Oblique')
     .text(`${affectedCount} element${affectedCount !== 1 ? 's' : ''} affected on this page`,
           M + 18, iy + 5, { width: CW - 36 });
  iy += 24;

  if (exampleSnippet) {
    doc.fillColor(C.muted).fontSize(7.5).font('Helvetica-Bold')
       .text('EXAMPLE ELEMENT  (for your developer)', M + 12, iy, { characterSpacing: 0.3 });
    iy += 12;
    const snipH = doc.heightOfString(exampleSnippet, { width: CW - 30 }) + 10;
    doc.roundedRect(M + 12, iy, CW - 24, snipH, 3).fill('#F0F4F8').stroke(C.borderGy);
    doc.fillColor(C.textSub).fontSize(7.5).font('Courier')
       .text(exampleSnippet, M + 18, iy + 5, { width: CW - 36 });
    iy += snipH + 8;
  }

  return y + cardH;
}


function estimateCardHeight(doc, opts) {
  const { title, wcagTags, whatItMeans, howToFix, exampleSnippet } = opts;
  let h = 12 + 24;  // top padding + badge row

  h += doc.heightOfString(title, { width: CW - 24 }) + 5;
  if (wcagTags && wcagTags.length > 0) h += 14;
  h += 10 + 13;  // divider + section label

  h += doc.heightOfString(whatItMeans || '', { width: CW - 24 }) + 10;

  if (howToFix && howToFix.length > 0) {
    h += 13;
    for (const b of howToFix) h += doc.heightOfString(b, { width: CW - 42 }) + 6;
    h += 4;
  }

  h += 24; // affected count strip

  if (exampleSnippet) {
    h += 12 + doc.heightOfString(exampleSnippet, { width: CW - 36 }) + 10 + 8;
  }

  h += 12; // bottom padding

  return h;
}


function pageBreak(ctx, headerTitle) {
  innerFooter(ctx.doc, ctx.page);
  ctx.page++;
  ctx.doc.addPage();
  innerHeader(ctx.doc, headerTitle, '');
}


function sectionHeading(doc, title, y) {
  doc.roundedRect(M, y, CW, 26, 4).fill(C.navy);
  doc.fillColor(C.white).fontSize(9.5).font('Helvetica-Bold')
     .text(title, M + 12, y + 8, { width: CW - 24, characterSpacing: 0.3 });
  return y + 34;
}


function innerHeader(doc, title, subtitle) {
  doc.rect(0, 0, PW, HDR).fill(C.navy);
  doc.rect(0, HDR, PW, 3).fill(C.accent);

  doc.fillColor(C.accentLt).fontSize(7.5).font('Helvetica-Bold')
     .text('MyWCAG', M, 16, { characterSpacing: 1.5 });

  doc.fillColor(C.white).fontSize(18).font('Helvetica-Bold')
     .text(title, M, 28, { width: CW });

  if (subtitle) {
    doc.fillColor(C.paleBlu).fontSize(8).font('Helvetica')
       .text(subtitle, M, 52, { width: CW });
  }
}

function innerFooter(doc, pageNum) {
  doc.rect(0, PH - FTR, PW, FTR).fill(C.navyDark);
  doc.rect(0, PH - FTR, PW, 1).fill(C.accent);
  doc.fillColor(C.border).fontSize(7.5).font('Helvetica')
     .text(
       `MyWCAG Accessibility Report  ·  Page ${pageNum}  ·  mywcag.com  ·  info@mywcag.com  ·  ${new Date().toLocaleDateString('en-CA')}`,
       M, PH - FTR + 11, { width: CW, align: 'center' },
     );
}

function coverFooter(doc) {
  doc.rect(0, PH - FTR, PW, FTR).fill(C.navyDark);
  doc.rect(0, PH - FTR, PW, 1).fill(C.accent);
  doc.fillColor(C.border).fontSize(7.5).font('Helvetica')
     .text(
       'Generated by MyWCAG  ·  mywcag.com  ·  info@mywcag.com  ·  Confidential — prepared for the recipient only.',
       M, PH - FTR + 11, { width: CW, align: 'center' },
     );
}

function infoField(doc, label, value, x, y) {
  doc.fillColor(C.muted).fontSize(7).font('Helvetica-Bold')
     .text(label.toUpperCase(), x, y, { characterSpacing: 0.5 });
  doc.fillColor(C.text).fontSize(9.5).font('Helvetica-Bold')
     .text(String(value).slice(0, 52), x, y + 11, { width: CW / 2 - 28 });
}


function cleanDescription(text = '') {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/Learn more:?\s*https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatWcagTag(tag) {
  const m = tag.match(/^wcag(\d)(\d+)(\d*)$/);
  if (!m) return tag.toUpperCase();
  return `WCAG ${m[1]}.${m[2]}${m[3] ? '.' + m[3] : ''}`;
}

function scoreToColor(score) {
  if (score >= 90) return C.green;
  if (score >= 70) return C.amber;
  if (score >= 50) return C.orange;
  return C.red;
}

function scoreToLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Moderate';
  if (score >= 50) return 'Poor';
  return 'Critical';
}

function scoreToImpact(score) {
  if (score === null || score === undefined) return 'serious';
  if (score <= 25) return 'critical';
  if (score <= 50) return 'serious';
  if (score <= 75) return 'moderate';
  return 'minor';
}


function parseFailureSummary(nodes) {
  const seen = new Set();
  const bullets = [];

  for (const node of nodes.slice(0, 5)) {
    const raw = node.failureSummary || '';
    const lines = raw
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !/^fix (any|one|all)/i.test(l));

    for (const line of lines) {
      if (!seen.has(line) && line.length > 4) {
        seen.add(line);
        bullets.push(line.replace(/^[-•·]\s*/, '').trim());
      }
      if (bullets.length >= 5) break;
    }
    if (bullets.length >= 5) break;
  }

  return bullets.length > 0
    ? bullets
    : ['Review and update affected elements to meet WCAG 2.1 AA standards.'];
}


function pickCleanSnippet(nodes) {
  for (const node of nodes.slice(0, 5)) {
    const html = (node.html || '').trim();
    if (!html || html.length > 120) continue;
    if ((html.match(/style=/g) || []).length > 1) continue;
    const clean = html.replace(/\s*style="[^"]*"/g, '').slice(0, 100);
    if (clean.length > 5) return clean;
  }
  return null;
}


function estimateLighthouseCardH(doc, a, fixGuide) {
  return estimateCardHeight(doc, {
    title:         a.title,
    wcagTags:      [],
    whatItMeans:   cleanDescription(a.description),
    howToFix:      fixGuide,
    affectedCount: a.nodes?.length || 0,
    exampleSnippet: null,
  });
}

function estimateAxeCardH(doc, v, fixBullets, exSnippet) {
  return estimateCardHeight(doc, {
    title:         v.help || v.id,
    wcagTags:      (v.tags || []).filter(t => /^wcag\d/.test(t)),
    whatItMeans:   cleanDescription(v.description || ''),
    howToFix:      fixBullets,
    affectedCount: (v.nodes || []).length,
    exampleSnippet: exSnippet,
  });
}


function lighthouseFixGuide(id, audit) {
  const guides = {
    'color-contrast':          ['Ensure text has a contrast ratio of at least 4.5:1 against its background for normal text, or 3:1 for large text (18pt+).', 'Use a free contrast checker such as the WebAIM Contrast Checker to test each colour combination.'],
    'image-alt':               ['Add a descriptive alt attribute to every meaningful image (e.g. alt="Company logo").', 'Use alt="" (empty) for purely decorative images so screen readers skip them.'],
    'label':                   ['Associate every form input with a visible <label> element using the for="fieldId" attribute.', 'Alternatively, add an aria-label or aria-labelledby attribute directly to the input.'],
    'link-name':               ['Make sure every link has descriptive text — avoid "click here" or "read more".', 'If a link contains only an image, add a descriptive alt attribute to that image.'],
    'button-name':             ['Every button must have a clear text label or an aria-label attribute describing its purpose.'],
    'document-title':          ['Add a unique, descriptive <title> tag to every page of your website.'],
    'html-has-lang':           ['Add a lang attribute to the <html> element (e.g. <html lang="en">) so screen readers use the correct language.'],
    'meta-viewport':           ['Remove user-scalable=no from your viewport meta tag to allow users to zoom in on text.'],
    'heading-order':           ['Use heading levels in order (h1, then h2, then h3…). Do not skip levels or use headings purely for visual styling.'],
    'duplicate-id':            ['Ensure every id attribute on the page is unique. Duplicate IDs break assistive tools and browser behaviour.'],
    'frame-title':             ['Add a title attribute to every <iframe> describing its content (e.g. title="Google Maps — our location").'],
    'keyboard':                ['Ensure every interactive element (links, buttons, forms) can be reached and used with only the keyboard (Tab, Enter, Space, Arrow keys).'],
    'focus-traps':             ['Keyboard focus must never be permanently trapped inside a modal or widget. Users must always be able to tab away.'],
    'tabindex':                ['Avoid positive tabindex values. Use tabindex="0" to include an element in the natural tab order, or tabindex="-1" for programmatic focus only.'],
    'aria-allowed-attr':       ['Remove or correct ARIA attributes that are not permitted on that element type.'],
    'aria-required-children':  ['Ensure elements with ARIA roles that require children (e.g. listbox, menu) contain the correct child roles.'],
    'aria-roles':              ['Check that all role attribute values are valid, correctly-spelled ARIA roles.'],
    'aria-valid-attr-value':   ['Correct any ARIA attribute values that reference IDs which do not exist on the page.'],
    'list':                    ['Use proper <ul> or <ol> markup. Only <li> elements should be direct children of a list.'],
    'listitem':                ['<li> elements must be placed inside a <ul> or <ol> — never used on their own.'],
    'td-headers-attr':         ['Ensure every <td> using the headers attribute references valid <th> element IDs in the same table.'],
    'th-has-data-cells':       ['Each <th> header cell must relate to at least one data cell in the table.'],
  };

  if (guides[id]) return guides[id];

  const fallback = [];
  if (audit.displayValue) fallback.push(`Current status: ${audit.displayValue}`);
  fallback.push('Work with your developer to address this issue. Refer to the WCAG 2.1 documentation for detailed guidance.');
  return fallback;
}


function buildRecommendations(audit) {
  const v = audit.axeViolations || [];
  const recs = [];

  if (v.some(x => x.impact === 'critical')) {
    recs.push({ level: 'high', text: 'Fix all CRITICAL violations first — these prevent users with disabilities from accessing key content entirely.' });
  }
  if (v.some(x => x.id === 'color-contrast')) {
    recs.push({ level: 'high', text: 'Improve colour contrast throughout the site. Text must have a contrast ratio of at least 4.5:1 to be readable by users with low vision.' });
  }
  if (v.some(x => x.id === 'image-alt')) {
    recs.push({ level: 'high', text: 'Add alternative text to all meaningful images. This is essential for screen-reader users and is one of the most common WCAG failures.' });
  }
  if (v.some(x => x.id.includes('label') || x.id.includes('form'))) {
    recs.push({ level: 'medium', text: 'Label all form fields clearly. Users relying on screen readers or voice control cannot interact with unlabelled inputs.' });
  }
  if (v.some(x => x.id.includes('heading') || x.id.includes('landmark'))) {
    recs.push({ level: 'medium', text: 'Structure the page using semantic headings (h1–h6) and ARIA landmarks so screen-reader users can navigate directly to the content they need.' });
  }
  if (v.some(x => x.id.includes('keyboard') || x.id.includes('focus'))) {
    recs.push({ level: 'medium', text: 'Verify that all interactive elements are fully operable by keyboard alone — fundamental for users with motor disabilities.' });
  }
  if (v.some(x => x.id === 'link-name' || x.id === 'button-name')) {
    recs.push({ level: 'medium', text: 'Give every link and button a clear, descriptive label. Avoid vague text like "click here" or "read more" that provides no context.' });
  }
  if (recs.length === 0) {
    recs.push({ level: 'low', text: 'No automated violations detected. Conduct manual testing with a screen reader (e.g. NVDA, VoiceOver) to verify full WCAG 2.1 AA compliance.' });
  }
  recs.push({ level: 'low', text: 'Re-test after each round of fixes to track score improvement. MyWCAG provides ongoing monitoring and remediation support — contact info@mywcag.com.' });
  return recs;
}

module.exports = { generateReport };
