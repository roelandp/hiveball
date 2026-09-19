# The Ball op Hive. Architectuur en scope v3

Vervangt v1 en v2. Wijzigingen ten opzichte van v2: HiveAuth (HAS) in plaats van posting key op de telefoon, onboarding in één ondertekende batch; balls met oplopend id, willekeurige naam en kleur; ketting-pagina wordt een chronologische feed van alle balls.

Vervangt v1 volledig. Wijzigingen ten opzichte van v1: geen posting authority en niets van de speler naar `@theball`; posting key blijft op de telefoon; drie worpklassen; plons in plaats van dood bij een lege kegel; radar met lock-on; 3D-planeet; reminder-reeks en losse ball in plaats van roll; stuit terug naar de gooier; levenstest via push-acks; `drop` op de chain; Hive-account als enige bron van waarheid.

## 1. Kernbesluiten

| # | Besluit | Waarom |
|---|---|---|
| 1.1 | Hive is de enige bron van waarheid. Spelerslijst, ball-toestand en de hele ketting zijn uit de ops met `custom_json` id `theball` plus de volgerslijst van `@theball` te berekenen. De server bewaart alleen push-subscriptions en sessies. | Iedereen kan het naspelen en controleren; de server kan weg en alles is er nog. |
| 1.2 | Speler = volgt `@theball` én laatste eigen op is `register` (niet `drop`). Ontvolgen = uit het spel. | Zichtbaar op elk Hive-frontend, gratis werving. |
| 1.3 | De speler geeft niets aan `@theball`: geen geld, geen authority, geen key. Alle ops worden ondertekend via HiveAuth (HAS) in de wallet-app van de speler (Keychain Mobile of HiveAuth-app). Onboarding is één transactie, één goedkeuring; throw en catch zijn elk één goedkeuring. | Geen drempel, geen key in de browser, niets op de server. |
| 1.4 | Locatie op de chain als geohash van 3 tekens (~156×156 km), of 2 (~1250×625 km) als de speler dat wil. Nooit preciezer, nergens anders opgeslagen. | Grof genoeg voor privacy, fijn genoeg om te mikken. |
| 1.5 | Drie worpklassen: zacht, medium, ver. Lege kegel = plons, meteen opnieuw. | Simpel te tunen, simpel uit te leggen, nooit onnodig dood. |
| 1.6 | Niet gevangen binnen 2 uur = ball stuit terug naar de gooier, die opnieuw gooit met een verse 12 uur. Dood alleen bij 12 uur vasthouden zonder gooien. | Ketting stopt alleen als iemand hem echt laat liggen. |
| 1.7 | Elke push is een levenstest. Geen ack + 14 dagen geen app-open = `drop` op de chain door `@theball`. Opnieuw registreren maakt actief. | Geen spoken in de kandidatenlijst, en de conclusie staat waar de waarheid staat. |
| 1.8 | Eén ball in v1. Bericht per worp max 140 tekens, on-chain, geen moderatie. | Schaarste; de ketting is het verhaal. |

## 2. Rollen

- `@theball`: spawnt balls, schrijft `bounce`, `dead`, `drop`, delegeert RC aan spelers die te weinig hebben. Alleen zijn eigen posting key en active key (voor RC-delegatie) staan op de server.
- Speler: bestaand Hive-account. Nieuwe accounts via signup.hive.io in v1; eigen accountcreatie is v2.
- Toeschouwer: iedereen, zonder login, op de publieke ketting-pagina.

## 3. Onboarding, in deze volgorde

1. **Beginscherm.** Niet geïnstalleerd = instructie, verder niets.
2. **Meldingen.** Permissie + push-subscription naar de server. Geweigerd = niet verder.
3. **Locatie.** GPS, omgezet naar geohash 3 (schakelaar naar 2), plaatsnaam naar keuze. De speler ziet welk vak publiek wordt. Nog niets ondertekend.
4. **Inloggen, volgen en registreren in één keer.** Gebruikersnaam invullen. De app vraagt een nonce bij de server en stuurt via HAS één `sign_req` (broadcast door de server, niet door HAS) met twee ops: `follow` op `@theball` (weggelaten als hij al volgt) en `register` met `gh`, `place` en de nonce. De wallet-app opent, de speler keurt één keer goed. De server verifieert de handtekening tegen de posting key op de chain, broadcast de transactie, en maakt de sessie aan. Login is daarmee bewezen zonder aparte challenge. Uitleg in één zin: "Je wallet tekent, The Ball ziet nooit een key."
5. **Klaar.** Home toont waar de ball nu is.

Spelers zonder Keychain Mobile of HiveAuth-app krijgen in stap 4 de downloadlink; zonder wallet-app kun je niet meedoen.

## 4. Ball state machine

```
spawned ──throw──▶ in_flight ──catch──▶ held ──throw──▶ in_flight ──▶ ...
                      │                    │
                      │ +90 min: los       │ 12h geen throw
                      ▼                    ▼
                    loose ──catch──▶ held  dead
                      │
                      │ +120 min
                      ▼
                    bounce ──▶ held (bij de gooier, verse 12h)
```

Plons is geen toestand: de ball blijft `held` bij de gooier, er komt geen op op de chain.

## 5. On-chain formaat

Alle ops: `custom_json`, `id: "theball"`, `v: 1`. Ondertekend met de posting key van de speler tenzij anders vermeld.

**spawn** (`@theball`; `ball` oplopend, `name` willekeurig uit een woordenlijst, `color` hex)
```json
{"v":1,"op":"spawn","ball":"b1","name":"Kobalt","color":"#2a6df4","origin":"Barcelona","msg":"Gegooid vanaf het podium van ChainCulture."}
```

**register** (speler; laatste telt, dus ook de manier om je locatie bij te werken; `nonce` van de server, alleen relevant voor de login, wordt door de indexer genegeerd)
```json
{"v":1,"op":"register","gh":"u17","place":"Santpoort","nonce":"8f3a…"}
```

**drop** (`@theball`; speler is niet meer bereikbaar)
```json
{"v":1,"op":"drop","who":"arcange","reason":"push_dead"}
```
`reason`: `push_dead` (410, of geen ack op twee opeenvolgende pushes en 14 dagen geen app-open) of `unfollowed` (informatief; ontvolgen alleen is al genoeg).

**throw** (speler, moet houder zijn)
```json
{"v":1,"op":"throw","ball":"b1","to":"arcange","cls":"far","bearing":214,"peak":23.4,"place":"Santpoort","msg":"Vang!"}
```
`cls`: `soft`, `mid`, `far`. `to` is de eerste kandidaat.

**catch** (speler; geldig als hij `to` is, of bij `loose` een van de drie kandidaten en de eerste in blockvolgorde)
```json
{"v":1,"op":"catch","ball":"b1","place":"Brussel"}
```

**bounce** (`@theball`; 120 min geen catch)
```json
{"v":1,"op":"bounce","ball":"b1","from":"arcange","back_to":"roelandp","also":["stoodkev","gtg"]}
```

**dead** (`@theball`; 12 uur vasthouden)
```json
{"v":1,"op":"dead","ball":"b1","holder":"stoodkev","throws":41}
```

Validatieregels bij indexeren, in blockvolgorde:
- `register` telt alleen als het account op dat moment `@theball` volgt.
- `throw` alleen door de huidige houder; `catch` alleen door `to`, of bij een losse ball door een van `to` + `also`.
- Ongeldige ops worden genegeerd. De toestand van een ball is de reeks geldige ops.

Actieve spelerslijst = volgers van `@theball` ∩ accounts waarvan de laatste `register`/`drop`-op een `register` is.

## 6. Server

Node 20, Fastify, SQLite, `@hiveio/dhive` (lezen, indexeren, ops van `@theball`), `web-push`. Eén proces, PM2, achter Caddy met https op je VPS. Geen spelerkeys, nooit.

### 6.1 Onderdelen

- **indexer**: streamt blocks, filtert id `theball` en follow-ops op `@theball`, bouwt state. Bij herstart opnieuw vanaf het spawn-block; de database is een cache.
- **matcher**: kiest de kandidaten bij een worp (zie 7).
- **radar**: geeft de gooier richting en klasse van alle actieve spelers ten opzichte van zijn vak.
- **timers**: elke minuut: reminders, los maken, bounce, dead, en de levenstest.
- **pusher**: web-push; 410 = subscription weg; elke push krijgt een id en wacht op een ack.
- **broadcaster**: alleen voor de ops van `@theball` en voor RC-delegatie.

### 6.2 Database

```
players    (username PK, gh, place, active, registered_block, last_open, last_ack)   -- gh/place/active uit de chain
push_subs  (id PK, username, endpoint, p256dh, auth, ua, created_at, dead_at)
pushes     (id PK, username, kind, sent_at, acked_at)
balls      (id PK, name, state, holder, to_user, also, in_flight_since, held_since, throws, dead_at)
ball_ops   (id PK, ball, op, username, json, block, trx_id, ts)
sessions   (token PK, username, expires_at)
```

### 6.3 API

| Methode | Pad | Doet |
|---|---|---|
| GET | `/auth/nonce` | nonce voor de register-op |
| POST | `/auth/register` | de door HAS ondertekende transactie (follow + register). Server verifieert handtekening tegen de posting key op de chain, broadcast, maakt sessie. Ook voor herregistratie na `drop` en voor het bijwerken van je locatie (dan zonder follow-op). |
| POST | `/me/push` | subscription opslaan of vervangen |
| POST | `/me/open` | app geopend; zet `last_open` |
| POST | `/push/ack` | vanuit de service worker: push-id ontvangen |
| GET | `/me` | eigen status, ball die op mij af komt of die ik vasthoud, deadlines |
| GET | `/radar` | alleen voor de houder: lijst van `{bearing, cls}` per actieve speler, zonder namen of locaties |
| POST | `/ball/:id/aim` | houder: bearing + peak. Server rekent klasse, kegel en kandidaten uit. Antwoord: `hit` met vanger, klasse en afstand, of `splash`. Nog niets op de chain. |
| POST | `/ball/:id/throw` | houder: de via HAS ondertekende throw-transactie (met `to` uit `aim`). Server broadcast hem, start reminders, push naar `to`. |
| POST | `/ball/:id/catch` | via HAS ondertekende catch-transactie; server broadcast en pusht "gevangen in Brussel" naar de gooier. |
| GET | `/feed` | publiek: alle ops van alle balls, nieuwste eerst, gepagineerd |

HAS-flow in de app: `hive-auth-wrapper` (browser-bundel), websocket naar `hive-auth.arcange.eu`, deep link naar de wallet-app, resultaat komt terug over de websocket. Voor throw en catch vraagt de app om `broadcast: false` zodat de server broadcast en meteen kan pushen.
| GET | `/ball/:id` | publiek: state + ketting |
| GET | `/balls` | publiek |
| POST | `/admin/spawn` | admin-secret |

Een throw of catch die de app direct naar een Hive-node stuurt in plaats van via de server is ook geldig; de indexer pikt hem op. De server-route bestaat alleen zodat pushes meteen vertrekken.

### 6.4 RC

RC gaat van de speler af. Bij `RC_EXCEEDED` delegeert `@theball` 5 miljard RC naar de speler en de app probeert opnieuw. `@theball` heeft daarvoor ~100 HP nodig.

## 7. Worpklassen, kegel en matching

Piek (m/s², zonder zwaartekracht) → klasse. Startwaarden, tunen op echte worpen:

| klasse | piek | bereik |
|---|---|---|
| soft | 8 tot 15 | eigen vak en de 8 buurvakken, ~0 tot 250 km |
| mid | 15 tot 28 | 250 tot 3000 km |
| far | > 28 | > 3000 km |

Matching, vanuit het middelpunt van het vak van de gooier:
1. Kandidaten: actieve spelers (chain), min de gooier, min de laatste 5 houders, min spelers met een dode of nooit-geackte subscription.
2. Per kandidaat great-circle bearing en afstand naar het middelpunt van zijn vak.
3. Kegel ±20°, en afstand binnen de klasse.
4. Sorteer op afwijking van de bearing. Nummer 1 is `to`, 2 en 3 zijn `also`.
5. Niemand: `splash`. De app laat de ball in het water vallen en de gooier gooit opnieuw. Geen op, geen straf, 12 uur loopt door.

Onder ~10 spelers is bijna elke `far`-worp een plons. Dat is eerlijk; de radar laat het al zien voordat je gooit.

## 8. Lock-on en radar

Terwijl de speler draait, vergelijkt de app de kompasrichting met de radar-lijst. Zodra een speler binnen ±20° valt, tikt de telefoon kort en licht de ring op met de klasse waarin hij zit. Meerdere spelers in de kegel = meerdere tikjes, kort na elkaar.

Haptiek: Android via `navigator.vibrate`. iOS Safari heeft geen vibratie-API; daar een korte toon via Web Audio plus de visuele puls. Geen hack via verborgen switch-elementen, dat breekt bij elke iOS-update.

De radar bevat geen namen en geen locaties, alleen `{bearing, cls}`. Met geohash 3 op de chain is dat toch al publiek, maar de app hoeft het niet te benadrukken.

## 9. Niet gevangen: de reeks

| tijd na throw | wat |
|---|---|
| 0 | push naar `to`: "Er komt een ball aan uit Santpoort. Vang hem." |
| +45 min | push naar `to`: "De ball ligt nog voor je." |
| +90 min | ball wordt los. Push naar `to`, en naar `also` (2 spelers): "Losse ball in jouw richting, eerste tik vangt." |
| +120 min | `bounce`. Push naar de gooier: "Niemand ving hem. Hij ligt weer bij jou, 12 uur." Push naar `to`: "Je liet hem liggen." |

Wie een ball liet liggen zonder één ack op die pushes gaat naar de levenstest (10). Wie wel ackte maar niet ving, blijft actief; die was er gewoon niet aan toe.

## 10. Levenstest

- Elke push heeft een id. De service worker doet bij ontvangst `POST /push/ack` (werkt met de app dicht; de worker krijgt daarvoor even tijd).
- 404/410 bij versturen: subscription weg. Geen andere subscription voor dat account = `drop` met `push_dead`.
- Twee opeenvolgende pushes zonder ack én 14 dagen geen `/me/open` = `drop`.
- Spelers die 14 dagen niets ontvingen krijgen één zichtbare "Doe je nog mee?"-push. Ack = actief. Geen ack + geen app-open in de 7 dagen erna = `drop`.
- Na `drop`: opnieuw registreren via de app (nieuwe `register`-op) maakt actief. De app toont dat op Home: "Je stond uit. Weer meedoen?"

iOS staat geen stille pushes toe, dus alles wat hierboven staat is zichtbaar voor de speler. Dat is oké: het is nooit vaker dan één push per twee weken buiten het spel om.

## 11. PWA

Vanilla, uitbreiding van `theball-gooitest`. Signing via `hive-auth-wrapper` (lokaal meegeleverd). Geohash-encode is 40 regels, eigen code.

Schermen:
1. **Onboarding**, de vijf stappen uit hoofdstuk 3.
2. **Home**, vier toestanden: geen ball (waar hij is, hoeveel worpen), ball komt op me af (grote ball, tik om te vangen, resterende tijd), ik houd hem (bericht van de gooier, ketting, aftelklok, knop Gooien), net gegooid (planeet, dan terug).
3. **Gooien**: kompasring, radar-lock-on, berichtveld, gooien. Plons = animatie en meteen opnieuw.
4. **Planeet**: three.js (r128 UMD, gepind), lage-resolutie bol met een 2048 px aardtextuur uit het publieke domein, gebundeld. Na de worp draait de bol naar de gooier en tekent de grote-cirkelboog naar de vanger, 3 seconden, dan het vangst-scherm. Zelfde boog bij een plons, eindigend in zee. Terugval: de 2D-kaart, als de bol niet af is.
5. **Instellingen**: locatie bijwerken (GPS opnieuw, geohash 3 of 2, plaatsnaam, één HAS-goedkeuring voor een nieuwe `register`-op), meldingen testen, uitloggen. Bij het openen van de app vergelijkt hij de GPS met het vak op de chain; ander vak = voorstel om bij te werken. Een ball die al naar je onderweg is, blijft onderweg; de nieuwe locatie geldt voor alles daarna.
6. **Feed**: publiek, zonder login. Eén chronologische lijst van alle balls door elkaar, nieuwste bovenaan, elke regel in de kleur van zijn ball: "Kobalt gespawnd in Barcelona", "@roelandp gooide Kobalt naar Brussel: 'Vang!'", "@arcange ving Kobalt in Brussel", "Kobalt stuitte terug naar @roelandp", "Kobalt stierf bij @stoodkev na 41 worpen". Berichten hangen tussen de acties, precies zoals ze on-chain staan. Filter per ball; per ball ook een Leaflet-kaart met de baan. Elke regel linkt naar de trx op hiveblocks. Dit is het scherm voor op een event.

Service worker: pushes tonen met badge, ack sturen, bij klik naar Home.

## 12. Bouwdag, milestones

**M1, 09:00 tot 10:30. Chain en indexer.**
`@theball`, keys in `.env`, VAPID-keys. Fastify + SQLite + dhive. `/admin/spawn` schrijft de spawn; indexer leest hem terug; `GET /ball/b1` toont hem. Klaar als de spawn op hiveblocks staat en de API hem teruggeeft.

**M2, 10:30 tot 12:30. Onboarding.**
HAS-koppeling, één sign_req met follow + register (met nonce), server verifieert en broadcast, sessie, push-subscription, geohash. Klaar als twee telefoons als actieve speler uit de chain rollen en een testpush ontvangen én acken.

**M3, 13:00 tot 15:30. Gooien en vangen.**
Radar, `aim` met klassen en kegel, lock-on, throw en catch lokaal ondertekend, pushes, Home met vier toestanden. Klaar als A naar B gooit, B een push krijgt en vangt, en beide ops geldig op de chain staan.

**M4, 15:30 tot 17:00. Reeks, bounce, dead, levenstest.**
Reminders, los, bounce, dead, `drop`. Timers tijdelijk op minuten. Klaar als een niet-gevangen ball zichtbaar los wordt, terugstuit, en een niet-ackende speler een `drop` krijgt op de chain.

**M5, 17:00 tot 18:00. Planeet en feed.**
Bol met boog; publieke feed met filter per ball en kaart. Terugval op de 2D-kaart als de bol niet af is.

**M6, 18:00 tot 19:00. Deploy en tunen.**
VPS, https, PM2. Vijf echte worpen, klassegrenzen en kegel bijstellen, timers terug naar echte waarden.

Klaarleggen: `@theball` met posting en active key, VPS met domein, `npx web-push generate-vapid-keys`, één iPhone en één Android met de PWA op het beginscherm, aardtextuur (NASA Blue Marble, 2048 px).

## 13. Niet in v1

Eigen accountcreatie; meerdere balls in de UI; moderatie; media in de ball; native apps; tokens, beloningen, NFT's; online-detectie anders dan via acks.

## 14. Risico's

| Risico | Maatregel |
|---|---|
| HAS-rondje op iOS (PWA → Keychain → terug) hapert | Testen op M2. Resultaat komt over de websocket, dus ook als de speler handmatig terugswitcht. Time-out van 60 s met een "opnieuw"-knop. |
| HAS-server (arcange) offline | Eigen HAS-instantie is v2; voor v1 accepteren. |
| iOS-subscription verloopt stil | Bij elke app-open hersturen; levenstest vangt de rest. |
| iOS geen haptiek | Toon + puls. |
| Kompas 10 tot 30° mis, vakken van 156 km | Kegel ±20°; korte worpen zijn bewust wat willekeurig; de radar toont vooraf wie je kunt raken. |
| Speler zonder RC | RC-delegatie vanuit `@theball`. |
| Server valt uit | Ketting op de chain blijft intact; bij herstart bouwt de indexer alles op. Alleen timers en pushes staan zolang stil. |
| Weinig spelers | Veel plonzen, weinig `far`. Radar maakt dat vooraf zichtbaar; de ball sterft er niet van. |
| Spam via berichten | 140 tekens, één per worp, alleen de houder. |

## 15. Repo

```
theball/
  server/  index.js chain.js indexer.js matcher.js radar.js timers.js push.js db.js config.js .env.example
  pwa/     index.html app.js sw.js has.js geohash.js globe.js manifest.webmanifest icons/ earth-2048.jpg
           feed.html
  README.md
```
