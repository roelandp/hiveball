import { sql } from './lib/db.js';
async function run() {
  const meta = await sql`SELECT * FROM meta`;
  const balls = await sql`SELECT * FROM balls`;
  const ops = await sql`SELECT * FROM ball_ops`;
  console.log('META:', meta);
  console.log('BALLS:', balls);
  console.log('OPS:', ops);
}
run();
