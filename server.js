// YSuresh Codes — server.js

'use strict';

require('dotenv').config();

const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

const { discoverWebsites } = require('./src/discovery');
const { auditWebsite }     = require('./src/auditor');
const { findEmail }        = require('./src/email-finder');
const { generateReport }   = require('./src/reporter');
const { AuditCache }       = require('./src/cache');
const { getCities, getProvinceNames } = require('./src/provinces');
const { LeadCache }                   = require('./src/lead-cache');

const app         = express();
const PORT        = process.env.PORT || 3000;
const REPORTS_DIR = path.resolve('./reports');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/reports', express.static(REPORTS_DIR));
fs.mkdirSync(REPORTS_DIR, { recursive: true });


const leadState = {
  running:     false,
  leads:       [],
  current:     null,
  total:       0,
  done:        0,
  error:       null,
  startedAt:   null,
  completedAt: null,
};

const state = {
  running:     false,
  sites:       [],
  current:     null,
  total:       0,
  done:        0,
  error:       null,
  startedAt:   null,
  completedAt: null,
};


app.post('/api/audit/start', (req, res) => {
  if (state.running) {
    return res.status(409).json({ error: 'An audit is already running.' });
  }

  const { niche, location, threshold = 65, maxResults = 20 } = req.body;
  if (!niche || !location) {
    return res.status(400).json({ error: 'niche and location are required.' });
  }

  Object.assign(state, {
    running: true, sites: [], current: 'Finding businesses…',
    total: 0, done: 0, error: null,
    startedAt: new Date().toISOString(), completedAt: null,
  });

  res.json({ ok: true });

  runAudit({ niche, location, threshold: Number(threshold), maxResults: Number(maxResults) })
    .catch(err => { state.error = err.message; state.running = false; });
});

app.get('/api/audit/status', (_req, res) => res.json({ ...state }));

app.get('/api/results', (_req, res) => {
  const cache = new AuditCache();
  res.json(cache.list());
});

app.post('/api/cache/clear', (_req, res) => {
  try {
    const cachePath = path.resolve('./audited.json');
    if (fs.existsSync(cachePath)) fs.writeFileSync(cachePath, '{}', 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports', (_req, res) => {
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.pdf'))
    .map(f => ({ filename: f, url: `/reports/${encodeURIComponent(f)}` }));
  res.json(files);
});

app.post('/api/email/draft', (req, res) => {
  const { name, website, score, violations = [] } = req.body;
  res.json({
    subject: draftSubject(name, score),
    body:    draftBody(name, website, score, violations),
  });
});

app.post('/api/email/send', async (req, res) => {
  const { toEmail, subject, body, reportFilename } = req.body;
  if (!toEmail || !subject || !body) {
    return res.status(400).json({ error: 'toEmail, subject, and body are required.' });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASSWORD;
  if (!smtpUser || !smtpPass) {
    return res.status(500).json({ error: 'SMTP_USER and SMTP_PASSWORD are not set in .env' });
  }

  const attachments = [];
  if (reportFilename) {
    const pdfPath = path.join(REPORTS_DIR, reportFilename);
    if (fs.existsSync(pdfPath)) {
      attachments.push({
        filename:    reportFilename,
        content:     fs.readFileSync(pdfPath),
        contentType: 'application/pdf',
      });
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtpout.secureserver.net',
      port:   Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth:   { user: smtpUser, pass: smtpPass },
      tls:    { rejectUnauthorized: false },
    });

    await transporter.sendMail({
      from:    `"${process.env.EMAIL_FROM_NAME || smtpUser}" <${smtpUser}>`,
      to:      toEmail,
      subject,
      text:    body,
      html:    `<pre style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${body.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>`,
      attachments,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/audit/url', async (req, res) => {
  let { url, threshold = 65 } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required.' });

  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
  });

  try {
    const audit = await auditWebsite(url, browser, Number(threshold));

    let email = null;
    try { email = await findEmail(url, browser); } catch {}

    let pdfFile = null;
    const below = audit.score !== null && audit.score < Number(threshold);
    if (below) {
      const biz = { name: new URL(url).hostname.replace(/^www\./, ''), website: url, address: '', phone: '', rating: null };
      try {
        const p = await generateReport(biz, audit, REPORTS_DIR, { threshold });
        pdfFile = path.basename(p);
      } catch { /* non-fatal */ }
    }

    res.json({ ...audit, email, pdfFile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await browser.close();
  }
});


const provinceState = {
  running:      false,
  leads:        [],
  current:      null,
  currentCity:  null,
  cityIndex:    0,
  totalCities:  0,
  totalLeads:   0,
  error:        null,
  startedAt:    null,
  completedAt:  null,
};

app.get('/api/provinces', (_req, res) => {
  res.json(getProvinceNames());
});

app.post('/api/leads/province/start', (req, res) => {
  if (provinceState.running) {
    return res.status(409).json({ error: 'A province search is already running.' });
  }
  const { province, niche, perCity = 60 } = req.body;
  if (!province || !niche) {
    return res.status(400).json({ error: 'province and niche are required.' });
  }
  const cities = getCities(province);
  if (cities.length === 0) {
    return res.status(400).json({ error: `No cities found for province: ${province}` });
  }

  Object.assign(provinceState, {
    running: true, leads: [], current: 'Starting…', currentCity: null,
    cityIndex: 0, totalCities: cities.length, totalLeads: 0,
    error: null, startedAt: new Date().toISOString(), completedAt: null,
  });

  res.json({ ok: true, totalCities: cities.length });

  runProvinceScan({ province, niche, cities, perCity: Number(perCity) })
    .catch(err => { provinceState.error = err.message; provinceState.running = false; });
});

app.get('/api/leads/province/status', (_req, res) => {
  const { leads, ...rest } = provinceState;
  res.json({ ...rest, totalLeads: leads.length, leads });
});

app.get('/api/leads/province/download', (_req, res) => {
  const leads = provinceState.leads.filter(l => l.email);
  if (leads.length === 0) return res.status(404).json({ error: 'No province leads with emails yet.' });
  const filename = `province_leads_with_email_${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + buildLeadsCsv(leads, false));
});

app.get('/api/leads/province/download/noemail', (_req, res) => {
  const leads = provinceState.leads.filter(l => !l.email);
  if (leads.length === 0) return res.status(404).json({ error: 'All province leads have emails.' });
  const filename = `province_leads_no_email_${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + buildLeadsCsv(leads, true));
});

async function runProvinceScan({ province, niche, cities, perCity }) {
  const cache       = new LeadCache();
  const seenWebsites = new Set();

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
  });

  try {
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i];
      provinceState.cityIndex   = i + 1;
      provinceState.currentCity = city;
      provinceState.current     = `Searching ${city} (${i + 1}/${cities.length})…`;

      let businesses = [];
      try {
        businesses = await discoverWebsites({ niche, location: `${city}, ${province}`, maxResults: perCity });
      } catch (err) {
        console.warn(`  ⚠  ${city} search failed: ${err.message}`);
        continue;
      }

      for (const biz of businesses) {
        const host = (() => { try { return new URL(biz.website).hostname.replace(/^www\./, ''); } catch { return biz.website; } })();
        if (seenWebsites.has(host)) continue;
        seenWebsites.add(host);

        if (cache.has(biz.website)) {
          const cached = cache.get(biz.website);
          provinceState.leads.push({ ...cached, city });
          console.log(`  📦 Cached: ${biz.name}`);
          continue;
        }

        provinceState.current = `${city} — finding email for ${biz.name}…`;
        let email = null;
        try { email = await findEmail(biz.website, browser); } catch {}

        const lead = {
          name:    biz.name,
          website: biz.website,
          email:   email || '',
          phone:   biz.phone || '',
          address: biz.address || '',
          city,
        };

        cache.set(lead);
        provinceState.leads.push(lead);
      }

      console.log(`  ✅ ${city}: ${businesses.length} found, ${provinceState.leads.length} total unique`);
    }
  } finally {
    await browser.close();
  }

  provinceState.running     = false;
  provinceState.current     = null;
  provinceState.completedAt = new Date().toISOString();
  console.log(`\n🏁 Province scan complete: ${provinceState.leads.length} unique leads.`);
}


app.post('/api/leads/start', (req, res) => {
  if (leadState.running) {
    return res.status(409).json({ error: 'A lead search is already running.' });
  }
  const { niche, location, maxResults = 20 } = req.body;
  if (!niche || !location) {
    return res.status(400).json({ error: 'niche and location are required.' });
  }
  Object.assign(leadState, {
    running: true, leads: [], current: 'Finding businesses…',
    total: 0, done: 0, error: null,
    startedAt: new Date().toISOString(), completedAt: null,
  });
  res.json({ ok: true });
  runLeadGather({ niche, location, maxResults: Number(maxResults) })
    .catch(err => { leadState.error = err.message; leadState.running = false; });
});

app.get('/api/leads/status', (_req, res) => res.json({ ...leadState }));

app.get('/api/leads/download', (_req, res) => {
  const leads = leadState.leads.filter(l => l.email);
  if (leads.length === 0) return res.status(404).json({ error: 'No leads with emails to download.' });
  const filename = `leads_with_email_${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + buildLeadsCsv(leads, false));
});

app.get('/api/leads/download/noemail', (_req, res) => {
  const leads = leadState.leads.filter(l => !l.email);
  if (leads.length === 0) return res.status(404).json({ error: 'All leads have emails — nothing to export.' });
  const filename = `leads_no_email_${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + buildLeadsCsv(leads, true));
});

app.post('/api/leads/cache/clear', (_req, res) => {
  try {
    const cache = new LeadCache();
    cache.clear();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leads/cache/stats', (_req, res) => {
  const cache = new LeadCache();
  res.json({ size: cache.size });
});

function csvCell(val) {
  return '"' + String(val || '').replace(/"/g, '""') + '"';
}

// noEmailMode=true adds a "ChatGPT Prompt" column with a ready-made lookup prompt
function buildLeadsCsv(leads, noEmailMode = false) {
  const hasCity = leads.some(l => l.city);
  const headers = noEmailMode
    ? ['Business Name', 'Website', 'Phone', 'Address', ...(hasCity ? ['City'] : []), 'ChatGPT Prompt']
    : ['Business Name', 'Website', 'Email', 'Phone', 'Address', ...(hasCity ? ['City'] : [])];

  const rows = leads.map(l => {
    const prompt = `Find the contact email address for "${l.name}" — their website is ${l.website}. Return only the email address.`;
    return noEmailMode
      ? [csvCell(l.name), csvCell(l.website), csvCell(l.phone), csvCell(l.address), ...(hasCity ? [csvCell(l.city)] : []), csvCell(prompt)]
      : [csvCell(l.name), csvCell(l.website), csvCell(l.email), csvCell(l.phone), csvCell(l.address), ...(hasCity ? [csvCell(l.city)] : [])];
  });

  return [headers.map(h => csvCell(h)), ...rows].map(r => r.join(',')).join('\r\n');
}


async function runLeadGather({ niche, location, maxResults }) {
  const cache = new LeadCache();

  leadState.current = 'Searching Google Places…';
  const businesses = await discoverWebsites({ niche, location, maxResults });
  leadState.total   = businesses.length;
  leadState.current = 'Launching browser…';

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
  });

  try {
    for (const biz of businesses) {
      if (cache.has(biz.website)) {
        const cached = cache.get(biz.website);
        leadState.leads.push({ ...cached, status: 'cached' });
        leadState.done++;
        console.log(`  📦 Cached: ${biz.name}`);
        continue;
      }

      leadState.current = `${biz.name} — finding email…`;
      let email = null;
      try { email = await findEmail(biz.website, browser); } catch {}

      const lead = {
        name:    biz.name,
        website: biz.website || '',
        email:   email || '',
        phone:   biz.phone || '',
        address: biz.address || '',
      };

      cache.set(lead);
      leadState.leads.push(lead);
      leadState.done++;
    }
  } finally {
    await browser.close();
  }

  leadState.running     = false;
  leadState.current     = null;
  leadState.completedAt = new Date().toISOString();
}


async function runAudit({ niche, location, threshold, maxResults }) {
  const cache = new AuditCache();

  state.current = 'Searching Google Places…';
  const businesses = await discoverWebsites({ niche, location, maxResults });
  state.total = businesses.length;
  state.current = 'Launching browser…';

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
  });

  try {
    for (const biz of businesses) {
      state.current = biz.name;

      if (cache.has(biz.website)) {
        const cached = cache.get(biz.website);
        const score  = cached.auditResult?.score ?? null;
        let email = cached.auditResult?.email || null;
        if (!email) {
          try { email = await findEmail(biz.website, browser); } catch {}
        }
        state.sites.push({
          name:       biz.name,
          url:        biz.website,
          score,
          violations: cached.auditResult?.axeViolations?.length ?? 0,
          status:     'cached',
          pdfFile:    findPdf(biz.name),
          email,
          axeViolations: cached.auditResult?.axeViolations || [],
        });
        state.done++;
        continue;
      }

      let audit;
      try {
        audit = await auditWebsite(biz.website, browser, threshold);
      } catch (err) {
        audit = { url: biz.website, score: null, lighthouseAudits: {}, axeViolations: [], axePassCount: 0, error: err.message };
      }

      state.current = `${biz.name} — finding email…`;
      let email = null;
      try { email = await findEmail(biz.website, browser); } catch {}

      cache.set(biz.website, biz, { ...audit, email });

      const score = audit.score;
      const below = score !== null && score < threshold;
      let pdfFile = null;

      if (below) {
        try {
          const p = await generateReport(biz, audit, REPORTS_DIR, { niche, location, threshold });
          pdfFile = path.basename(p);
        } catch { /* non-fatal */ }
      }

      state.sites.push({
        name:          biz.name,
        url:           biz.website,
        score,
        violations:    audit.axeViolations?.length ?? 0,
        status:        score === null ? 'error' : below ? 'fail' : 'pass',
        pdfFile,
        email,
        axeViolations: audit.axeViolations || [],
      });
      state.done++;
    }
  } finally {
    await browser.close();
  }

  state.running     = false;
  state.current     = null;
  state.completedAt = new Date().toISOString();
}

function findPdf(name) {
  const safe = name.replace(/[^a-z0-9]/gi, '_');
  const files = fs.readdirSync(REPORTS_DIR);
  return files.find(f => f.startsWith(safe) && f.endsWith('.pdf')) || null;
}


function draftSubject(name, score) {
  return `Website Accessibility Assessment – ${name}`;
}

function draftBody(name, website, score, violations) {
  const scoreText = score !== null ? `${score}/100` : 'below the recommended threshold';
  const auditDate = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  return `Hello,

As part of a recent accessibility assessment conducted, your website received a WCAG compliance score of ${scoreText} or below, indicating the presence of critical accessibility issues that may impact usability for individuals relying on assistive technologies.

Under Canada's ICT Accessibility Standards (CAN/ASC - EN 301 549), which incorporate WCAG 2.1 Level A and AA requirements, digital accessibility is becoming an increasingly important compliance and operational consideration for organizations online.

Beyond accessibility compliance, lower WCAG scores can also affect broader digital performance, including:

  •  Reduced user experience and usability
  •  Lower SEO performance and online discoverability
  •  Potential impacts on search rankings
  •  Increased bounce rates and reduced engagement
  •  Elevated regulatory and reputational risk

Addressing these issues helps create a more inclusive, user-friendly, and search-optimized experience while strengthening long-term accessibility readiness.

We recommend reviewing and prioritizing the identified findings as part of your upcoming development cycle. MyWCAG can provide detailed reporting and remediation guidance to support your team.

For questions or additional information, please contact info@mywcag.com or visit mywcag.com.

Kind regards,
The MyWCAG Team

---
Website audited: ${website}
Audit date: ${auditDate}
`;
}


app.listen(PORT, () => {
  console.log(`\n✅ WCAG Auditor UI running at http://localhost:${PORT}\n`);
});
