import { query } from './db.js';
import { broadcastCustomJson } from './hive.js';
import { sendPush } from './push.js';
import {
  REMINDER_1_MIN,
  LOOSE_MIN,
  BOUNCE_MIN,
  HOLD_HOURS,
  LIVENESS_DAYS,
  LIVENESS_GRACE_DAYS
} from './config.js';

export async function runTimers() {
  const now = new Date();

  // 1. In flight / loose balls
  const inFlightRes = await query(`
    SELECT * FROM balls
    WHERE state IN ('in_flight', 'loose')
  `);

  for (const ball of inFlightRes.rows) {
    const elapsedMins = (now.getTime() - new Date(ball.in_flight_since).getTime()) / 60000;

    if (ball.state === 'in_flight') {
      if (ball.reminders_sent === 0 && elapsedMins >= REMINDER_1_MIN) {
        await query(`UPDATE balls SET reminders_sent = 1 WHERE id = $1`, [ball.id]);
        await sendPush(ball.to_user, 'reminder', ball.id, { title: 'Herinnering', body: 'De ball ligt nog voor je.' });
      } else if (ball.reminders_sent === 1 && elapsedMins >= LOOSE_MIN) {
        await query(`UPDATE balls SET state = 'loose', reminders_sent = 2 WHERE id = $1`, [ball.id]);
        
        const pushBody = 'Losse ball in jouw richting, eerste tik vangt.';
        await sendPush(ball.to_user, 'loose', ball.id, { title: 'Losse ball!', body: pushBody });
        for (const u of ball.also || []) {
          await sendPush(u, 'loose', ball.id, { title: 'Losse ball!', body: pushBody });
        }
      }
    }
    
    if (elapsedMins >= BOUNCE_MIN) {
      // It bounced
      const bounceOp = { v: 1, type: 'bounce', ball: ball.id, back_to: ball.holder };
      try {
        await broadcastCustomJson('theball', bounceOp, 'posting');
      } catch (err) {
        console.error('Bounce broadcast failed:', err);
        continue;
      }
      
      // We don't wait for indexer, update DB to avoid duplicate broadcasts
      await query(`UPDATE balls SET state = 'held', holder = $1, to_user = null, also = '{}', in_flight_since = null, held_since = now() WHERE id = $2`, [ball.holder, ball.id]);
      
      await sendPush(ball.to_user, 'missed', ball.id, { title: 'Gemist', body: 'Je liet hem liggen.' });
      await sendPush(ball.holder, 'bounced', ball.id, { title: 'Teruggestuiterd', body: 'Niemand ving hem. Hij ligt weer bij jou, 12 uur.' });
    }
  }

  // 2. Held balls
  const heldRes = await query(`
    SELECT * FROM balls WHERE state = 'held'
  `);

  for (const ball of heldRes.rows) {
    const elapsedHours = (now.getTime() - new Date(ball.held_since).getTime()) / 3600000;

    if (elapsedHours >= HOLD_HOURS) {
      const deadOp = { v: 1, type: 'dead', ball: ball.id };
      try {
        await broadcastCustomJson('theball', deadOp, 'posting');
      } catch (err) {
        console.error('Dead broadcast failed:', err);
        continue;
      }
      
      await query(`UPDATE balls SET state = 'dead', dead_at = now() WHERE id = $1`, [ball.id]);
      await sendPush(ball.holder, 'dead', ball.id, { title: 'Dode ball', body: 'De ball is doodgegaan.' });
    } else {
      const reminderThreshold = HOLD_HOURS > 2 ? HOLD_HOURS - 2 : HOLD_HOURS * 0.8;
      if (elapsedHours >= reminderThreshold && ball.reminders_sent === 0) {
        await query(`UPDATE balls SET reminders_sent = 1 WHERE id = $1`, [ball.id]);
        await sendPush(ball.holder, 'hold_reminder', ball.id, { title: 'Attention', body: 'You must throw the ball soon!' });
      }
    }
  }

  // 3. Liveness
  const activeRes = await query(`
    SELECT p.username, p.last_open,
           (SELECT count(*) FROM push_subs s WHERE s.username = p.username AND s.dead_at IS NULL) as subs_count
    FROM players p WHERE p.active = true
  `);

  const livenessMs = LIVENESS_DAYS * 24 * 60 * 60 * 1000;
  const graceMs = LIVENESS_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;

  for (const row of activeRes.rows) {
    const username = row.username;
    if (parseInt(row.subs_count) === 0) {
      await dropPlayer(username, 'No working notifications anymore.');
      continue;
    }

    const lastOpenDate = row.last_open ? new Date(row.last_open) : new Date(0);
    const lastOpenMs = now.getTime() - lastOpenDate.getTime();

    const pushRes = await query(`SELECT * FROM pushes WHERE username = $1 ORDER BY sent_at DESC LIMIT 1`, [username]);
    const lastPush = pushRes.rows[0];

    if (!lastPush) {
      await sendPush(username, 'alive', null, { title: 'Hoi', body: 'Doe je nog mee?' });
      continue;
    }

    const pushAgeMs = now.getTime() - new Date(lastPush.sent_at).getTime();

    if (pushAgeMs > livenessMs) {
      await sendPush(username, 'alive', null, { title: 'Hoi', body: 'Doe je nog mee?' });
      continue;
    }

    if (lastPush.acked_at == null) {
      if (lastPush.kind === 'alive') {
        if (pushAgeMs > graceMs && lastOpenMs > graceMs) {
          await dropPlayer(username, 'No longer active (no response to check).');
        }
      } else {
        if (pushAgeMs > dayMs && lastOpenMs > livenessMs) {
          await dropPlayer(username, 'No longer active.');
        }
      }
    }
  }
}

async function dropPlayer(username, reason) {
  const dropOp = { v: 1, type: 'drop', username };
  try {
    await broadcastCustomJson('theball', dropOp, 'posting');
  } catch (err) {
    console.error('Drop broadcast failed:', err);
    return;
  }
  await query(`UPDATE players SET active = false WHERE username = $1`, [username]);
  await sendPush(username, 'push_dead', null, { title: 'Uitgeschreven', body: reason });
}
