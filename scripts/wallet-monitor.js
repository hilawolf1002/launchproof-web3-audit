#!/usr/bin/env node
'use strict';
/** Poll TRC20 wallet for new USDT. Run via cron every 5 min. */
const fs = require('fs');
const path = require('path');
const { getRecentIncoming, WALLET } = require('../lib/tron-verify');

const STATE_FILE = path.join(__dirname, '..', 'data', 'wallet-state.json');
const LOG_FILE = path.join(__dirname, '..', 'data', 'wallet-log.jsonl');

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { seenTx: [], lastCheck: 0 };
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function appendLog(entry) {
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

async function main() {
  const state = loadState();
  const since = state.lastCheck || (Date.now() - 86400000);
  const incoming = await getRecentIncoming(since);

  let newPayments = 0;
  for (const tx of incoming) {
    if (state.seenTx.includes(tx.txHash)) continue;
    state.seenTx.push(tx.txHash);
    newPayments++;
    const entry = { ...tx, detectedAt: new Date().toISOString(), wallet: WALLET };
    appendLog(entry);
    console.log(`💰 NEW PAYMENT: +${tx.amountUsdt} USDT from ${tx.from} tx=${tx.txHash}`);
  }

  state.lastCheck = Date.now();
  if (state.seenTx.length > 500) state.seenTx = state.seenTx.slice(-500);
  saveState(state);

  if (newPayments === 0) {
    console.log(`No new payments. Wallet: ${WALLET} | checked ${incoming.length} recent incoming`);
  } else {
    console.log(`${newPayments} new payment(s) logged to ${LOG_FILE}`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
