// YSuresh Codes — lead-cache.js

'use strict';

const fs   = require('fs');
const path = require('path');

const DEFAULT_CACHE_FILE = path.resolve('./leads-cache.json');

class LeadCache {
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

  set(lead) {
    this.data[this._key(lead.website)] = {
      ...lead,
      cachedAt: new Date().toISOString(),
    };
    this._save();
  }

  get size() {
    return Object.keys(this.data).length;
  }

  list() {
    return Object.values(this.data);
  }

  clear() {
    this.data = {};
    this._save();
  }


  _key(url) {
    try {
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
      console.warn(`⚠  Could not read lead cache (${this.cacheFile}), starting fresh.`);
      return {};
    }
  }

  _save() {
    fs.writeFileSync(this.cacheFile, JSON.stringify(this.data, null, 2), 'utf8');
  }
}

module.exports = { LeadCache };
