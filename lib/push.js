import webpush from 'web-push';
import { query } from './db.js';
import crypto from 'crypto';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export async function sendPush(username, kind, ball, payload) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  
  const subs = await query('SELECT id, endpoint, p256dh, auth FROM push_subs WHERE username = $1 AND dead_at IS NULL', [username]);
  if (subs.rows.length === 0) return;

  const pushId = crypto.randomUUID();
  await query('INSERT INTO pushes (id, username, kind, ball) VALUES ($1, $2, $3, $4)', [pushId, username, kind, ball]);

  const pushData = JSON.stringify({ id: pushId, kind, ball, ...payload });

  for (const sub of subs.rows) {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, pushData);
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        await query('UPDATE push_subs SET dead_at = now() WHERE id = $1', [sub.id]);
      } else {
        console.error('Push error:', e);
      }
    }
  }
}
