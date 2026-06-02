// YSuresh Codes — server.js

'use strict';

require('dotenv').config();

const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const puppeteer = require('puppeteer');
const { Resend }                       = require('resend');
const { upsertContact, markUnsubscribed } = require('./src/hubspot');
const unsubscribe       = require('./src/unsubscribe');

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
  const { toEmail, subject, body, reportFilename, bizName, bizWebsite, bizPhone } = req.body;
  if (!toEmail || !subject || !body) {
    return res.status(400).json({ error: 'toEmail, subject, and body are required.' });
  }

  if (unsubscribe.isUnsubscribed(toEmail)) {
    return res.status(400).json({ error: `${toEmail} has unsubscribed and cannot be emailed.` });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY is not set in .env' });
  }

  const attachments = [];
  if (reportFilename) {
    const pdfPath = path.join(REPORTS_DIR, reportFilename);
    if (fs.existsSync(pdfPath)) {
      attachments.push({
        filename: reportFilename,
        content:  fs.readFileSync(pdfPath),
      });
    }
  }

  try {
    const resend = new Resend(apiKey);
    const from   = process.env.EMAIL_FROM || 'MyWCAG <reports@mywcag.com>';

    const baseUrl   = process.env.BASE_URL || 'https://mywcag-production.up.railway.app';
    const unsubLink = `${baseUrl}/unsubscribe?email=${encodeURIComponent(toEmail)}`;
    const fullBody  = body.replace('[recipient-email]', encodeURIComponent(toEmail));

    await resend.emails.send({
      from,
      to:      toEmail,
      subject,
      text:    fullBody,
      attachments,
    });

    // Log the contact to HubSpot CRM (non-blocking, non-fatal)
    upsertContact({
      email:   toEmail,
      name:    bizName    || '',
      website: bizWebsite || '',
      phone:   bizPhone   || '',
    }).catch(() => {});

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
  return `Website Accessibility – ${name}`;
}

function draftBody(name, website, score, violations) {
  const baseUrl   = process.env.BASE_URL || 'https://mywcag-production.up.railway.app';
  const unsubLink = `${baseUrl}/unsubscribe?email=`;

  return `Hello,

I'm a fellow clinic owner, and recently I ran a website audit on my own clinic.

To be honest, I was a little shocked by how low our score was. I had no idea things like website usability could affect search rankings or that there were even Canadian requirements around this stuff.

It definitely turned into one of those "well… I wish I knew that sooner" moments.

Since then, I've been reaching out to other clinic owners just to share what I learned and help raise awareness.

We started using software that quickly identifies areas that may create barriers for patients online, and I thought it might be helpful for your clinic too.

If you'd like a free audit of your website, just reply to this email. No strings attached.

Thanks,
Mark
MyWCAG
mywcag.com
info@mywcag.com

To opt out of future emails, click here: ${unsubLink}[recipient-email]
`;
}


// Unsubscribe endpoint — sends auto-reply and saves email to unsubscribed list
app.get('/unsubscribe', async (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.status(400).send('Missing email address.');

  unsubscribe.add(email);

  // Mark as unsubscribed in HubSpot CRM (non-blocking)
  markUnsubscribed(email).catch(() => {});

  // Send auto-reply confirmation
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      const from   = process.env.EMAIL_FROM || 'MyWCAG <info@mywcag.com>';
      await resend.emails.send({
        from,
        to:      email,
        subject: 'You have been unsubscribed — MyWCAG',
        text:    `Hi,\n\nThank you for taking the time to read our email.\n\nYou have been successfully unsubscribed from our mailing list and will not receive any further emails from MyWCAG.\n\nBest regards,\nThe MyWCAG Team`,
        html:    `<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;max-width:600px">
          Hi,<br><br>
          Thank you for taking the time to read our email.<br><br>
          You have been successfully <strong>unsubscribed</strong> from our mailing list and will not receive any further emails from MyWCAG.<br><br>
          Best regards,<br>
          The MyWCAG Team
        </p>`,
      });
    } catch (err) {
      console.warn('⚠  Unsubscribe auto-reply failed:', err.message);
    }
  }

  res.send(`
    <html><body style="font-family:Arial,sans-serif;text-align:center;padding:60px;color:#333">
      <h2 style="color:#1F4E79">You've been unsubscribed</h2>
      <p>Thank you for taking the time to read our email.</p>
      <p>You have been removed from our mailing list and will not receive any further emails from MyWCAG.</p>
    </body></html>
  `);
});

// Check if an email is unsubscribed before sending
app.get('/api/unsubscribed', (_req, res) => {
  res.json({ emails: unsubscribe.getAll() });
});

app.listen(PORT, () => {
  console.log(`\n✅ WCAG Auditor UI running at http://localhost:${PORT}\n`);
});
