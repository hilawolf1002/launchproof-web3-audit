# Lib API Contract (for GPT server.js merge)

## lib/ssrf.js
- `validatePublicUrl(inputUrl)` → safe href string
- Blocks localhost, private IPs, link-local, metadata IPs
- Used by audit.js before fetch

## lib/audit.js (updated)
- `auditUrl(inputUrl)` — now SSRF-safe, max 5 redirects
- Returns: `{ url, score, maxScore, percentage, grade, checks[], fixes[], meta, scannedAt }`

## lib/report.js (updated)
- `generateReportHtml(result)` — all user content HTML-escaped
- `fulfillOrder(orderId)` — generates report file, marks order fulfilled

## lib/tron-verify.js (NEW)
- `isValidTxHash(hash)` — 64 hex chars
- `verifyUsdtPayment(txHash, expectedAmountUsdt)` — checks TronGrid:
  - TX exists
  - USDT TRC20 transfer event
  - `to === TR16mMP3eknhrhH9WRC76EzAr29asLvay7`
  - amount >= expected
- `getRecentIncoming(sinceMs)` — poll wallet for new USDT

## Recommended server.js flow (GPT to implement)
```
POST /api/scan → auditUrl(url) → preview only (no full fixes list)
POST /api/orders → create order status=awaiting_payment
POST /api/orders/:id/confirm → { txHash } → verifyUsdtPayment → fulfillOrder
GET  /api/report/:id → serve report if status=fulfilled
```
No auto-fulfill on order create. No public CORS.

## scripts/wallet-monitor.js
Cron every 5 min: `node /home/lior0334/MAKE_MONEY/scripts/wallet-monitor.js`
