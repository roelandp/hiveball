import os
import re

def replace_in_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

index_replacements = [
    ('lang="nl"', 'lang="en"'),
    ('The Ball, gooitest', 'The Ball'),
    ('Zet The Ball eerst op je beginscherm.', 'First add The Ball to your home screen.'),
    ('Vangen kan alleen vanuit de geïnstalleerde app. Dat is nodig voor meldingen.', 'Catching is only possible from the installed app. This is required for notifications.'),
    ('Installeer The Ball', 'Install The Ball'),
    ('Safari: tik op <strong>Delen</strong> en dan <strong>Zet op beginscherm</strong>. Open daarna The Ball vanaf je beginscherm.', 'Safari: tap <strong>Share</strong> then <strong>Add to Home Screen</strong>. Open The Ball from your home screen.'),
    ('Open deze pagina in Safari (iPhone) of Chrome (Android) en zet hem op je beginscherm.', 'Open this page in Safari (iPhone) or Chrome (Android) and add it to your home screen.'),
    ('Je wilt weten wanneer de ball op je af komt.', 'You want to know when the ball comes towards you.'),
    ('Zonder meldingen kun je niet vangen. Je krijgt alleen een melding als er een ball richting jou vliegt.', 'You cannot catch without notifications. You will only receive a notification if a ball flies towards you.'),
    ('Meldingen aanzetten', 'Enable notifications'),
    ('Locatie bepalen', 'Determine location'),
    ('Je locatie wordt afgerond tot een groot vak (geohash 3, ~156 km).', 'Your location is rounded to a large grid (geohash 3, ~156 km).'),
    ('>Locatie<', '>Location<'),
    ('Inloggen met Hive', 'Login with Hive'),
    ('The Ball gebruikt je posting key. Je moet deze actie goedkeuren in je wallet app (HiveAuth/Keychain).', 'The Ball uses your posting key. You must approve this action in your wallet app (HiveAuth/Keychain).'),
    ('Hive-gebruikersnaam', 'Hive username'),
    ('Inloggen en meedoen', 'Login and join'),
    ('Geen ball', 'No ball'),
    ('Er is nu geen ball bij jou in de buurt.', 'There is currently no ball near you.'),
    ('>Vangen<', '>Catch<'),
    ('Jij hebt de ball', 'You have the ball'),
    ('>Gooien<', '>Throw<'),
    ('Losse ball', 'Loose ball'),
    ('Eerste tik vangt.', 'First tap catches.'),
    ('Draai je in de richting waar je heen wilt gooien.', 'Turn in the direction you want to throw.'),
    ('Klaar om te gooien', 'Ready to throw'),
    ('Richting</dt>', 'Direction</dt>'),
    ('Piekversnelling</dt>', 'Peak acceleration</dt>'),
    ('Worpafstand</dt>', 'Throw distance</dt>'),
    ('Landing</dt>', 'Landing</dt>'),
    ('Vanger</dt>', 'Catcher</dt>'),
    ('Nog een keer', 'Again'),
    ('Test melding', 'Test notification'),
    ('O</span><span class="s">Z</span><span class="w">W</span>', 'E</span><span class="s">S</span><span class="w">W</span>'),
    ('<!-- 1: PWA installatie -->', '<!-- 1: PWA installation -->'),
    ('<!-- 5: Gooien -->', '<!-- 5: Throwing -->')
]

# Hive Branding Replacements
branding_replacements = [
    ('--bg: #141828;', '--bg: #121212;'),
    ('--ink: #eef0f6;', '--ink: #ffffff;'),
    ('--dim: #8b91a8;', '--dim: #a0a0a0;'),
    ('--ball: #f5a028;', '--ball: #E31337;'),
    ('--ball-hi: #ffdc96;', '--ball-hi: #ff4d6a;'),
    ('--line: #2a3050;', '--line: #333333;'),
    ('background: #0f1220;', 'background: #1a1a1a;'),
    ('color: #1a1000;', 'color: #ffffff;'),
    ('rgba(245,160,40,.35)', 'rgba(227,19,55,.35)'),
    ('#a8600e', '#7a0518')
]

replace_in_file('public/index.html', index_replacements + branding_replacements)

app_replacements = [
    ('Geïnstalleerd. Open The Ball nu vanaf je beginscherm.', 'Installed. Open The Ball from your home screen.'),
    ('Deze browser ondersteunt geen meldingen. Op iPhone: alleen vanaf het beginscherm, iOS 16.4 of hoger.', 'This browser does not support notifications. On iPhone: only from the home screen, iOS 16.4 or higher.'),
    ('Geen VAPID-key ingesteld: permissie wordt gevraagd, abonnement wordt overgeslagen.', 'No VAPID key set: permission requested, subscription skipped.'),
    ('Zonder meldingen kun je niet meedoen. Zet ze aan in de instellingen van je telefoon.', 'You cannot join without notifications. Enable them in your phone settings.'),
    ('Abonneren mislukte: ', 'Subscription failed: '),
    ('Je vak is: ', 'Your grid is: '),
    ('Locatie mislukt.', 'Location failed.'),
    ('Open je wallet-app (Keychain of HiveAuth) en keur de aanvraag goed. The Ball ziet nooit een key.', 'Open your wallet app (Keychain or HiveAuth) and approve the request. The Ball never sees a key.'),
    ('Keur nu de registratie transactie goed...', 'Now approve the registration transaction...'),
    ('Fout bij voorbereiden transactie: ', 'Error preparing transaction: '),
    ('Wachten op goedkeuring van de transactie in je wallet...', 'Waiting for transaction approval in your wallet...'),
    ('Transactie ondertekend, doorsturen naar server...', 'Transaction signed, forwarding to server...'),
    ('Registratie mislukt', 'Registration failed'),
    ('Dat is geen geldige Hive-naam.', 'That is not a valid Hive name.'),
    ('niet-absoluut', 'non-absolute'),
    ('Nog geen kompaswaarde. Beweeg je telefoon in een 8.', 'No compass value yet. Move your phone in a figure 8.'),
    ('Telefoon vasthouden. Gooi.', 'Hold phone. Throw.'),
    ('Gegooid. Bezig met vliegen...', 'Thrown. Flying...'),
    ('kaart', 'map'),
    ('Geland!', 'Landed!'),
    ('Gevangen door @', 'Caught by @'),
    (' in ', ' in '),
    (', afwijking ', ', deviation '),
    (' vangers in de kegel van ±', ' catchers in the cone of ±'),
    ('Niemand in de kegel. De ball rolde door naar de dichtstbijzijnde vanger in die richting.', 'No one in the cone. The ball rolled to the nearest catcher in that direction.'),
    ('Plons. Gooi opnieuw.', 'Splash. Throw again.'),
    ('Niemand daar. De ball ligt in het water.', 'No one there. The ball is in the water.'),
    ('geen', 'none'),
    ('Draai je in de richting waar je heen wilt gooien.', 'Turn in the direction you want to throw.'),
    ('Er komt een ball aan', 'A ball is coming'),
    ('Vang hem binnen 12 uur.', 'Catch it within 12 hours.'),
    ('Geen melding mogelijk (service worker of permissie ontbreekt).', 'No notification possible (service worker or permission missing).'),
    ('Mijn Locatie', 'My Location'),
    ("place: 'Locatie'", "place: 'Location'")
]
replace_in_file('public/app.js', app_replacements)
