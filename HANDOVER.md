# HANDOVER: The Ball

Wat er in dit pakket zit, wat je zelf moet regelen, en hoe je het draaiend krijgt en houdt.

## 1. Inhoud van het pakket

| Bestand | Voor wie | Wat |
|---|---|---|
| `the-ball-architectuur-v3.md` | jij en de builder | Productspec en spelregels. Wint bij twijfel over regels. |
| `BUILD_PROMPT.md` | de agent-builder | Engineering-spec: stack, bestandsboom, contracten, milestones. Geef dit als eerste prompt, met de andere twee bestanden en `seed/` in de werkmap. |
| `seed/gooitest/` | de builder | Werkende gooitest-PWA (gates, kompas, worpdetectie, matching-wiskunde). Wordt hergebruikt. |
| dit bestand | jij | Runbook. |

## 2. Stack in één regel

Vanilla PWA in `public/`, Node 20 serverless functions in `api/` op Vercel Hobby, Neon Postgres (gratis), HiveAuth voor alle ondertekening door spelers, `@hiveio/dhive` voor de chain, `web-push` voor meldingen, cron-job.org als minuutklok, three.js voor de planeet, Leaflet voor de feed-kaart.

Waarom deze keuzes op Vercel free: geen langlopend proces mogelijk, dus indexeren en timers zitten in één `/api/tick` die elke minuut van buiten wordt aangeroepen. Geen SQLite op schijf, dus Postgres. Geen websockets op de server nodig: HAS praat rechtstreeks van de telefoon naar de HAS-server.

## 3. Wat je vooraf zelf regelt (30 minuten)

1. **Hive-account `@theball`** (of een andere naam; dan overal `THEBALL_ACCOUNT` aanpassen). Posting key en active key bij de hand. Minimaal ~100 HP erop voor RC en RC-delegatie aan spelers. Volgerslijst van dit account is de spelerslijst.
2. **GitHub-repo** `github.com/roelandp/theball`, leeg.
3. **Vercel-account**, gekoppeld aan GitHub.
4. **Neon Postgres** via Vercel Marketplace (Storage → Neon, free). `DATABASE_URL` komt dan automatisch in de env.
5. **VAPID-keys**: `npx web-push generate-vapid-keys`. Public en private key bewaren.
6. **cron-job.org** account (gratis). Later een job aanmaken die elke minuut `https://<jouw-domein>/api/tick?secret=<TICK_SECRET>` GET.
7. **Aardtextuur**: NASA Blue Marble, 2048 px breed, opslaan als `public/earth-2048.jpg`. Zonder dit bestand tekent de app een effen bol.
8. **Twee telefoons** met Keychain Mobile of de HiveAuth-app, één iPhone, één Android, elk met een eigen Hive-account.
9. **Drie secrets** genereren: `SESSION_SECRET`, `TICK_SECRET`, `ADMIN_SECRET` (`openssl rand -hex 32`).

## 4. De builder aan het werk zetten

Werkmap: de repo, met daarin `BUILD_PROMPT.md`, `the-ball-architectuur-v3.md`, `HANDOVER.md` en `seed/`. Eerste prompt aan de agent:

> Lees BUILD_PROMPT.md en the-ball-architectuur-v3.md. Bouw milestone M1 en stop. Laat zien wat werkt.

Daarna per milestone: "Bouw M2 en stop." Enzovoort. Bij M2 zelf het HAS-rondje op de iPhone testen (PWA → Keychain → terug) voordat je M3 laat bouwen. Als dat rondje niet werkt, is de rest zinloos.

Waar de builder moet kiezen omdat de spec zwijgt, schrijft hij het in `DECISIONS.md`. Lees dat bestand na elke milestone.

## 5. Env-variabelen op Vercel

Project → Settings → Environment Variables. Alle regels uit `.env.example`:

| Naam | Waarde |
|---|---|
| `DATABASE_URL` | komt van Neon |
| `THEBALL_ACCOUNT` | `theball` |
| `THEBALL_POSTING_WIF` | posting key |
| `THEBALL_ACTIVE_WIF` | active key (alleen voor RC-delegatie) |
| `HIVE_API` | `https://api.hive.blog` (fallback: `https://api.deathwing.me`) |
| `HAS_SERVER` | `wss://hive-auth.arcange.eu` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | uit stap 3.5 |
| `VAPID_SUBJECT` | `mailto:jouw@adres` |
| `SESSION_SECRET`, `TICK_SECRET`, `ADMIN_SECRET` | uit stap 3.9 |
| `SPAWN_BLOCK` | het blocknummer van de eerste spawn; leeg laten tot na de eerste spawn, dan invullen en redeployen |
| `PUBLIC_URL` | `https://theball.vercel.app` of je eigen domein |

Timer-tunables (`REMINDER_1_MIN`, `LOOSE_MIN`, `BOUNCE_MIN`, `HOLD_HOURS`, enz.) hoef je alleen te zetten als je van de defaults afwijkt. Op de testdag: `REMINDER_1_MIN=1 LOOSE_MIN=2 BOUNCE_MIN=3 HOLD_HOURS=0.1`, daarna weer weghalen.

## 6. Eerste keer live (volgorde)

1. Push naar `main` → Vercel bouwt en deployt.
2. Migratie: `node db/migrate.js` lokaal met `DATABASE_URL` uit Vercel (`vercel env pull`), of via de builder.
3. cron-job.org job aanzetten op `/api/tick?secret=…`, elke minuut. Controleer in de job-log dat hij 200 geeft.
4. Eerste ball: `curl -X POST https://<domein>/api/admin/spawn -H "x-admin-secret: …" -d '{"origin":"Santpoort","msg":"Eerste ball.","holder":"roelandp"}'`. Zet daarna `SPAWN_BLOCK` in de env op het blocknummer uit het antwoord en redeploy.
5. Op beide telefoons: PWA installeren, meldingen, locatie, HAS-goedkeuring. Beide moeten in `/api/balls` c.q. de feed als actieve speler verschijnen.
6. Gooien van A naar B, vangen op B. Beide ops op hiveblocks bekijken.
7. Timers testen met minuutwaarden (zie 5), daarna terugzetten.

## 7. Dagelijks beheer

- **Feed**: `https://<domein>/feed.html` is je dashboard. Alles wat er gebeurt staat daar, met trx-links.
- **Nieuwe ball**: spawn-call uit stap 6.4, met of zonder `holder`. Zonder `holder` gooit `@theball` hem zelf; dan moet er nog een eerste throw-op komen, dus geef in de praktijk altijd een `holder` op (jijzelf op een podium bijvoorbeeld).
- **Ball dood**: automatisch na 12 uur vasthouden. Staat in de feed. Nieuwe ball spawnen als je wilt.
- **Speler klaagt dat hij niets ontvangt**: hij staat waarschijnlijk op `drop`. Laat hem de app openen en opnieuw registreren (één HAS-goedkeuring). iOS verliest subscriptions ook als de gebruiker de app een tijd niet opent.
- **Tick-log**: cron-job.org toont elke minuut de statuscode. Vercel → Functions → `api/tick` toont de logs. Als de indexer achterloopt zie je `behind: N` in de output; hij haalt 60 blocks per minuut in, de chain maakt er 20, dus hij loopt vanzelf bij.
- **RC-fouten**: `@theball` delegeert automatisch 5 miljard RC. Houd de HP van `@theball` in de gaten; onder ~50 HP stopt dat.

## 8. Grenzen van Vercel Hobby waar je tegenaan kunt lopen

| Grens | Gevolg | Uitweg |
|---|---|---|
| 10 s per function-call | tick moet klein blijven | `INDEX_MAX_BLOCKS` verlagen als hij time-out geeft |
| 100 GB bandbreedte per maand | ruim genoeg, tenzij de aardtextuur groot is | textuur onder 500 kB houden |
| Cron hooguit dagelijks | minuutklok kan niet intern | cron-job.org, gratis, elke minuut |
| Geen websockets | live feed is polling | feed ververst elke 30 s |
| Neon free: database pauzeert na inactiviteit | eerste call na een stille periode duurt 1 tot 2 s | acceptabel; de tick houdt hem toch wakker |
| Serverless is stateless | `aim` moet ergens bewaard worden | staat in Postgres (kolom of tabelletje), niet in geheugen |

Groeit het echt, dan is de stap naar een VPS met een langlopende indexer klein: `lib/` is puur, alleen `api/tick` wordt een loop.

## 9. Beveiliging, kort

- Spelers geven niets: geen key, geen authority, geen geld. Alles via HAS.
- Op de server alleen de keys van `@theball`. Raakt de active key gecompromitteerd, dan kan iemand RC delegeren en HP van dat account bewegen; houd er daarom niet meer HP op dan nodig.
- `TICK_SECRET` en `ADMIN_SECRET` zijn de enige deuren naar schrijfacties buiten HAS om. Roteren = env aanpassen, redeploy, cron-job.org job bijwerken.
- Locaties: alleen geohash 3 of 2, alleen op de chain. De server slaat geen GPS op.

## 10. Wat er niet in zit (bewust)

Eigen accountcreatie, meerdere balls tegelijk in de UI, moderatie, media, native apps, tokens, eigen HAS-server. Staat in de architectuur onder 13.
