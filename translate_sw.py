import os

def replace_in_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

has_js = [
    ('Niet verbonden met HiveAuth.', 'Not connected to HiveAuth.')
]

sw_js = [
    ('Er komt een ball aan.', 'A ball is coming.')
]

replace_in_file('public/has.js', has_js)
replace_in_file('public/sw.js', sw_js)
