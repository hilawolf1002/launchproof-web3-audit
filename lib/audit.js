'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { validatePublicUrl } = require('./ssrf');

const MAX_REDIRECTS = 5;

const TRUST_CHECKS = [
  { id: 'https', label: 'HTTPS enabled', weight: 10, category: 'security' },
  { id: 'title', label: 'Page title present', weight: 5, category: 'seo' },
  { id: 'description', label: 'Meta description', weight: 5, category: 'seo' },
  { id: 'og_tags', label: 'Open Graph tags', weight: 8, category: 'social' },
  { id: 'twitter_card', label: 'Twitter/X card tags', weight: 5, category: 'social' },
  { id: 'favicon', label: 'Favicon set', weight: 3, category: 'branding' },
  { id: 'viewport', label: 'Mobile viewport meta', weight: 7, category: 'mobile' },
  { id: 'contact', label: 'Contact info visible', weight: 8, category: 'trust' },
  { id: 'social_links', label: 'Social media links', weight: 7, category: 'trust' },
  { id: 'privacy', label: 'Privacy policy link', weight: 10, category: 'legal' },
  { id: 'terms', label: 'Terms of service link', weight: 8, category: 'legal' },
  { id: 'no_lorem', label: 'No placeholder text', weight: 6, category: 'content' },
  { id: 'cta', label: 'Clear call-to-action', weight: 7, category: 'conversion' },
  { id: 'token_info', label: 'Token/contract info (Web3)', weight: 9, category: 'web3' },
  { id: 'audit_link', label: 'Audit/KYC mention', weight: 8, category: 'web3' },
];

function fetchPage(url, timeout = 12000, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) {
      reject(new Error('Too many redirects'));
      return;
    }
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(url, { timeout, headers: { 'User-Agent': 'LaunchProof/1.0 (+https://green-service.online)' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = new URL(res.headers.location, url).href;
        validatePublicUrl(next).then(safe => fetchPage(safe, timeout, redirects + 1).then(resolve).catch(reject)).catch(reject);
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; if (data.length > 500000) req.destroy(); });
      res.on('end', () => resolve({ html: data, status: res.statusCode, headers: res.headers, finalUrl: url }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function extractMeta(html) {
  const get = (pattern) => {
    const m = html.match(pattern);
    return m ? m[1].trim() : null;
  };
  return {
    title: get(/<title[^>]*>([^<]+)<\/title>/i),
    description: get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i),
    ogTitle: get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i),
    ogImage: get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i),
    twitterCard: get(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']+)["']/i),
    viewport: /<meta[^>]+name=["']viewport["']/i.test(html),
    favicon: /<link[^>]+rel=["'](?:shortcut )?icon["']/i.test(html),
  };
}

function runChecks(html, url, headers) {
  const lower = html.toLowerCase();
  const meta = extractMeta(html);
  const parsed = new URL(url);

  const results = TRUST_CHECKS.map((check) => {
    let pass = false;
    let detail = '';

    switch (check.id) {
      case 'https':
        pass = parsed.protocol === 'https:';
        detail = pass ? 'Secure connection' : 'Site not using HTTPS — major red flag for crypto users';
        break;
      case 'title':
        pass = !!meta.title && meta.title.length > 3;
        detail = meta.title ? `"${meta.title.slice(0, 60)}"` : 'Missing page title';
        break;
      case 'description':
        pass = !!meta.description && meta.description.length > 20;
        detail = meta.description ? meta.description.slice(0, 80) + '...' : 'No meta description — hurts search & social sharing';
        break;
      case 'og_tags':
        pass = !!(meta.ogTitle && meta.ogImage);
        detail = pass ? 'OG tags found' : 'Missing Open Graph tags — links look broken on social media';
        break;
      case 'twitter_card':
        pass = !!meta.twitterCard;
        detail = pass ? `Card type: ${meta.twitterCard}` : 'No Twitter/X card — previews will look unprofessional';
        break;
      case 'favicon':
        pass = meta.favicon;
        detail = pass ? 'Favicon detected' : 'No favicon — looks like a default/scam site';
        break;
      case 'viewport':
        pass = meta.viewport;
        detail = pass ? 'Mobile-friendly viewport' : 'No viewport meta — broken on mobile (70%+ of crypto traffic)';
        break;
      case 'contact':
        pass = /contact|support@|hello@|info@|telegram|discord\.gg|t\.me/i.test(html);
        detail = pass ? 'Contact channel found' : 'No visible contact — investors cannot reach you';
        break;
      case 'social_links':
        pass = /twitter\.com|x\.com|t\.me|discord\.gg|github\.com|linkedin\.com/i.test(html);
        detail = pass ? 'Social links present' : 'No social links — reduces credibility significantly';
        break;
      case 'privacy':
        pass = /privacy\s*policy|\/privacy/i.test(lower);
        detail = pass ? 'Privacy policy linked' : 'No privacy policy — required for trust & ads';
        break;
      case 'terms':
        pass = /terms\s*(of\s*service|&amp;\s*conditions|and conditions)|\/terms/i.test(lower);
        detail = pass ? 'Terms of service found' : 'No terms of service — legal gap for token projects';
        break;
      case 'no_lorem':
        pass = !/lorem ipsum|placeholder|coming soon only|under construction/i.test(lower.slice(0, 5000));
        detail = pass ? 'No obvious placeholder text' : 'Placeholder or "coming soon" text detected';
        break;
      case 'cta':
        pass = /buy now|get started|launch app|connect wallet|join presale|buy token|swap now|sign up|subscribe/i.test(html);
        detail = pass ? 'CTA button/text found' : 'No clear call-to-action — visitors don\'t know what to do';
        break;
      case 'token_info':
        pass = /0x[a-fA-F0-9]{40}|contract address|token address|CA:|bscscan|etherscan|solscan|dexscreener/i.test(html);
        detail = pass ? 'Token/contract info visible' : 'No contract address visible — #1 scam indicator for degens';
        break;
      case 'audit_link':
        pass = /audited by|certik|hacken|solidproof|assure defi|kyc by|kyc verified/i.test(lower);
        detail = pass ? 'Audit/KYC mention found' : 'No audit or KYC mention — consider adding if available';
        break;
      default:
        detail = 'Unknown check';
    }

    return { ...check, pass, detail, score: pass ? check.weight : 0 };
  });

  const maxScore = TRUST_CHECKS.reduce((s, c) => s + c.weight, 0);
  const score = results.reduce((s, r) => s + r.score, 0);
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : score >= 30 ? 'D' : 'F';

  const failed = results.filter((r) => !r.pass);
  const fixes = failed.map((r) => ({
    check: r.label,
    priority: r.weight >= 8 ? 'HIGH' : r.weight >= 5 ? 'MEDIUM' : 'LOW',
    action: getFixAction(r.id),
  }));

  return {
    url,
    score,
    maxScore,
    percentage: Math.round((score / maxScore) * 100),
    grade,
    checks: results,
    fixes: fixes.slice(0, 8),
    meta,
    scannedAt: new Date().toISOString(),
  };
}

function getFixAction(id) {
  const actions = {
    https: 'Enable SSL certificate (Let\'s Encrypt is free)',
    title: 'Add a descriptive <title> tag with your project name',
    description: 'Write a compelling 150-char meta description',
    og_tags: 'Add og:title, og:description, og:image meta tags',
    twitter_card: 'Add twitter:card and twitter:image meta tags',
    favicon: 'Upload a professional favicon (32x32 PNG)',
    viewport: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
    contact: 'Add email, Telegram, or Discord contact prominently',
    social_links: 'Link your official Twitter/X, Telegram, and GitHub',
    privacy: 'Create and link a privacy policy page',
    terms: 'Add terms of service — especially critical for token sales',
    no_lorem: 'Replace all placeholder text with real copy',
    cta: 'Add a prominent "Connect Wallet" or "Buy Now" button above the fold',
    token_info: 'Display verified contract address with link to block explorer',
    audit_link: 'If audited, add audit badge and link prominently above fold',
  };
  return actions[id] || 'Review and fix this item';
}

async function auditUrl(inputUrl) {
  const url = await validatePublicUrl(inputUrl);
  const { html, status, headers, finalUrl } = await fetchPage(url);
  if (status >= 400) throw new Error(`Site returned HTTP ${status}`);
  return runChecks(html, finalUrl, headers);
}

module.exports = { auditUrl, TRUST_CHECKS };
