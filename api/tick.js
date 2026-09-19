import { tickIndexer } from '../lib/indexer.js';
import { TICK_SECRET } from '../lib/config.js';
import { runTimers } from '../lib/timers.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed' });
  }

  const providedSecret = req.query.secret;
  const isCron = req.headers['x-vercel-cron'];
  
  if (!isCron && providedSecret !== TICK_SECRET) {
    return res.status(401).json({ error: 'unauthorized', message: 'Unauthorized' });
  }

  try {
    const indexerResult = await tickIndexer();
    await runTimers();
    return res.status(200).json({ success: true, indexer: indexerResult });
  } catch (err) {
    console.error('Tick error:', err);
    return res.status(500).json({ error: 'internal_error', message: 'Internal error' });
  }
}
