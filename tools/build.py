"""Builds tracks.js and CREDITS.md for the Music Gallery.

    python tools/build.py

Reads the lobby list (C:/GameHub/games.js), the per-game music specs in tools/games/<Folder>.json and the game
repos under C:/ (only the committed files, via `git ls-files`), checks every track file, measures lengths with
ffprobe and writes:
    tracks.js   window.MUSIC = {games, tracks, skipped}
    CREDITS.md  every track's original credit, grouped by game
Procedural songs must first be rendered with `node tools/render.mjs` (they land in audio/<game>/<key>.m4a).
"""
import json, os, re, subprocess, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DRIVE = os.path.splitdrive(ROOT)[0] + os.sep          # C:\
LOBBY = os.path.join(DRIVE, 'GameHub', 'games.js')
SITE = 'https://ywchen0711.github.io'
SCENES = ['title', 'town', 'field', 'battle', 'boss', 'dungeon', 'event', 'ending', 'menu', 'minigame', 'other']
MOODS = ['heroic', 'calm', 'cheerful', 'playful', 'sad', 'tense', 'dark', 'mysterious', 'epic', 'romantic']


def js_str(s):
    """Decode a JS string literal body (single or double quoted)."""
    return re.sub(r"\\(u\{?[0-9a-fA-F]+\}?|.)", lambda m: (chr(int(m.group(1)[1:].strip('{}'), 16))
                                                            if m.group(1)[0] == 'u' and len(m.group(1)) > 1 else
                                                            {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1))), s)


STR = r"""(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")"""


def field(block, name):
    m = re.search(r'\b' + name + r'\s*:\s*' + STR, block)
    return js_str(m.group(1) if m.group(1) is not None else m.group(2)) if m else None


def lobby_games():
    src = open(LOBBY, encoding='utf-8').read()
    src = src[src.index('window.GAMES'):]
    games = []
    for block in re.split(r'\n  \},?\s*\n  \{', src):
        gid = field(block, 'id')
        if not gid: continue
        tm = re.search(r'\btitle\s*:\s*\{\s*zh\s*:\s*' + STR + r'\s*,\s*en\s*:\s*' + STR, block)
        title = {'zh': js_str(tm.group(1) if tm.group(1) is not None else tm.group(2)),
                 'en': js_str(tm.group(3) if tm.group(3) is not None else tm.group(4))} if tm else {'zh': gid, 'en': gid}
        games.append({'id': gid, 'url': field(block, 'url'), 'thumb': field(block, 'thumb'),
                      'color': field(block, 'color') or '#6b7280', 'title': title, 'added': field(block, 'added')})
    return games


def ls_files(folder):
    out = subprocess.run(['git', '-C', folder, 'ls-files'], capture_output=True, text=True, encoding='utf-8').stdout
    return set(out.splitlines())


def duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path],
                       capture_output=True, text=True)
    try: return round(float(r.stdout.strip()), 1)
    except ValueError: return None


def main():
    lobby = {g['id']: g for g in lobby_games()}
    specs = []
    for f in sorted(os.listdir(os.path.join(HERE, 'games'))):
        if f.endswith('.json'):
            specs.append(json.load(open(os.path.join(HERE, 'games', f), encoding='utf-8')))
    games, tracks, skipped, problems = [], [], [], []
    for s in specs:
        g = lobby.get(s['lobbyId'])
        if not g:
            problems.append(f"{s['folder']}: lobby id {s['lobbyId']} not in games.js"); continue
        if s['kind'] == 'none':
            skipped.append({'game': s['lobbyId'], 'title': g['title'], 'why': s.get('noneReason', 'no music')}); continue
        folder = os.path.join(DRIVE, s['folder'])
        committed = ls_files(folder)
        n0 = len(tracks)
        for t in s['tracks']:
            tid = s['lobbyId'] + '/' + t['key']
            rec = {'id': tid, 'game': s['lobbyId'], 'key': t['key'], 'scene': t['scene'] if t['scene'] in SCENES else 'other',
                   'mood': t.get('mood') if t.get('mood') in MOODS else 'calm', 'name': t['name'], 'where': t['where']}
            if t.get('file'):
                cands = [t['file']] + list(t.get('alt') or [])
                # a game may have added iPhone-friendly copies since the spec was written
                for c in list(cands):
                    stem = c.rsplit('.', 1)[0]
                    cands += [stem + '.m4a', stem + '.mp3']
                ok = [c for c in cands if c in committed]
                if not ok:
                    skipped.append({'game': s['lobbyId'], 'title': g['title'], 'why': f"{t['file']} is not committed"}); continue
                ok.sort(key=lambda c: 0 if c.endswith('.m4a') else 1 if c.endswith('.mp3') else 2)
                best = ok[0]
                o = t.get('orig') or {}
                own = t.get('original') or str(o.get('license') or '').lower().startswith('original')
                if not own and not (o.get('artist') and o.get('license')):
                    skipped.append({'game': s['lobbyId'], 'title': g['title'], 'why': f"{best}: no credit"}); continue
                rec['src'] = '/' + s['repo'] + '/' + best
                ogg = [c for c in ok if c.endswith('.ogg')]
                if best.endswith('.ogg'): rec['oggOnly'] = True
                elif ogg: rec['ogg'] = '/' + s['repo'] + '/' + ogg[0]
                rec['dur'] = duration(os.path.join(folder, best))
                if own: rec['original'] = True     # e.g. beats the game synthesised with its own tools
                else: rec['orig'] = {k: o.get(k) for k in ('title', 'artist', 'pack', 'license', 'url')}
            elif t.get('play') is not None:
                # sameAs: this game reuses another game's song data note for note; play that render
                rel = 'audio/' + (t.get('sameAs') or (s['lobbyId'] + '/' + t['key'])) + '.m4a'
                if t.get('sameAs'): rec['sameAs'] = t['sameAs']
                p = os.path.join(ROOT, rel)
                if not os.path.exists(p):
                    skipped.append({'game': s['lobbyId'], 'title': g['title'], 'why': f"{t['key']}: not rendered"}); continue
                rec['src'] = rel
                rec['dur'] = duration(p)
                rec['original'] = True
                if t.get('loopSec'): rec['loop'] = round(t['loopSec'], 1)
            elif t.get('src'):          # an original file (e.g. a beat the game synthesised itself)
                pass
            else:
                continue
            tracks.append(rec)
        if len(tracks) > n0:
            gi = {'id': g['id'], 'url': g['url'], 'title': g['title'], 'color': g['color'], 'repo': s['repo'],
                  'thumb': '/' + g['thumb'] if g.get('thumb') else None, 'count': len(tracks) - n0,
                  'kind': s['kind'], 'added': g.get('added')}
            if s.get('creditNote'): gi['creditNote'] = s['creditNote']
            games.append(gi)
    # lobby order (newest first) for the game list
    order = {gid: i for i, gid in enumerate(lobby)}
    games.sort(key=lambda g: order.get(g['id'], 999))
    tracks.sort(key=lambda t: order.get(t['game'], 999))
    data = {'built': datetime.date.today().isoformat(), 'site': SITE, 'games': games, 'tracks': tracks, 'skipped': skipped}
    with open(os.path.join(ROOT, 'tracks.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('// Generated by tools/build.py - do not edit by hand.\nwindow.MUSIC = ')
        json.dump(data, f, ensure_ascii=False, indent=0, separators=(',', ':'))
        f.write(';\n')
    write_credits(games, tracks, skipped)
    print(f"{len(games)} games, {len(tracks)} tracks, {len(skipped)} skipped")
    for p in problems: print('PROBLEM', p)


def write_credits(games, tracks, skipped):
    L = ['# Credits / 音樂來源', '',
         'Every piece of music in the gallery comes from one of the games on this site. The names shown in the gallery',
         '(Chinese and English) are the in-game titles we gave each piece; the original credit is listed here and next to',
         'each track in the player.', '',
         '音樂館裡每首曲子都來自本站的遊戲。館內顯示的中英文曲名是我們依照遊戲場景取的名字；原曲的作者、出處與授權列在下方，播放器裡也會顯示。', '',
         'File-based tracks are played from the game\'s own published folder (they are not copied here). Songs marked',
         '"original" were composed in code for that game and rendered to audio/ by tools/render.mjs.', '']
    for g in games:
        L += ['## ' + g['title']['zh'] + ' / ' + g['title']['en'], '', 'Play: ' + 'https://ywchen0711.github.io' + g['url'], '']
        for t in [t for t in tracks if t['game'] == g['id']]:
            nm = f"**{t['name']['zh']} / {t['name']['en']}**"
            if t.get('orig'):
                o = t['orig']
                title = f"\"{o['title']}\"" if o.get('title') else 'a track'
                pack = f" from *{o['pack']}*" if o.get('pack') else ''
                url = f" - {o['url']}" if o.get('url') else ''
                L.append(f"- {nm}: {title} by {o['artist']}{pack}, {o['license']}{url} (`{t['src']}`)")
            else:
                same = ''
                if t.get('sameAs'):
                    og = next((x for x in games if x['id'] == t['sameAs'].split('/')[0]), None)
                    if og: same = f"; same song data as {og['title']['en']}"
                L.append(f"- {nm}: original, composed in code for {g['title']['en']}{same} (`{t['src']}`)")
        L.append('')
    with open(os.path.join(ROOT, 'CREDITS.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(L))


if __name__ == '__main__':
    main()
