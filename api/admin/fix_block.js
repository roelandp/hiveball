import { setMeta } from '../../lib/db.js';
import { ADMIN_SECRET } from '../../lib/config.js';

export default async function handler(req, res) {
  if (req.query.secret !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  
  const block = req.query.block;
  if (!block) {
    return res.status(400).json({ error: 'missing_block' });
  }

  try {
    await setMeta('last_block', block.toString());
    res.status(200).json({ success: true, message: `last_block set to ${block}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
