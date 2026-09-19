# The Ball, gooitest

Statische PWA, geen server nodig voor de test. Vangers zijn hardcoded in `app.js` (CATCHERS).

## Deployen

Vereist https (sensoren, service worker en push werken niet over http, behalve op localhost).

    scp -r theball/ user@host:/var/www/theball/

Of lokaal:

    cd theball && python3 -m http.server 8080
    # op de telefoon via je Hetzner tunnel of ngrok, want http op LAN-IP werkt niet

## Volgorde in de app

1. Geïnstalleerd als PWA (anders: instructie). iOS: Safari > Delen > Zet op beginscherm.
2. Meldingspermissie. Zonder `VAPID_PUBLIC_KEY` in `app.js` wordt alleen de permissie afgedwongen, het abonnement wordt overgeslagen.
3. Hive-naam, gecheckt via `condenser_api.get_accounts` op api.hive.blog. Geen signature in deze test.
4. Kompas, beweging en locatie. Locatie wordt afgerond op 0.1 graad.
5. Gooien: "Klaar om te gooien" tikken, telefoon vasthouden, gooibeweging maken. 450 ms na de laatste piek wordt de worp afgerond.

Desktop-ontwikkeling: `index.html?skipgates=1` slaat stap 1 en 2 over. Sensoren werken dan niet, dus verder kom je niet.

## VAPID

    npx web-push generate-vapid-keys

Public key in `CONFIG.VAPID_PUBLIC_KEY`. Het abonnement komt in `localStorage.push-sub`; later POST naar de server. Testen vanaf de command line:

    npx web-push send-notification --endpoint=... --key=... --auth=... --vapid-subject=mailto:jij@celenation.nl --vapid-pubkey=... --vapid-pvtkey=... --payload='{"title":"Er komt een ball aan","body":"Vang hem binnen 12 uur."}'

## Parameters (CONFIG in app.js)

| naam | betekenis | nu |
|---|---|---|
| CONE_DEG | halve kegelbreedte | 20° |
| MIN_PEAK | minimale piekversnelling om als worp te tellen | 8 m/s² |
| MAX_PEAK | piek die als maximale worp geldt | 40 m/s² |
| MIN_KM / MAX_KM | afstandsbereik, log-schaal tussen MIN_PEAK en MAX_PEAK | 5 / 5000 km |

Je gaat MIN_PEAK en MAX_PEAK moeten tunen op echte worpen; een Android-telefoon rapporteert vaak andere pieken dan een iPhone.

## Bekende beperkingen

- Kompas 10 tot 30 graden slordig, vandaar de kegel.
- Android zonder `deviceorientationabsolute` geeft een relatieve heading (label "niet-absoluut" verschijnt).
- Schermrotatie wordt niet gecorrigeerd; app staat op portrait in het manifest.
- Geen echte online-check van vangers, zie gesprek: die bestaat niet in webpush.
