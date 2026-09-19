import { tickIndexer } from '../lib/indexer.js';
import { TICK_SECRET } from '../lib/config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed', message: 'Methode niet toegestaan' });
  }

  const providedSecret = req.query.secret;
  const isCron = req.headers['x-vercel-cron'];
  
  if (!isCron && providedSecret !== TICK_SECRET) {
    return res.status(401).json({ error: 'unauthorized', message: 'Niet geautoriseerd' });
  }

  try {
    const indexerResult = await tickIndexer();
    // TODO: M4 timers and liveness checks go here
    return res.status(200).json({ success: true, indexer: indexerResult });
  } catch (err) {
    console.error('Tick error:', err);
    return res.status(500).json({ error: 'internal_error', message: 'Interne fout' });
  }
}
