import { setMeta } from './lib/db.js';
async function run() {
  await setMeta('last_block', '110047600');
  console.log('Set last_block to 110047600');
}
run();
