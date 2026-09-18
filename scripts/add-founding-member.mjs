#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const CONTRACT = '0x1b556933D64AE9bb32044711C5393B2E5663d185';
const ARC_RPC = 'https://rpc.arc-scan.org';
const ARC_CHAIN_ID = 5042n;
const BALANCE_OF_SELECTOR = '0x70a08231';
const TARGET = 25;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const here = dirname(fileURLToPath(import.meta.url));
const rosterPath = resolve(here, '..', 'founding-roster.json');

function usage() {
  console.log(`\nAdd a verified Founding 25 member\n\nUsage:\n  node scripts/add-founding-member.mjs --address 0x... [--name "Name"] [--x "@handle"] [--allow-contract]\n\nWhat this does:\n  1. Confirms Arc chain ID 5042.\n  2. Reads $EXIT balance directly from Arc RPC.\n  3. Requires a positive balance at the verification block.\n  4. Rejects contract addresses by default (pools/routers are not Founding members).\n  5. Stores the block number and observed raw balance as the permanent verification record.\n\nUse --allow-contract only after manually confirming the address is a genuine community smart wallet, not a pool, router, protocol, or project-controlled address.\n`);
}

function valueFor(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function validAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

function balanceOfData(owner) {
  return BALANCE_OF_SELECTOR + owner.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

async function rpc(method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(ARC_RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const body = await response.json();
    if (body.error) throw new Error(body.error.message || 'Arc RPC error');
    return body.result;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeX(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    usage();
    return;
  }

  const inputAddress = valueFor('--address');
  if (!validAddress(inputAddress)) {
    usage();
    throw new Error('A valid --address is required.');
  }

  const address = inputAddress.toLowerCase();
  if (address === ZERO_ADDRESS || address === CONTRACT.toLowerCase()) {
    throw new Error('The zero address and the token contract cannot be Founding members.');
  }

  const displayName = valueFor('--name')?.trim() || null;
  const xHandle = normalizeX(valueFor('--x'));
  const allowContract = hasFlag('--allow-contract');

  const chainIdHex = await rpc('eth_chainId', []);
  const chainId = BigInt(chainIdHex);
  if (chainId !== ARC_CHAIN_ID) {
    throw new Error(`Wrong RPC network. Expected Arc chain 5042, got ${chainId.toString()}.`);
  }

  const verificationBlockHex = await rpc('eth_blockNumber', []);
  const verificationBlock = Number(BigInt(verificationBlockHex));
  const [balanceHex, code] = await Promise.all([
    rpc('eth_call', [{ to: CONTRACT, data: balanceOfData(address) }, verificationBlockHex]),
    rpc('eth_getCode', [address, verificationBlockHex])
  ]);

  const balance = !balanceHex || balanceHex === '0x' ? 0n : BigInt(balanceHex);
  if (balance <= 0n) {
    throw new Error('Address does not currently hold $EXIT. Founding verification requires a positive onchain balance.');
  }

  const isContract = Boolean(code && code !== '0x' && code !== '0x0');
  if (isContract && !allowContract) {
    throw new Error('Address has contract bytecode. Pools, routers and protocol addresses are excluded. Re-run with --allow-contract only for a manually confirmed community smart wallet.');
  }

  const roster = JSON.parse(await readFile(rosterPath, 'utf8'));
  const members = Array.isArray(roster.members) ? roster.members : [];

  if (members.length >= TARGET) {
    throw new Error('The Founding 25 roster is already full.');
  }

  if (members.some((member) => String(member?.address || '').toLowerCase() === address)) {
    throw new Error('That wallet is already on the Founding 25 roster.');
  }

  const now = new Date().toISOString();
  const member = {
    address,
    displayName,
    xHandle,
    joinedAt: now,
    verification: {
      method: 'arc-rpc-balanceOf',
      chainId: Number(ARC_CHAIN_ID),
      token: CONTRACT,
      verifiedAt: now,
      verifiedAtBlock: verificationBlock,
      verifiedBalanceRaw: balance.toString(),
      walletType: isContract ? 'contract-override' : 'eoa'
    }
  };

  roster.schemaVersion = 2;
  roster.updatedAt = now;
  roster.members = [...members, member];

  await writeFile(rosterPath, `${JSON.stringify(roster, null, 2)}\n`, 'utf8');

  console.log(`Verified Founding ${String(roster.members.length).padStart(2, '0')}/25`);
  console.log(`Address: ${address}`);
  console.log(`Verification block: ${verificationBlock}`);
  console.log(`Observed raw $EXIT balance: ${balance.toString()}`);
  console.log(`Roster updated: ${rosterPath}`);
  console.log('Review the diff, confirm this is one genuine community member, then commit founding-roster.json.');
}

main().catch((error) => {
  console.error(`Founding 25 verification failed: ${error.message}`);
  process.exitCode = 1;
});
