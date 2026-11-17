// 音樂館 Music Gallery - one <audio> element plays the music of every game on the site.
(function () {
  'use strict';
  const D = window.MUSIC || { games: [], tracks: [], skipped: [] };
  const $ = (s, r = document) => r.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('mg.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mg.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const Q = new URLSearchParams(location.search);
  // ?base=https://ywchen0711.github.io plays the other games' files from that site (for local testing)
  const BASE = (Q.get('base') || '').replace(/\/$/, '');
  const ua = navigator.userAgent;
  const IOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (IOS) document.documentElement.classList.add('ios');

  const audio = $('#audio');
  const canOgg = !!audio.canPlayType('audio/ogg; codecs="vorbis"');
  const GAME = Object.fromEntries(D.games.map((g) => [g.id, g]));
  const TRACK = Object.fromEntries(D.tracks.map((t) => [t.id, t]));
  const srcOf = (t) => {
    let s = t.src;
    if (!canOgg && t.oggOnly) return null;
    if (s.startsWith('/')) s = BASE + s;
    return s;
  };
  const playable = (t) => !!srcOf(t);
  const thumbOf = (g) => (g && g.thumb ? BASE + g.thumb : '');

  // ---------- language ----------
  let lang = store.get('lang', 'zh'); // Chinese by default
  const other = () => (lang === 'zh' ? 'en' : 'zh');
  const L = (o) => (o ? o[lang] || o.en || o.zh || '' : '');
  const LO = (o) => (o ? o[other()] || '' : '');
  const T = (zh, en) => (lang === 'zh' ? zh : en);
  const SCENES = {
    title: ['標題', 'Title'], town: ['城鎮', 'Town'], field: ['野外', 'Field'], battle: ['戰鬥', 'Battle'], boss: ['頭目戰', 'Boss'],
    dungeon: ['迷宮', 'Dungeon'], event: ['劇情', 'Story'], ending: ['結局', 'Ending'], menu: ['選單', 'Menu'],
    minigame: ['關卡', 'Stage'], other: ['其他', 'Other'],
  };
  const MOODS = {
    heroic: ['英勇', 'Heroic'], calm: ['寧靜', 'Calm'], cheerful: ['歡快', 'Cheerful'], playful: ['俏皮', 'Playful'], sad: ['哀傷', 'Sad'],
    tense: ['緊張', 'Tense'], dark: ['陰暗', 'Dark'], mysterious: ['神秘', 'Mysterious'], epic: ['壯闊', 'Epic'], romantic: ['柔情', 'Tender'],
  };
  const sceneName = (k) => T(...(SCENES[k] || SCENES.other));
  const moodName = (k) => T(...(MOODS[k] || ['', '']));
  function applyLang() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    document.querySelectorAll('[data-zh]').forEach((el) => { el.textContent = el.dataset[lang]; });
    $('#langBtn').textContent = lang === 'zh' ? 'EN' : '中文';
    document.title = T('音樂館 Music Gallery', 'Music Gallery 音樂館');
  }
  $('#langBtn').onclick = () => { lang = other(); store.set('lang', lang); applyLang(); render(); updateNow(); };

  // ---------- theme ----------
  let theme = store.get('theme', '');
  const applyTheme = () => { if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme; };
  $('#themeBtn').onclick = () => {
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    theme = dark ? 'light' : 'dark'; store.set('theme', theme); applyTheme();
  };
  applyTheme();

  // ---------- favourites ----------
  let favs = new Set(store.get('favs', []));
  const toggleFav = (id) => { favs.has(id) ? favs.delete(id) : favs.add(id); store.set('favs', [...favs]); };

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (s) => { if (!isFinite(s) || s < 0) return '0:00'; s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const playUrl = (g) => (BASE || '') + g.url;
  function creditHTML(t, g) {
    if (t.original) {
      let c = T('原創配樂，以程式為《' + g.title.zh + '》作曲', 'Original, composed in code for ' + g.title.en);
      const o = t.sameAs && TRACK[t.sameAs] && GAME[TRACK[t.sameAs].game];
      if (o) c += T('；與《' + o.title.zh + '》的「' + TRACK[t.sameAs].name.zh + '」是同一段旋律', '; the same tune as “' + TRACK[t.sameAs].name.en + '” in ' + o.title.en);
      return esc(c);
    }
    const o = t.orig || {};
    const parts = [];
    parts.push(T('原曲', 'Original') + ': ' + (o.title ? '“' + esc(o.title) + '”' : T('（未命名曲目）', '(untitled track)')));
    if (o.artist) parts.push(esc(o.artist));
    if (o.pack) parts.push(esc(o.pack));
    if (o.license) parts.push(esc(o.license));
    let s = parts.join(' · ');
    if (o.url) s += ' · <a href="' + esc(o.url) + '" target="_blank" rel="noopener">' + T('出處', 'source') + '</a>';
    return s;
  }
  const creditText = (t, g) => creditHTML(t, g).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  // ---------- views ----------
  const main = $('#main');
  let view = { tab: 'games' };
  let listed = []; // the track ids shown in the current list (play order for that list)
  const filt = { q: '', game: '', scene: '', mood: '' };

  function parseHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('game/')) return { tab: 'game', id: h.slice(5) };
    if (h === 'all' || h === 'fav') return { tab: h };
    if (h.startsWith('t/')) return { tab: 'track', id: h.slice(2) };
    return { tab: 'games' };
  }
  window.addEventListener('hashchange', () => { closeNow(); view = parseHash(); render(); window.scrollTo(0, 0); });

  function rowHTML(t, i, showGame) {
    const g = GAME[t.game];
    const ok = playable(t);
    const on = cur && cur.id === t.id;
    return '<li class="trow' + (on ? ' on' : '') + (ok ? '' : ' off') + '" data-id="' + esc(t.id) + '" style="--gc:' + esc(g.color) + '">' +
      '<button class="tplay' + (showGame ? ' thumbed' : '') + '" aria-label="' + esc(T('播放', 'Play') + ' ' + L(t.name)) + '">' +
      (showGame && g.thumb ? '<img loading="lazy" alt="" src="' + esc(thumbOf(g)) + '">' : '') +
      '<svg viewBox="0 0 24 24"><path d="' + (on && !audio.paused ? 'M7 4h4v16H7zM14 4h4v16h-4z' : 'M7 4v16l13-8z') + '"/></svg></button>' +
      '<div class="tn"><b>' + esc(L(t.name)) + '</b><span class="alt">' + esc(LO(t.name)) + '</span>' +
      '<div class="info">' + (showGame ? '<span class="chip g">' + esc(L(g.title)) + '</span>' : '') +
      '<span class="chip">' + esc(sceneName(t.scene)) + '</span><span>' + esc(L(t.where)) + '</span>' +
      (t.oggOnly ? '<span class="chip" title="Ogg">' + T('Ogg 格式', 'Ogg file') + (ok ? '' : T('・此裝置不支援', ' · not on this device')) + '</span>' : '') + '</div></div>' +
      '<span class="tdur">' + fmt(t.dur) + '</span>' +
      '<button class="fav' + (favs.has(t.id) ? ' on' : '') + '" aria-label="' + T('收藏', 'Favourite') + '" aria-pressed="' + favs.has(t.id) + '">' + (favs.has(t.id) ? '♥' : '♡') + '</button>' +
      '<div class="credit">' + creditHTML(t, g) + '</div></li>';
  }
  function listHTML(ts, showGame) {
    listed = ts.map((t) => t.id);
    if (!ts.length) return '<div class="tlist"><div class="empty">' + T('沒有符合的曲目', 'No tracks match') + '</div></div>';
    return '<ul class="tlist">' + ts.map((t, i) => rowHTML(t, i, showGame)).join('') + '</ul>';
  }

  function renderGames() {
    const total = D.tracks.length;
    let h = '<h1>' + T('音樂館', 'Music Gallery') + '</h1><p class="lede">' +
      T('本站 ' + D.games.length + ' 款遊戲的 ' + total + ' 首配樂。每首曲子都依照它在遊戲裡出現的場景重新命名，原曲的作者與授權就標在旁邊。',
        total + ' pieces of music from ' + D.games.length + ' games on this site. Each one is named for the scene where it plays in its game; the original credit and licence stay right beside it.') +
      '</p><div class="btns" style="margin-bottom:16px"><button class="btn" id="shuffleAll">' + T('全部隨機播放', 'Shuffle everything') + '</button><a class="btn ghost" href="#all">' + T('瀏覽全部曲目', 'Browse all tracks') + '</a></div>';
    h += '<div class="grid">' + D.games.map((g) =>
      '<a class="gcard" href="#game/' + esc(g.id) + '" style="--gc:' + esc(g.color) + '"><span class="bar"></span>' +
      '<img class="th" loading="lazy" alt="" src="' + esc(thumbOf(g)) + '"><span class="cnt">♪ ' + g.count + '</span>' +
      '<span class="meta"><b>' + esc(L(g.title)) + '</b><small>' + esc(LO(g.title)) + '</small></span></a>').join('') + '</div>';
    if (D.skipped && D.skipped.length) {
      const noMusic = D.skipped.filter((s) => !GAME[s.game]);
      const seen = new Set();
      h += '<details class="skipped"><summary>' + T('沒有收錄的遊戲（' + noMusic.length + '）', 'Games not included (' + noMusic.length + ')') + '</summary><ul>' +
        noMusic.filter((s) => !seen.has(s.game) && seen.add(s.game)).map((s) => '<li>' + esc(L(s.title)) + ' - ' + esc(s.why) + '</li>').join('') + '</ul></details>';
    }
    h += '<p class="foot">' + T('曲目資料由 tools/build.py 從各遊戲的檔案產生。完整出處見 ', 'Track data is generated from the games by tools/build.py. Full credits: ') +
      '<a href="CREDITS.md">CREDITS.md</a></p>';
    main.innerHTML = h;
    listed = [];
    $('#shuffleAll').onclick = () => { shuffle = true; updateModes(); startQueue(D.tracks.map((t) => t.id), null); };
  }

  function renderGame(id) {
    const g = GAME[id];
    if (!g) { location.hash = '#games'; return; }
    const ts = D.tracks.filter((t) => t.game === id);
    let h = '<a class="back" href="#games">← ' + T('所有遊戲', 'All games') + '</a>' +
      '<div class="ghead" style="--gc:' + esc(g.color) + '"><img alt="" src="' + esc(thumbOf(g)) + '"><div class="gt"><h1>' + esc(L(g.title)) + '</h1>' +
      '<p class="sub">' + esc(LO(g.title)) + ' · ' + T(ts.length + ' 首', ts.length + (ts.length === 1 ? ' track' : ' tracks')) +
      ' · ' + (g.kind === 'procedural' ? T('原創程式配樂', 'original music composed in code') : T('開放授權配樂', 'openly licensed music')) + '</p>' +
      '<div class="btns"><button class="btn" id="playAll">▶ ' + T('播放全部', 'Play all') + '</button>' +
      '<a class="btn ghost" href="' + esc(playUrl(g)) + '" target="_blank" rel="noopener">' + T('去玩這個遊戲 ↗', 'Play this game ↗') + '</a></div>' +
      (g.creditNote ? '<p class="gnote">' + esc(L(g.creditNote)) + '</p>' : '') + '</div></div>';
    h += listHTML(ts, false);
    main.innerHTML = h;
    $('#playAll').onclick = () => startQueue(listed, listed[0]);
  }

  function filtered(fav) {
    const q = filt.q.trim().toLowerCase();
    return D.tracks.filter((t) => {
      if (fav && !favs.has(t.id)) return false;
      if (filt.game && t.game !== filt.game) return false;
      if (filt.scene && t.scene !== filt.scene) return false;
      if (filt.mood && t.mood !== filt.mood) return false;
      if (!q) return true;
      const g = GAME[t.game], o = t.orig || {};
      return [t.name.zh, t.name.en, g.title.zh, g.title.en, t.where.zh, t.where.en, o.title, o.artist, o.pack, sceneName(t.scene), moodName(t.mood)]
        .some((s) => s && String(s).toLowerCase().includes(q));
    });
  }
  function renderAll(fav) {
    const opt = (v, label, sel) => '<option value="' + esc(v) + '"' + (sel === v ? ' selected' : '') + '>' + esc(label) + '</option>';
    let h = '<h1>' + (fav ? T('我的收藏', 'Favourites') : T('全部曲目', 'All tracks')) + '</h1>' +
      '<div class="filters"><input id="q" type="search" placeholder="' + T('搜尋曲名、遊戲、作者…', 'Search name, game, artist…') + '" value="' + esc(filt.q) + '">' +
      '<select id="fGame" aria-label="' + T('遊戲', 'Game') + '">' + opt('', T('所有遊戲', 'All games'), filt.game) + D.games.map((g) => opt(g.id, L(g.title), filt.game)).join('') + '</select>' +
      '<select id="fScene" aria-label="' + T('場景', 'Scene') + '">' + opt('', T('所有場景', 'All scenes'), filt.scene) + Object.keys(SCENES).filter((k) => D.tracks.some((t) => t.scene === k)).map((k) => opt(k, sceneName(k), filt.scene)).join('') + '</select>' +
      '<select id="fMood" aria-label="' + T('氣氛', 'Mood') + '">' + opt('', T('所有氣氛', 'All moods'), filt.mood) + Object.keys(MOODS).filter((k) => D.tracks.some((t) => t.mood === k)).map((k) => opt(k, moodName(k), filt.mood)).join('') + '</select>' +
      '<button class="btn" id="playList">▶ ' + T('播放', 'Play') + '</button></div><p class="count" id="count"></p><div id="listBox"></div>';
    main.innerHTML = h;
    const draw = () => {
      const ts = filtered(fav);
      $('#count').textContent = T(ts.length + ' 首', ts.length + ' tracks');
      $('#listBox').innerHTML = fav && !favs.size ? '<div class="tlist"><div class="empty">' + T('按 ♡ 把喜歡的歌加進收藏。', 'Tap ♡ on a track to keep it here.') + '</div></div>' : listHTML(ts, true);
    };
    draw();
    $('#q').oninput = (e) => { filt.q = e.target.value; draw(); };
    $('#fGame').onchange = (e) => { filt.game = e.target.value; draw(); };
    $('#fScene').onchange = (e) => { filt.scene = e.target.value; draw(); };
    $('#fMood').onchange = (e) => { filt.mood = e.target.value; draw(); };
    $('#playList').onclick = () => startQueue(listed, shuffle ? null : listed[0]);
  }

  function render() {
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (view.tab === 'game' ? 'games' : view.tab)));
    if (view.tab === 'game') renderGame(view.id);
    else if (view.tab === 'all') renderAll(false);
    else if (view.tab === 'fav') renderAll(true);
    else if (view.tab === 'track') {
      const t = TRACK[view.id];
      if (t) { history.replaceState(null, '', '#game/' + t.game); view = { tab: 'game', id: t.game }; renderGame(t.game); select(t.id, false); }
      else renderGames();
    } else renderGames();
  }

  // clicks inside lists (delegated)
  main.addEventListener('click', (e) => {
    const row = e.target.closest('.trow');
    if (!row || e.target.closest('a')) return;
    const id = row.dataset.id;
    if (e.target.closest('.fav')) {
      toggleFav(id);
      const b = e.target.closest('.fav'); b.classList.toggle('on', favs.has(id)); b.textContent = favs.has(id) ? '♥' : '♡'; b.setAttribute('aria-pressed', favs.has(id));
      return;
    }
    if (cur && cur.id === id) { togglePlay(); return; }
    startQueue(listed.slice(), id);
  });

  // ---------- queue & playback ----------
  let queue = [], qi = -1, cur = null;
  let shuffle = store.get('shuffle', false), repeat = store.get('repeat', 'all'); // off | all | one
  function updateModes() {
    $('#shuffleBtn').classList.toggle('on', shuffle);
    $('#shuffleBtn').setAttribute('aria-pressed', shuffle);
    const r = $('#repeatBtn');
    r.classList.toggle('on', repeat !== 'off'); r.classList.toggle('one', repeat === 'one');
    r.title = T({ off: '不重複', all: '全部重複', one: '單曲重複' }[repeat], { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }[repeat]);
    store.set('shuffle', shuffle); store.set('repeat', repeat);
  }
  function shuffled(a, first) {
    a = a.filter((id) => id !== first);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return first ? [first, ...a] : a;
  }
  function startQueue(ids, first) {
    ids = ids.filter((id) => TRACK[id] && playable(TRACK[id]));
    if (!ids.length) return;
    queue = shuffle ? shuffled(ids, first) : ids;
    qi = first ? Math.max(0, queue.indexOf(first)) : 0;
    select(queue[qi], true);
  }
  function select(id, autoplay) {
    const t = TRACK[id];
    if (!t) return;
    cur = t;
    if (!queue.includes(id)) { queue = [id]; qi = 0; }
    const src = srcOf(t);
    if (src) {
      audio.src = src;
      audio.loop = repeat === 'one';
      if (autoplay) { const p = audio.play(); if (p && p.catch) p.catch(() => updatePlayState()); }
    }
    store.set('last', id);
    updateNow(); markRows();
  }
  function step(d, auto) {
    if (!queue.length) { if (D.tracks.length) startQueue(D.tracks.map((t) => t.id), null); return; }
    let n = qi + d;
    if (n >= queue.length) { if (auto && repeat === 'off') { audio.pause(); audio.currentTime = 0; return; } n = 0; }
    if (n < 0) n = queue.length - 1;
    qi = n; select(queue[qi], true);
  }
  function togglePlay() {
    // the first tap on play loads the remembered song (inside the tap, for iOS)
    if (audio.dataset.pending && cur) { delete audio.dataset.pending; const id = cur.id; cur = null; startQueue(listed.length && listed.includes(id) ? listed : D.tracks.map((t) => t.id), id); return; }
    if (!cur) { const last = store.get('last', null); if (last && TRACK[last]) startQueue(listed.length ? listed : D.tracks.map((t) => t.id), last); else step(1); return; }
    if (audio.paused) { const p = audio.play(); if (p && p.catch) p.catch(() => {}); } else audio.pause();
  }
  audio.addEventListener('ended', () => { if (repeat === 'one') { audio.currentTime = 0; audio.play(); } else step(1, true); });
  audio.addEventListener('error', () => { if (cur && audio.src) { markBroken(cur.id); } });
  function markBroken(id) {
    const row = main.querySelector('.trow[data-id="' + CSS.escape(id) + '"]');
    if (row) row.classList.add('off');
  }
  ['play', 'pause', 'playing'].forEach((ev) => audio.addEventListener(ev, () => { updatePlayState(); markRows(); }));

  function markRows() {
    main.querySelectorAll('.trow').forEach((r) => {
      const on = cur && r.dataset.id === cur.id;
      r.classList.toggle('on', !!on);
      const p = r.querySelector('.tplay path');
      if (p) p.setAttribute('d', on && !audio.paused ? 'M7 4h4v16H7zM14 4h4v16h-4z' : 'M7 4v16l13-8z');
    });
  }
  function updatePlayState() {
    const playing = !audio.paused;
    document.body.classList.toggle('playing', playing);
    $('#playBtn').setAttribute('aria-label', playing ? T('暫停', 'Pause') : T('播放', 'Play'));
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }

  // ---------- now playing ----------
  function updateNow() {
    if (!cur) return;
    const g = GAME[cur.game];
    $('#npName').textContent = L(cur.name);
    $('#npGame').textContent = L(g.title) + ' · ' + sceneName(cur.scene);
    $('#npArt').src = thumbOf(g);
    $('#nowArt').src = thumbOf(g);
    $('#nowName').textContent = L(cur.name);
    $('#nowAlt').textContent = LO(cur.name);
    $('#nowGame').textContent = L(g.title) + ' / ' + LO(g.title);
    $('#nowGame').href = '#game/' + g.id;
    $('#nowWhere').textContent = sceneName(cur.scene) + ' · ' + moodName(cur.mood) + ' — ' + L(cur.where);
    $('#nowCredit').innerHTML = creditHTML(cur, g);
    $('#nowPlayGame').href = playUrl(g);
    document.title = L(cur.name) + ' · ' + T('音樂館', 'Music Gallery');
    if ('mediaSession' in navigator) {
      try {
        const art = thumbOf(g);
        navigator.mediaSession.metadata = new MediaMetadata({
          title: L(cur.name) + ' (' + LO(cur.name) + ')',
          artist: L(g.title) + ' · ' + creditText(cur, g),
          album: T('音樂館', 'Music Gallery') + ' · ' + L(g.title),
          artwork: art ? [{ src: new URL(art, location.href).href, sizes: '960x540', type: 'image/jpeg' }] : [],
        });
      } catch (e) {}
    }
  }
  const nowEl = $('#now');
  const openNow = () => { if (!cur) return; nowEl.hidden = false; $('#nowClose').focus(); };
  const closeNow = () => { nowEl.hidden = true; };
  $('#npBtn').onclick = openNow;
  $('#nowClose').onclick = closeNow;
  nowEl.addEventListener('click', (e) => { if (e.target === nowEl) closeNow(); });
  $('#nowGame').addEventListener('click', closeNow);

  // ---------- controls ----------
  $('#playBtn').onclick = togglePlay;
  $('#prevBtn').onclick = () => { if (audio.currentTime > 3) audio.currentTime = 0; else step(-1); };
  $('#nextBtn').onclick = () => step(1);
  $('#shuffleBtn').onclick = () => {
    shuffle = !shuffle; updateModes();
    if (cur && queue.length) { const ids = queue.slice(); queue = shuffle ? shuffled(ids, cur.id) : ids.sort((a, b) => D.tracks.indexOf(TRACK[a]) - D.tracks.indexOf(TRACK[b])); qi = queue.indexOf(cur.id); }
  };
  $('#repeatBtn').onclick = () => { repeat = { off: 'all', all: 'one', one: 'off' }[repeat]; audio.loop = repeat === 'one'; updateModes(); };
  const seek = $('#seek');
  let seeking = false;
  seek.addEventListener('input', () => { seeking = true; $('#tCur').textContent = fmt((seek.value / 1000) * (audio.duration || 0)); });
  seek.addEventListener('change', () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; seeking = false; });
  audio.addEventListener('timeupdate', () => {
    const d = audio.duration || (cur && cur.dur) || 0;
    if (!seeking) { seek.value = d ? Math.round((audio.currentTime / d) * 1000) : 0; $('#tCur').textContent = fmt(audio.currentTime); }
    $('#tDur').textContent = fmt(d);
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && audio.duration) {
      try { navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: 1 }); } catch (e) {}
    }
  });
  audio.addEventListener('loadedmetadata', () => { $('#tDur').textContent = fmt(audio.duration); });
  const vol = $('#vol');
  vol.value = Math.round(store.get('vol', 0.8) * 100);
  audio.volume = vol.value / 100;
  vol.addEventListener('input', () => { audio.volume = vol.value / 100; store.set('vol', audio.volume); });

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    const set = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) {} };
    set('play', () => togglePlay());
    set('pause', () => audio.pause());
    set('previoustrack', () => step(-1));
    set('nexttrack', () => step(1));
    set('seekto', (e) => { if (e.seekTime != null) audio.currentTime = e.seekTime; });
    set('seekbackward', (e) => { audio.currentTime = Math.max(0, audio.currentTime - (e.seekOffset || 10)); });
    set('seekforward', (e) => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (e.seekOffset || 10)); });
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') && e.target.type !== 'range') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ' || e.code === 'Space') { if (e.target.closest('a, .fav, .tabs, .top-btns, .now')) return; e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight' && !e.shiftKey) { if (e.target.type === 'range') return; audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); }
    else if (e.key === 'ArrowLeft' && !e.shiftKey) { if (e.target.type === 'range') return; audio.currentTime = Math.max(0, audio.currentTime - 5); }
    else if (e.key === 'ArrowRight' || e.key === 'n' || e.key === 'N') step(1);
    else if (e.key === 'ArrowLeft' || e.key === 'p' || e.key === 'P') step(-1);
    else if (e.key === 'ArrowUp' && !IOS) { if (e.target.type === 'range') return; e.preventDefault(); vol.value = Math.min(100, +vol.value + 5); vol.dispatchEvent(new Event('input')); }
    else if (e.key === 'ArrowDown' && !IOS) { if (e.target.type === 'range') return; e.preventDefault(); vol.value = Math.max(0, +vol.value - 5); vol.dispatchEvent(new Event('input')); }
    else if (e.key === 'Escape') closeNow();
  });

  // ---------- start ----------
  applyLang();
  updateModes();
  view = parseHash();
  render();
  const last = store.get('last', null);
  if (!cur && last && TRACK[last]) {
    // show the last song in the player without loading any audio
    cur = TRACK[last]; queue = [last]; qi = 0; updateNow(); markRows();
    audio.removeAttribute('src');
    audio.dataset.pending = '1';
    $('#tDur').textContent = fmt(cur.dur);
  }
})();
