const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace(
  '<button id="btn-hive">Login and join</button>',
  '<button id="btn-hive">Connect Wallet</button>\n  <button id="btn-register" hidden>Sign Registration</button>'
);
fs.writeFileSync('public/index.html', html);
