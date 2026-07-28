'use strict';

const dns = require('dns').promises;
const { URL } = require('url');
const net = require('net');

const BLOCKED_HOSTNAMES = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]',
  'metadata.google.internal', '169.254.169.254',
]);

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  }
  return false;
}

async function validatePublicUrl(inputUrl) {
  let url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP/HTTPS URLs allowed');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error('URL not allowed');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Private IP addresses not allowed');
    return parsed.href;
  }

  const records = await dns.lookup(hostname, { all: true });
  if (!records.length) throw new Error('Could not resolve hostname');

  for (const { address } of records) {
    if (isPrivateIp(address)) {
      throw new Error('URL resolves to private/internal address');
    }
  }

  return parsed.href;
}

module.exports = { validatePublicUrl, isPrivateIp };
