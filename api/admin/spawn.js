import { broadcastCustomJson } from '../../lib/hive.js';
import { ADMIN_SECRET } from '../../lib/config.js';
import { sql } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed' });
  }

  const providedSecret = req.headers['x-admin-secret'];
  if (providedSecret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'unauthorized', message: 'Unauthorized' });
  }

  try {
    const { origin, msg, holder } = req.body;
    
    // Get next seq
    const dbBalls = await sql`SELECT MAX(seq) as max_seq FROM balls`;
    const nextSeq = (dbBalls[0]?.max_seq || 0) + 1;
    const nextId = `b${nextSeq}`;
    
    const name = `Bal ${nextSeq}`; // Or random from names.js later
    const color = '#ff5722'; // Randomize later
    
    const payload = {
      v: 1,
      type: 'spawn',
      ball: nextId,
      name,
      color,
      origin: origin || 'Unknown'
    };
    if (holder) payload.holder = holder;
    if (msg) payload.msg = msg;

    await broadcastCustomJson('theball', payload, 'active');
    
    return res.status(200).json({ success: true, ball: nextId });
  } catch (err) {
    console.error('Spawn error:', err);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
}
