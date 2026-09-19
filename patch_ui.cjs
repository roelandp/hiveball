const fs = require('fs');

// Patch index.html
let html = fs.readFileSync('public/index.html', 'utf8');
const homeHtml = `
<section class="step" id="s-home">
  <div id="home-no-ball" hidden>
    <h2>Geen ball</h2>
    <p id="no-ball-info">Er is nu geen ball bij jou in de buurt.</p>
  </div>
  <div id="home-incoming" hidden>
    <h2>Vangen</h2>
    <p id="incoming-info"></p>
    <button id="btn-catch">Vangen</button>
  </div>
  <div id="home-holder" hidden>
    <h2>Jij hebt de ball</h2>
    <p id="holder-info"></p>
    <button id="btn-go-throw">Gooien</button>
  </div>
  <div id="home-loose" hidden>
    <h2>Losse ball</h2>
    <p>Eerste tik vangt.</p>
    <button id="btn-catch-loose">Vangen</button>
  </div>
  <div class="err" id="home-err"></div>
</section>
`;
if (!html.includes('id="s-home"')) {
  html = html.replace('<!-- 5: Gooien -->', homeHtml + '\n<!-- 5: Gooien -->');
  html = html.replace('<script src="./geohash.js"></script>', '<script src="./geohash.js"></script>\n<script src="./throw.js"></script>');
  fs.writeFileSync('public/index.html', html);
}

// Patch app.js
let app = fs.readFileSync('public/app.js', 'utf8');

// replace goHome logic to show home states
app = app.replace(
  `$('who').textContent = '@' + data.player.username + ' (' + data.player.gh + ')';
    show('s-throw');`,
  `
    state.ball = data.ball;
    show('s-home');
    ['home-no-ball', 'home-incoming', 'home-holder', 'home-loose'].forEach(id => $(id).hidden = true);
    if (!data.ball) {
      $('home-no-ball').hidden = false;
    } else if (data.ball.role === 'incoming') {
      $('home-incoming').hidden = false;
    } else if (data.ball.role === 'holder') {
      $('home-holder').hidden = false;
    } else if (data.ball.role === 'loose') {
      $('home-loose').hidden = false;
    } else {
      $('home-no-ball').hidden = false;
    }
  `
);

// Add event listeners for Home buttons
app += `
$('btn-go-throw').addEventListener('click', () => {
  show('s-throw');
  // Trigger radar logic here
});

$('btn-catch').addEventListener('click', async () => {
  $('home-err').textContent = '';
  try {
    const ops = [
      ['custom_json', { required_auths: [], required_posting_auths: [state.user], id: 'theball', json: JSON.stringify({ v:1, op: 'catch', ball: state.ball.id, place: 'Locatie' }) }]
    ];
    HAS.sign(ops, false);
  } catch (e) {
    $('home-err').textContent = e.message;
  }
});
`;

fs.writeFileSync('public/app.js', app);
