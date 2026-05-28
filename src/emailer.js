// YSuresh Codes — emailer.js

'use strict';

const { Resend } = require('resend');
const fs         = require('fs');

async function sendReport(business, audit, pdfPath, toEmail) {
  const apiKey  = process.env.RESEND_API_KEY;
  const from    = process.env.EMAIL_FROM || 'MyWCAG <reports@mywcag.com>';

  if (!apiKey) {
    throw new Error('RESEND_API_KEY must be set in your .env file.');
  }

  const resend  = new Resend(apiKey);
  const subject = buildSubject(business, audit);
  const body    = buildBody(business, audit);

  await resend.emails.send({
    from,
    to:      toEmail,
    subject,
    text:    body,
    html:    textToHtml(body),
    attachments: [
      {
        filename: `${business.name.replace(/[^a-z0-9]/gi, '_')}_accessibility_report.pdf`,
        content:  fs.readFileSync(pdfPath),
      },
    ],
  });
}


function buildSubject(business, audit) {
  const score = audit.score;
  if (score === null) return `Accessibility Review – ${business.name}`;
  if (score < 50) return `Urgent: Accessibility Issues Found on ${business.name}'s Website`;
  return `Accessibility Improvement Opportunity – ${business.name}`;
}

function buildBody(business, audit) {
  const score      = audit.score;
  const violations = audit.axeViolations || [];
  const firmName   = business.name;
  const website    = business.website;

  const impactOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  const topIssues   = [...violations]
    .sort((a, b) => (impactOrder[a.impact] ?? 4) - (impactOrder[b.impact] ?? 4))
    .slice(0, 3);

  const issueLines = topIssues.length > 0
    ? topIssues.map(v => `  • ${v.help} (${v.impact} impact)`).join('\n')
    : '  • Lighthouse accessibility score below recommended threshold';

  const scoreText = score !== null
    ? `scored ${score}/100 on Google Lighthouse's accessibility audit (industry benchmark is 90+)`
    : `has accessibility issues that could affect users with disabilities`;

  const urgency = score !== null && score < 50
    ? 'These issues are significant and may expose your firm to legal risk under accessibility regulations.'
    : 'Addressing these issues would improve the experience for all your clients, including those using assistive technologies.';

  return `Hi ${firmName} team,

I recently ran an accessibility audit on your website (${website}) and wanted to share the findings with you.

Your site ${scoreText}. I've attached a full report, but here are the key issues identified:

${issueLines}

${urgency}

Under the Accessibility for Ontarians with Disabilities Act (AODA) and similar provincial legislation, websites are increasingly expected to meet WCAG 2.1 AA standards — particularly for professional services firms like yours.

I've attached a detailed PDF report outlining every issue found, the affected page elements, and specific recommendations for your development team to address them.

If you'd like to discuss the findings or explore how these issues can be resolved, I'd be happy to connect.

Best regards,
${process.env.EMAIL_FROM_NAME || 'The MyWCAG Team'}


---
This report was generated automatically using Google Lighthouse and axe-core.
Website audited: ${website}
Audit date: ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
`;
}

function textToHtml(text) {
  return `<html><body><pre style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap;max-width:600px">${
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }</pre></body></html>`;
}

module.exports = { sendReport };
