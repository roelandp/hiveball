import { Client, cryptoUtils, Signature, PrivateKey } from '@hiveio/dhive';
import { HIVE_API, THEBALL_ACCOUNT, THEBALL_POSTING_WIF, THEBALL_ACTIVE_WIF } from './config.js';

export const client = new Client(HIVE_API);

export async function verifyPostingSignature(tx, username) {
  try {
    const digest = cryptoUtils.transactionDigest(tx); // Mainnet default
    const [acc] = await client.database.getAccounts([username]);
    if (!acc) return false;
    
    const keys = acc.posting.key_auths.map(([k]) => k);
    
    return tx.signatures.some(sig => {
      try {
        const pub = Signature.fromString(sig).recover(digest).toString();
        return keys.includes(pub);
      } catch (e) {
        return false;
      }
    });
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

export async function broadcastCustomJson(id, json, keyType = 'posting') {
  const wif = keyType === 'active' ? THEBALL_ACTIVE_WIF : THEBALL_POSTING_WIF;
  if (!wif) throw new Error(`Missing ${keyType} key for broadcast`);
  
  const key = PrivateKey.fromString(wif);
  
  const op = [
    'custom_json',
    {
      required_auths: keyType === 'active' ? [THEBALL_ACCOUNT] : [],
      required_posting_auths: keyType === 'posting' ? [THEBALL_ACCOUNT] : [],
      id,
      json: JSON.stringify(json)
    }
  ];
  
  return await client.broadcast.sendOperations([op], key);
}

export async function broadcastTx(tx) {
  return await client.broadcast.send(tx);
}

export async function getOpFromHistory(username, trxId) {
  try {
    const history = await client.call('condenser_api', 'get_account_history', [username, -1, 50]);
    for (const [seq, tx] of history) {
      if (tx.trx_id === trxId && tx.op[0] === 'custom_json' && tx.op[1].id === 'theball') {
        return tx.op;
      }
    }
  } catch(e) {
    console.error('getOpFromHistory error:', e);
  }
  return null;
}
