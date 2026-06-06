// YSuresh Codes — hubspot.js

'use strict';

const https = require('https');

// Log a contact to HubSpot CRM. Creates the contact if they don't exist yet,
// silently skips if the email is already in the system.
async function upsertContact({ email, name, website, phone }) {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    console.warn('⚠  HUBSPOT_API_KEY not set — skipping CRM log.');
    return null;
  }

  // Split name into first/last best-effort
  const parts     = (name || '').trim().split(/\s+/);
  const firstname = parts[0] || name || '';
  const lastname  = parts.slice(1).join(' ') || '';

  const payload = JSON.stringify({
    properties: {
      email,
      firstname,
      lastname,
      company:  name || '',
      website:  website || '',
      phone:    phone || '',
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.hubapi.com',
        path:     '/crm/v3/objects/contacts',
        method:   'POST',
        headers:  {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 201) {
            const contact = JSON.parse(body);
            console.log(`📇 HubSpot: contact created — ${email} (id: ${contact.id})`);
            resolve(contact);
          } else if (res.statusCode === 409) {
            // Contact already exists — that's fine
            console.log(`📇 HubSpot: contact already exists — ${email}`);
            resolve(null);
          } else {
            console.warn(`⚠  HubSpot: unexpected status ${res.statusCode} — ${body}`);
            resolve(null);
          }
        });
      }
    );

    req.on('error', (err) => {
      console.warn('⚠  HubSpot request failed:', err.message);
      resolve(null); // non-fatal
    });

    req.write(payload);
    req.end();
  });
}

// Mark a contact as unsubscribed in HubSpot by email address.
// Searches for the contact first, then patches hs_email_optout = true.
async function markUnsubscribed(email) {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) {
    console.warn('⚠  HUBSPOT_API_KEY not set — skipping HubSpot unsubscribe.');
    return null;
  }

  // Step 1: find the contact ID by email
  const contactId = await findContactByEmail(email, apiKey);
  if (!contactId) {
    console.log(`📇 HubSpot: no contact found for ${email} — skipping opt-out.`);
    return null;
  }

  // Step 2: patch the contact to mark as opted out
  const payload = JSON.stringify({ properties: { hs_email_optout: true } });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.hubapi.com',
        path:     `/crm/v3/objects/contacts/${contactId}`,
        method:   'PATCH',
        headers:  {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`📇 HubSpot: ${email} marked as unsubscribed.`);
            resolve(true);
          } else {
            console.warn(`⚠  HubSpot opt-out failed: ${res.statusCode} — ${body}`);
            resolve(null);
          }
        });
      }
    );
    req.on('error', (err) => {
      console.warn('⚠  HubSpot opt-out request failed:', err.message);
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

function findContactByEmail(email, apiKey) {
  const payload = JSON.stringify({
    filterGroups: [{
      filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
    }],
    properties: ['email'],
    limit: 1,
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.hubapi.com',
        path:     '/crm/v3/objects/contacts/search',
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const id   = data.results?.[0]?.id || null;
            resolve(id);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

// Log an email engagement on a HubSpot contact's timeline
// Uses the modern CRM v3 emails API so it appears in the contact's Activity feed.
async function logEmailEngagement({ email, subject, body }) {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) return null;

  // Step 1: find the contact ID
  const contactId = await findContactByEmail(email, apiKey);
  if (!contactId) {
    console.log(`📇 HubSpot: no contact found for ${email} — skipping engagement log.`);
    return null;
  }

  const fromEmail = (process.env.EMAIL_FROM || 'info@mywcag.com').replace(/.*<(.+)>/, '$1').trim();

  // Step 2: create the email object via CRM v3
  const payload = JSON.stringify({
    properties: {
      hs_timestamp:          Date.now().toString(),
      hubspot_owner_id:      '',
      hs_email_direction:    'EMAIL',
      hs_email_status:       'SENT',
      hs_email_subject:      subject,
      hs_email_text:         body,
      hs_email_from_email:   fromEmail,
      hs_email_from_firstname: 'MyWCAG',
      hs_email_to_email:     email,
    },
  });

  const emailId = await new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.hubapi.com',
        path:     '/crm/v3/objects/emails',
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 201) {
            const parsed = JSON.parse(data);
            console.log(`📇 HubSpot: email object created — id ${parsed.id} for ${email}`);
            resolve(parsed.id);
          } else {
            console.warn(`⚠  HubSpot email create failed: ${res.statusCode} — ${data}`);
            resolve(null);
          }
        });
      }
    );
    req.on('error', (err) => { console.warn('⚠  HubSpot email create error:', err.message); resolve(null); });
    req.write(payload);
    req.end();
  });

  if (!emailId) return null;

  // Step 3: associate the email object with the contact
  const assocPayload = JSON.stringify({
    inputs: [{
      from: { id: emailId },
      to:   { id: contactId },
      type: 'email_to_contact',
    }],
  });

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.hubapi.com',
        path:     '/crm/v3/associations/emails/contacts/batch/create',
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Authorization':  `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(assocPayload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log(`📇 HubSpot: email associated with contact ${contactId} for ${email}`);
            resolve(true);
          } else {
            console.warn(`⚠  HubSpot association failed: ${res.statusCode} — ${data}`);
            resolve(null);
          }
        });
      }
    );
    req.on('error', (err) => { console.warn('⚠  HubSpot association error:', err.message); resolve(null); });
    req.write(assocPayload);
    req.end();
  });
}

module.exports = { upsertContact, markUnsubscribed, logEmailEngagement };
