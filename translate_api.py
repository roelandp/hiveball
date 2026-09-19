import os
import glob

def replace_in_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

replacements = [
    ('Methode niet toegestaan', 'Method not allowed'),
    ('Niet geautoriseerd', 'Unauthorized'),
    ('Interne fout', 'Internal error'),
    ('Geen register-operatie gevonden.', 'No register operation found.'),
    ('Geen geldige sessie voor locatie-update.', 'No valid session for location update.'),
    ('Bal niet gevonden', 'Ball not found'),
    ('Niet ingelogd.', 'Not logged in.'),
    ('Je hebt deze ball niet vast.', 'You are not holding this ball.'),
    ('Geen geldige throw-operatie gevonden.', 'No valid throw operation found.'),
    ('Transactie komt niet overeen met laatste mik.', 'Transaction does not match last aim.'),
    ('Geen geldige catch-operatie gevonden.', 'No valid catch operation found.'),
    ('Ball niet gevonden.', 'Ball not found.'),
    ('Je kunt deze ball niet vangen.', 'You cannot catch this ball.'),
    ('Gevangen!', 'Caught!'),
    (' heeft hem gevangen in ', ' caught it in '),
    ('Er ging iets mis bij het vangen.', 'Something went wrong while catching.'),
    ('Speler niet gevonden.', 'Player not found.'),
    ('Geen ball opgegeven.', 'No ball specified.'),
    ('Let op', 'Attention'),
    ('Je moet de ball binnenkort gooien!', 'You must throw the ball soon!'),
    ('Geen werkende notificaties meer.', 'No working notifications anymore.'),
    ('Niet meer actief (geen reactie op check).', 'No longer active (no response to check).'),
    ('Niet meer actief.', 'No longer active.')
]

for root, _, files in os.walk('api'):
    for file in files:
        if file.endswith('.js'):
            replace_in_file(os.path.join(root, file), replacements)

for root, _, files in os.walk('lib'):
    for file in files:
        if file.endswith('.js'):
            replace_in_file(os.path.join(root, file), replacements)

