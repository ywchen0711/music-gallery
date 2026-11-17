# 音樂館 Music Gallery

**中文**

把本站所有遊戲的配樂放在同一個播放器裡。每首曲子都依照它在遊戲裡出現的場景取了中英文名字（例如標題畫面、城鎮、戰鬥、頭目戰、結局），旁邊標明是哪一款遊戲、在哪裡播放，以及原曲的標題、作者、素材包與授權。

- 線上收聽：https://ywchen0711.github.io/music-gallery/
- 依遊戲瀏覽，或在「全部曲目」用搜尋、遊戲、場景、氣氛篩選；可以收藏、隨機播放、重複播放、拖曳進度、調音量。
- 鍵盤：空白鍵 播放／暫停，← → 倒退／快轉 5 秒，Shift+← → 上一首／下一首，↑ ↓ 音量。
- 手機與 iPad 可用，支援鎖定畫面的播放控制，可加到主畫面。
- 用素材包音樂的遊戲：曲子直接從該遊戲自己的網址播放，不複製到這裡。
- 用程式即時作曲的遊戲（WebAudio 音序器）：用 `tools/render.mjs` 把遊戲自己的音樂程式錄成 `audio/<遊戲>/<曲目>.m4a`。
- 完整出處見 [CREDITS.md](CREDITS.md)。

**English**

The music of every game on this site in one player. Each piece has a Chinese and English name that fits the scene where it plays (title, town, battle, boss, ending ...), and shows which game it is from, where it plays, and the original title, artist, pack and licence.

- Listen: https://ywchen0711.github.io/music-gallery/
- Browse by game, or search and filter all tracks by game, scene and mood; favourites, shuffle, repeat, seek and volume.
- Keys: Space play/pause, Left/Right seek 5 s, Shift+Left/Right previous/next, Up/Down volume.
- Works on phones and iPad, with lock-screen controls (Media Session) and add-to-home-screen.
- Tracks from open music packs are streamed from each game's own published folder; nothing is copied here.
- Songs that a game composes in code (WebAudio sequencers) are recorded by running the game's own music code: `audio/<game>/<track>.m4a`.
- Every credit: [CREDITS.md](CREDITS.md).

## Rebuild / 重新產生

The games live in sibling folders under `C:\` (one git repo each). Requirements: Python 3 with Pillow, ffmpeg/ffprobe, Node.js, Chrome, and `puppeteer-core` (`npm i puppeteer-core` in `tools/`, or set `PPTR` to its folder).

1. `tools/games/<Folder>.json` - one spec per game: which tracks, our names, scene, mood, where they play, the original credit (file tracks) or the code that starts each song (procedural tracks). `kind: "none"` records a game that was checked and has no music. `sameAs` marks a song whose note data is identical to another game's, so it is rendered once.
2. Serve a folder that mirrors the site (each repo at `/<repo>/`, this one at `/music-gallery/`), e.g. a folder of junctions, then
   `node tools/render.mjs --base http://127.0.0.1:8401` renders the procedural songs it has not rendered yet (`--force` to redo, `--only Folder1,Folder2`). The harness `tools/render.html` swaps `AudioContext` for an `OfflineAudioContext` with virtual time, so each game's own sequencer runs unchanged; the result is level-matched, faded and saved as AAC 96 kb/s. A render that comes out silent is not kept. Results: `tools/render-log.json`.
3. `python tools/build.py` checks every file against the game's committed files (`git ls-files`), prefers .m4a/.mp3 over .ogg, measures lengths and writes `tracks.js` and `CREDITS.md`.
4. `python tools/art.py` redraws `thumb.jpg` (lobby picture) and the icons.

Open `index.html?base=https://ywchen0711.github.io` to play the other games' files from the live site while testing locally.
