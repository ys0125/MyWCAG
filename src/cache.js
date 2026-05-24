// YSuresh Codes — cache.js

'use strict';

const fs   = require('fs');
const path = require('path');

const DEFAULT_CACHE_FILE = path.resolve('./audited.json');

class AuditCache {
  constructor(cacheFile = DEFAULT_CACHE_FILE) {
    this.cacheFile = cacheFile;
    this.data      = this._load();
  }

  has(url) {
    return !!this.data[this._key(url)];
  }

  get(url) {
    return this.data[this._key(url)] || null;
  }

  set(url, business, auditResult) {
    this.data[this._key(url)] = {
      auditedAt:   new Date().toISOString(),
      business,
      auditResult,
    };
    this._save();
  }

  get size() {
    return Object.keys(this.data).length;
  }

  list() {
    return Object.values(this.data);
  }


  _key(url) {
    try {
      // Key by hostname so http:// and https:// variants match
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  _load() {
    if (!fs.existsSync(this.cacheFile)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
    } catch {
      console.warn(`⚠  Could not read cache file (${this.cacheFile}), starting fresh.`);
      return {};
    }
  }

  _save() {
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.data, null, 2), 'utf8');
  }
}

module.exports = { AuditCache };
