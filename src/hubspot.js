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

module.exports = { upsertContact };
