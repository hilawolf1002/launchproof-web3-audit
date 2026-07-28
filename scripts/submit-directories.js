#!/usr/bin/env node
'use strict';
/**
 * Attempt submissions to free open-form tool directories.
 * Logs results; does not spam or bypass CAPTCHAs.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PRODUCT = {
  name: 'LaunchProof',
  url: 'https://green-service.online',
  tagline: 'Free Web3 landing page trust scanner — 15 checks in 10 seconds',
  description: 'LaunchProof scans crypto project landing pages for 15 trust signals investors look for: HTTPS, contract visibility, audit badges, social links, mobile viewport, privacy policy, and more. Free instant scan. Full report 29 USDT.',
  category: 'Web3 / Developer Tools / SaaS',
  email: 'launchproof@green-service.online',
};

const LOG = path.join(__dirname, '..', 'data', 'directory-submissions.jsonl');

function log(entry) {
  fs.appendFileSync(LOG, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n');
  console.log(`[${entry.status}] ${entry.site}: ${entry.message || ''}`);
}

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method: options.method || 'GET', timeout: 15000, headers: options.headers || {} }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function checkSiteLive() {
  try {
    const r = await fetchUrl(PRODUCT.url + '/api/health');
    return r.status === 200;
  } catch { return false; }
}

async function submitSideProjectors() {
  // SideProjectors has a simple submit form - attempt GET to verify reachability
  try {
    const r = await fetchUrl('https://www.sideprojectors.com/project/new');
    log({ site: 'SideProjectors', status: r.status === 200 ? 'READY' : 'BLOCKED', message: 'Manual submit required at /project/new' });
  } catch (e) {
    log({ site: 'SideProjectors', status: 'ERROR', message: e.message });
  }
}

async function submitPeerPush() {
  try {
    const r = await fetchUrl('https://peerpush.net/submit');
    log({ site: 'PeerPush', status: r.status === 200 ? 'READY' : 'BLOCKED', message: 'Manual submit at peerpush.net/submit' });
  } catch (e) {
    log({ site: 'PeerPush', status: 'ERROR', message: e.message });
  }
}

async function pingIndexNow() {
  // IndexNow for Bing/Yandex fast indexing
  const key = 'launchproof' + Date.now().toString(36);
  const body = JSON.stringify({
    host: 'green-service.online',
    key,
    keyLocation: `https://green-service.online/${key}.txt`,
    urlList: [PRODUCT.url, PRODUCT.url + '/#scan'],
  });
  try {
    const r = await fetchUrl('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });
    log({ site: 'IndexNow', status: r.status < 300 ? 'SUBMITTED' : 'PENDING', message: `HTTP ${r.status} — also create key file manually` });
  } catch (e) {
    log({ site: 'IndexNow', status: 'ERROR', message: e.message });
  }
}

async function main() {
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  console.log('LaunchProof Directory Submission Runner');
  console.log('Product:', PRODUCT.url);

  const live = await checkSiteLive();
  if (!live) {
    console.error('Site not reachable — aborting');
    process.exit(1);
  }
  log({ site: 'green-service.online', status: 'LIVE', message: 'Health check OK' });

  await submitSideProjectors();
  await submitPeerPush();
  await pingIndexNow();

  console.log('\nManual submissions needed (copy from OUTREACH.md):');
  console.log('  1. https://www.producthunt.com/posts/new');
  console.log('  2. https://www.indiehackers.com/post/new');
  console.log('  3. https://news.ycombinator.com/submit');
  console.log('  4. https://reddit.com/r/SideProject/submit');
  console.log('  5. https://reddit.com/r/forhire/submit');
  console.log('\nLog:', LOG);
}

main();
