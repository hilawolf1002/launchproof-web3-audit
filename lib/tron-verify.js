'use strict';

const https = require('https');

const WALLET = 'TR16mMP3eknhrhH9WRC76EzAr29asLvay7';
const USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const TX_HASH_RE = /^[0-9a-fA-F]{64}$/;

function isValidTxHash(hash) {
  return TX_HASH_RE.test(String(hash || '').trim());
}

function tronRequest(path) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.trongrid.io${path}`, { timeout: 15000 }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid TronGrid response')); }
      });
    }).on('error', reject);
  });
}

async function verifyUsdtPayment(txHash, expectedAmountUsdt) {
  if (!isValidTxHash(txHash)) {
    return { valid: false, reason: 'Invalid transaction hash format' };
  }

  const info = await tronRequest(`/v1/transactions/${txHash}`);
  const tx = info.data?.[0];
  if (!tx) return { valid: false, reason: 'Transaction not found' };

  const contract = tx.raw_data?.contract?.[0];
  if (!contract || contract.type !== 'TriggerSmartContract') {
    return { valid: false, reason: 'Not a TRC20 transfer' };
  }

  const param = contract.parameter?.value;
  const contractAddr = param?.contract_address;
  if (!contractAddr) return { valid: false, reason: 'Missing contract address' };

  const events = await tronRequest(`/v1/transactions/${txHash}/events`);
  const transfer = (events.data || []).find(e =>
    e.event_name === 'Transfer' &&
    e.contract_address === USDT_CONTRACT
  );

  if (!transfer) return { valid: false, reason: 'No USDT transfer event found' };

  const to = transfer.result?.to || transfer.result?.['1'];
  const from = transfer.result?.from || transfer.result?.['0'];
  const value = transfer.result?.value || transfer.result?.['2'];

  if (to !== WALLET) {
    return { valid: false, reason: `Payment sent to wrong address: ${to}` };
  }

  const amountUsdt = Number(value) / 1e6;
  if (amountUsdt < expectedAmountUsdt) {
    return { valid: false, reason: `Insufficient amount: ${amountUsdt} USDT (expected ${expectedAmountUsdt})` };
  }

  return {
    valid: true,
    from,
    to,
    amountUsdt,
    txHash,
  };
}

async function getRecentIncoming(sinceMs = Date.now() - 86400000) {
  const data = await tronRequest(
    `/v1/accounts/${WALLET}/transactions/trc20?limit=50&contract_address=${USDT_CONTRACT}`
  );
  return (data.data || [])
    .filter(t => t.to === WALLET && t.block_timestamp >= sinceMs)
    .map(t => ({
      txHash: t.transaction_id,
      from: t.from,
      amountUsdt: Number(t.value) / 1e6,
      timestamp: new Date(t.block_timestamp).toISOString(),
    }));
}

module.exports = { isValidTxHash, verifyUsdtPayment, getRecentIncoming, WALLET, USDT_CONTRACT };
