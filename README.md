# WCAG Accessibility Auditor

Automatically discover businesses in a local area, audit their websites for WCAG 2.1 AA compliance, and generate polished PDF reports for every site that falls below your score threshold.

---

## How it works

```
Google Places API
     │  (niche + location → list of businesses + website URLs)
     ▼
Lighthouse  ──→  accessibility score (0–100)
     │
     ├── score ≥ threshold  →  ✅ no report
     │
     └── score < threshold  →  axe-core deep-scan
                                    │
                                    └── PDF report (cover + summary + violations)
```

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js ≥ 18** | `node --version` |
| **Google Chrome** | Installed automatically by Puppeteer |
| **Google Places API key** | Free tier covers ~100 businesses/month |

---

## Quick start

```bash
# 1. Clone / download the project
cd wcag-auditor

# 2. Install dependencies  (~3 min first time — Puppeteer downloads Chrome)
npm install

# 3. Add your API key
cp .env.example .env
# Edit .env and paste your GOOGLE_PLACES_API_KEY

# 4. Run your first audit
node src/index.js \
  --niche "law firms" \
  --location "Vancouver, BC" \
  --threshold 50

# Reports appear in ./reports/
```

---

## All CLI options

```
Options:
  -n, --niche <niche>         Business type to search (required)
                              e.g. "law firms", "dentists", "accounting firms"

  -l, --location <location>   City/region (required)
                              e.g. "Vancouver, BC", "Seattle, WA"

  -t, --threshold <number>    Score threshold — sites below this get a report
                              Default: 50

  -m, --max-results <number>  Max businesses to discover
                              Default: 20

  -o, --output <dir>          Directory for PDF reports
                              Default: ./reports

  --skip-discovery            Skip Places API; read from --input-csv instead
  --input-csv <file>          CSV with columns: name, website[, address, phone]
  --dry-run                   List discovered businesses only; no audits/PDFs
  -V, --version               Print version
  -h, --help                  Show help
```

---

## Example commands

```bash
# Law firms in Vancouver, threshold 60, max 30 sites
node src/index.js -n "law firms" -l "Vancouver, BC" -t 60 -m 30

# Dentists in Toronto, save reports to ~/Desktop/audits
node src/index.js -n "dentists" -l "Toronto, ON" -o ~/Desktop/audits

# Just preview what sites would be found (no audits)
node src/index.js -n "accountants" -l "Calgary, AB" --dry-run

# Audit a pre-made list (no API key needed)
node src/index.js --skip-discovery --input-csv my_sites.csv -t 70
```

**CSV format for `--input-csv`:**
```csv
name,website,address,phone
Acme Law,https://acmelaw.com,123 Main St,604-555-0001
Smith & Co,https://smithco.ca,456 Oak Ave,
```

---

## PDF report structure

Each failing site gets its own PDF with:

| Section | Contents |
|---|---|
| **Cover** | Business name, address, score gauge (colour-coded), violation count |
| **Executive Summary** | Score table, impact breakdown bar chart, actionable recommendations |
| **Lighthouse Failures** | Each failed audit with description and affected HTML snippets |
| **axe-core Violations** | Every WCAG violation sorted by severity (critical → minor), WCAG criteria tags, help URLs, and affected element HTML |

---

## About employee-size filtering

Google Places does not expose employee counts. To filter by company size you have two options:

1. **Clearbit Enrichment API** (`https://person.clearbit.com/v2/companies/find?domain=…`) — returns `metrics.employees` for free on a limited plan.
2. **Apollo.io People API** — has a `num_employees` field for companies in their database.
3. **Manual CSV** — export a filtered list from LinkedIn Sales Navigator or Hunter.io, save as CSV, and use `--skip-discovery --input-csv`.

---

## Scoring reference

| Lighthouse Score | Colour | Meaning |
|---|---|---|
| 90–100 | 🟢 Green | Excellent |
| 70–89  | 🟡 Amber | Moderate |
| 50–69  | 🟠 Orange | Poor |
| 0–49   | 🔴 Red | Critical |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `GOOGLE_PLACES_API_KEY is not set` | Copy `.env.example` to `.env` and add your key |
| `REQUEST_DENIED` from Places API | Enable the **Places API** in Google Cloud Console |
| Lighthouse hangs | Try `--no-sandbox` flags (already included); check Chrome is installed |
| Site times out | The auditor waits up to 45 s per page; very slow sites are skipped gracefully |
| Zero businesses found | Try a broader niche or location string |

---

## Tech stack

- **[Lighthouse](https://github.com/GoogleChrome/lighthouse)** — Google's accessibility scoring engine
- **[axe-core](https://github.com/dequelabs/axe-core)** — Deque's WCAG violation scanner
- **[Puppeteer](https://pptr.dev/)** — headless Chrome for axe-core
- **[Google Places API](https://developers.google.com/maps/documentation/places/web-service)** — business discovery
- **[PDFKit](https://pdfkit.org/)** — PDF generation
- **[Commander.js](https://github.com/tj/commander.js/)** — CLI argument parsing
