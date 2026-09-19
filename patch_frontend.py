import re

with open('public/index.html', 'r') as f:
    html = f.read()

scripts = """<script src="./vendor/crypto-js.min.js"></script>
<script src="./has.js"></script>
<script src="./geohash.js"></script>
<script src="./app.js"></script>"""
html = html.replace('<script src="./app.js"></script>', scripts)

# Update Hive section
hive_html = """<!-- 3: Locatie -->
<section class="step" id="s-sensors">
  <h2>Locatie</h2>
  <p>Je locatie wordt afgerond tot een groot vak (geohash 3, ~156 km).</p>
  <button id="btn-sensors">Locatie bepalen</button>
  <div class="err" id="sensors-err"></div>
  <p class="note" id="sensors-note"></p>
</section>

<!-- 4: HiveAuth -->
<section class="step" id="s-hive">
  <h2>Inloggen met Hive</h2>
  <p>The Ball gebruikt je posting key. Je moet deze actie goedkeuren in je wallet app (HiveAuth/Keychain).</p>
  <label for="hive-user" class="dim">Hive-gebruikersnaam</label>
  <input id="hive-user" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="roelandp">
  <button id="btn-hive">Inloggen en meedoen</button>
  <div class="err" id="hive-err"></div>
  <p class="note" id="hive-status"></p>
  <div id="hive-qr" style="margin-top: 15px;"></div>
</section>"""
html = re.sub(r'<!-- 3: Hive -->.*<!-- 5: Gooien -->', hive_html + '\n\n<!-- 5: Gooien -->', html, flags=re.DOTALL)

with open('public/index.html', 'w') as f:
    f.write(html)
