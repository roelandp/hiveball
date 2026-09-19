import os

def replace_in_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

feed_html = [
    ('lang="nl"', 'lang="en"'),
    ('Alle Ballen', 'All Balls'),
    ('Laden...', 'Loading...'),
    ('background: #111;', 'background: #121212;'),
    ('background: #222;', 'background: #1a1a1a;'),
    ('background: #007aff;', 'background: #E31337;'),
    ('color: #007aff;', 'color: #E31337;')
]

feed_js = [
    ('Bal <strong>${op.ball_name}</strong> is gespawnd in ${j.origin}.', 'Ball <strong>${op.ball_name}</strong> spawned in ${j.origin}.'),
    ('heeft zich geregistreerd vanuit', 'registered from'),
    ('is gedropt wegens', 'was dropped due to'),
    ('gooide de bal naar', 'threw the ball to'),
    ('ving de bal in', 'caught the ball in'),
    ("'onbekend'", "'unknown'"),
    ('Bal stuitert terug van <strong>@${j.from}</strong> naar <strong>@${j.back_to}</strong>.', 'Ball bounces back from <strong>@${j.from}</strong> to <strong>@${j.back_to}</strong>.'),
    ('Bal is dood bij <strong>@${j.holder}</strong> na ${j.throws} worpen.', 'Ball is dead at <strong>@${j.holder}</strong> after ${j.throws} throws.'),
    (' deed ', ' did '),
    ("'nl-NL'", "'en-US'"),
    ("'#007aff'", "'#E31337'")
]

replace_in_file('public/feed.html', feed_html)
replace_in_file('public/feed.js', feed_js)
