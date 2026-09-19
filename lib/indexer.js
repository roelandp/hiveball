import { client } from './hive.js';
import { sql, getMeta, setMeta } from './db.js';
import { apply } from './reducer.js';
import { INDEX_MAX_BLOCKS, SPAWN_BLOCK } from './config.js';

export async function tickIndexer() {
  const dynamicGlobalProperties = await client.database.getDynamicGlobalProperties();
  const headBlock = dynamicGlobalProperties.head_block_number;
  
  let lastBlockStr = await getMeta('last_block');
  let lastBlock = lastBlockStr ? parseInt(lastBlockStr, 10) : SPAWN_BLOCK || headBlock;
  
  if (headBlock - lastBlock > 600) {
    console.warn(`Indexer is ${headBlock - lastBlock} blocks behind`);
  }
  
  const toBlock = Math.min(lastBlock + INDEX_MAX_BLOCKS, headBlock);
  if (toBlock <= lastBlock) return { processed: 0, headBlock };
  
  // load current state
  const state = { players: new Map(), balls: new Map(), seq: 0 };
  
  // Actually we need to load state from DB first.
  const dbPlayers = await sql`SELECT * FROM players`;
  for (const p of dbPlayers) {
    state.players.set(p.username, p);
  }
  
  const dbBalls = await sql`SELECT * FROM balls`;
  for (const b of dbBalls) {
    state.balls.set(b.id, b);
    if (b.seq > state.seq) state.seq = b.seq;
  }
  
  let processedOps = 0;
  
  for (let blockNum = lastBlock + 1; blockNum <= toBlock; blockNum++) {
    const opsInBlock = await client.database.getOperations(blockNum, false);
    
    for (const tx of opsInBlock) {
      const opName = tx.op[0];
      const opData = tx.op[1];
      
      if (opName === 'custom_json') {
        const id = opData.id;
        const requiredPostingAuths = opData.required_posting_auths || [];
        const requiredAuths = opData.required_auths || [];
        const signer = requiredAuths[0] || requiredPostingAuths[0]; // simplistic assumption
        
        if (id === 'theball') {
          let json;
          try {
            json = JSON.parse(opData.json);
          } catch (e) {
            continue;
          }
          if (json.v !== 1) continue;
          
          const meta = {
            ts: tx.timestamp,
            signer,
            block: tx.block,
            trx_id: tx.trx_id
          };
          
          const result = apply(state, json, meta);
          
          // Persist the op
          await sql`
            INSERT INTO ball_ops (ball, op, username, json, block, trx_id, ts, valid, reason)
            VALUES (${json.ball || null}, ${json.type || 'unknown'}, ${signer}, ${opData.json}, ${blockNum}, ${tx.trx_id}, ${tx.timestamp}, ${result.valid}, ${result.reason || null})
            ON CONFLICT (trx_id) DO UPDATE SET valid = EXCLUDED.valid, reason = EXCLUDED.reason, block = EXCLUDED.block
          `;
          
          if (result.valid) {
            // Apply updates to DB based on op type
            // Simple approach: just update the specific record
            if (json.type === 'register' || json.type === 'drop') {
              const p = state.players.get(signer);
              await sql`
                INSERT INTO players (username, gh, place, active, follows)
                VALUES (${signer}, ${p.gh || null}, ${p.place || null}, ${p.active}, ${p.follows})
                ON CONFLICT (username) DO UPDATE SET gh = EXCLUDED.gh, place = EXCLUDED.place, active = EXCLUDED.active, follows = EXCLUDED.follows
              `;
            } else if (['spawn', 'throw', 'catch', 'bounce', 'dead'].includes(json.type)) {
              const b = state.balls.get(json.ball);
              if (b) {
                await sql`
                  INSERT INTO balls (id, seq, name, color, origin, state, holder, to_user, also, in_flight_since, held_since, throws, reminders_sent, spawned_at, dead_at)
                  VALUES (${b.id}, ${b.seq}, ${b.name}, ${b.color}, ${b.origin}, ${b.state}, ${b.holder}, ${b.to_user}, ${b.also}, ${b.in_flight_since}, ${b.held_since}, ${b.throws}, ${b.reminders_sent}, ${b.spawned_at}, ${b.dead_at})
                  ON CONFLICT (id) DO UPDATE SET 
                    seq = EXCLUDED.seq, state = EXCLUDED.state, holder = EXCLUDED.holder, to_user = EXCLUDED.to_user, 
                    also = EXCLUDED.also, in_flight_since = EXCLUDED.in_flight_since, held_since = EXCLUDED.held_since, 
                    throws = EXCLUDED.throws, reminders_sent = EXCLUDED.reminders_sent, dead_at = EXCLUDED.dead_at
                `;
              }
            }
          }
          processedOps++;
          
        } else if (id === 'follow') {
          let json;
          try {
            json = JSON.parse(opData.json);
          } catch (e) { continue; }
          
          if (Array.isArray(json) && json[0] === 'follow') {
            const followData = json[1];
            if (followData.following === 'theball') {
              const isFollow = followData.what && followData.what.includes('blog');
              const opType = isFollow ? 'follow' : 'unfollow';
              
              const meta = { ts: tx.timestamp, signer: followData.follower, block: tx.block, trx_id: tx.trx_id };
              const result = apply(state, { type: opType, follower: followData.follower }, meta);
              
              if (result.valid) {
                const p = state.players.get(followData.follower);
                await sql`
                  INSERT INTO players (username, active, follows)
                  VALUES (${followData.follower}, ${p.active}, ${p.follows})
                  ON CONFLICT (username) DO UPDATE SET active = EXCLUDED.active, follows = EXCLUDED.follows
                `;
              }
            }
          }
        }
      }
    }
  }
  
  await setMeta('last_block', toBlock.toString());
  
  return { processedBlocks: toBlock - lastBlock, processedOps, newLastBlock: toBlock };
}
