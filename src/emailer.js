// YSuresh Codes — emailer.js

'use strict';

const { Resend } = require('resend');
const fs         = require('fs');

async function sendReport(business, audit, pdfPath, toEmail) {
  const apiKey  = process.env.RESEND_API_KEY;
  const from    = process.env.EMAIL_FROM || 'MyWCAG <info@mywcag.com>';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY must be set in your .env file.');
  }

  const resend      = new Resend(apiKey);
  const subject     = buildSubject(business, audit);
  const baseUrl     = process.env.BASE_URL || 'https://mywcag.com';
  const unsubLink   = `${baseUrl}/unsubscribe?email=${encodeURIComponent(toEmail)}`;
  const body        = buildBody(business, audit, unsubLink);

  await resend.emails.send({
    from,
    to:      toEmail,
    subject,
    text:    body,
    attachments: [
      {
        filename: `${business.name.replace(/[^a-z0-9]/gi, '_')}_accessibility_report.pdf`,
        content:  fs.readFileSync(pdfPath),
      },
    ],
  });
}


function buildSubject(business, audit) {
  return `Website Accessibility – ${business.name}`;
}

function buildBody(business, audit, unsubLink) {
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

To opt out of future emails, click here: ${unsubLink}
`;
}

function buildHtml(text, unsubLink) {
  // Render everything except the last unsubscribe line as the main body
  const lines   = text.split('\n');
  const mainLines = lines.filter(l => !l.startsWith('To opt out'));
  const escaped = mainLines.join('\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<html><body style="margin:0;padding:0;background:#f4f4f4;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:40px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#333333;">
      <tr><td>
        <pre style="font-family:Arial,sans-serif;font-size:15px;line-height:1.7;white-space:pre-wrap;margin:0;">${escaped}</pre>
        <hr style="border:none;border-top:1px solid #eeeeee;margin:32px 0;">
        <p style="font-size:12px;color:#999999;margin:0;">
          If you no longer wish to receive emails from us, you can
          <a href="${unsubLink}" style="color:#2E75B6;text-decoration:underline;">unsubscribe here</a>.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

module.exports = { sendReport };
