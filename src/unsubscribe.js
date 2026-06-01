// YSuresh Codes — unsubscribe.js

'use strict';

const fs   = require('fs');
const path = require('path');

const FILE = path.resolve('./unsubscribed.json');

function load() {
  try {
    if (fs.existsSync(FILE)) return new Set(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {}
  return new Set();
}

function save(set) {
  fs.writeFileSync(FILE, JSON.stringify([...set]), 'utf8');
}

function add(email) {
  const list = load();
  list.add(email.toLowerCase().trim());
  save(list);
}

function isUnsubscribed(email) {
  return load().has(email.toLowerCase().trim());
}

function getAll() {
  return [...load()];
}

module.exports = { add, isUnsubscribed, getAll };
