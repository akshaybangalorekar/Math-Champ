/* ============================================================
   OLYMPIAD CHAMP — shared engine
   Progress lives in localStorage under the key "oc_state".
   Works fully offline; nothing is sent anywhere.
   ============================================================ */

(function () {
  'use strict';

  var KEY = 'oc_state';

  /* ---------- state ---------- */

  function defaultState() {
    return {
      name: '',
      xp: 0,
      attempts: [],      // { ts, kind, id, title, correct, timeSec, targetSec, xp }
      journal: [],       // { ts, problemTitle, note }
      streak: { last: null, count: 0 },
      badges: {}         // badgeId -> ts earned
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      var d = defaultState();
      for (var k in d) if (!(k in s)) s[k] = d[k];
      return s;
    } catch (e) {
      return defaultState();
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(STATE)); } catch (e) { /* storage full/blocked */ }
  }

  var STATE = load();

  /* ---------- levels ---------- */

  var LEVELS = [
    { name: 'Rookie', min: 0, icon: 'sprout' },
    { name: 'Explorer', min: 120, icon: 'compass' },
    { name: 'Challenger', min: 300, icon: 'shield' },
    { name: 'Bronze Olympian', min: 550, icon: 'medal-b' },
    { name: 'Silver Olympian', min: 900, icon: 'medal-s' },
    { name: 'Gold Olympian', min: 1350, icon: 'medal-g' },
    { name: 'Maths Champion', min: 2000, icon: 'trophy' }
  ];

  function levelOf(xp) {
    var lv = LEVELS[0];
    for (var i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].min) lv = LEVELS[i];
    var idx = LEVELS.indexOf(lv);
    var next = LEVELS[idx + 1] || null;
    return { level: lv, index: idx, next: next, pct: next ? Math.round(((xp - lv.min) / (next.min - lv.min)) * 100) : 100 };
  }

  /* ---------- badges ---------- */

  var BADGES = [
    { id: 'first',      name: 'First Steps',        desc: 'Solve your first word problem',                  test: function (s) { return countKind(s, 'word', 'correct') >= 1; } },
    { id: 'equation5',  name: 'Equation Builder',   desc: 'Get 5 word problems right',                     test: function (s) { return countKind(s, 'word', 'correct') >= 5; } },
    { id: 'fast',       name: 'Faster than Target', desc: 'Solve a word problem in less than target time',  test: function (s) { return s.attempts.some(function (a) { return a.kind === 'word' && a.correct && a.timeSec < a.targetSec; }); } },
    { id: 'lightning',  name: 'Lightning Calc',     desc: 'Score 8+ in a Fast Multiplication drill',        test: function (s) { return drillScore(s, 'fast-mult') >= 8; } },
    { id: 'divisible',  name: 'Divisibility Detective', desc: 'Score 8+ in a Divisibility drill',           test: function (s) { return drillScore(s, 'divis') >= 8; } },
    { id: 'prime',      name: 'Prime Patrol',       desc: 'Score 8+ in a Prime Numbers drill',              test: function (s) { return drillScore(s, 'prime') >= 8; } },
    { id: 'perfect',    name: 'Perfect 10',         desc: 'Score 10/10 in any drill',                        test: function (s) { return s.attempts.some(function (a) { return a.kind === 'drill' && a.correct === a.total && a.total >= 10; }); } },
    { id: 'streak3',    name: '3-Day Streak',       desc: 'Practise 3 days in a row',                       test: function (s) { return s.streak.count >= 3; } },
    { id: 'journal5',   name: 'Diary Keeper',      desc: 'Write 5 learning notes in your journal',          test: function (s) { return s.journal.length >= 5; } },
    { id: 'champ500',   name: 'Rising Champion',    desc: 'Earn 500 XP',                                     test: function (s) { return s.xp >= 500; } }
  ];

  function countKind(s, kind, mode) {
    var n = 0;
    for (var i = 0; i < s.attempts.length; i++) {
      var a = s.attempts[i];
      if (a.kind === kind && (mode !== 'correct' || a.correct)) n++;
    }
    return n;
  }

  function drillScore(s, drill) {
    var best = 0;
    s.attempts.forEach(function (a) {
      if (a.kind === 'drill' && a.drill === drill) best = Math.max(best, a.correct);
    });
    return best;
  }

  function checkBadges() {
    var earned = [];
    BADGES.forEach(function (b) {
      if (!STATE.badges[b.id] && b.test(STATE)) {
        STATE.badges[b.id] = Date.now();
        earned.push(b);
      }
    });
    if (earned.length) save();
    return earned;
  }

  /* ---------- streak (calendar days visited / practised) ---------- */

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function touchStreak() {
    var today = todayStr();
    if (STATE.streak.last === today) return;
    var yesterday = new Date(Date.now() - 86400000);
    var yStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    STATE.streak.count = (STATE.streak.last === yStr) ? STATE.streak.count + 1 : 1;
    STATE.streak.last = today;
    save();
  }

  /* ---------- recording ---------- */

  function record(attempt) {
    attempt.ts = Date.now();
    STATE.attempts.push(attempt);
    if (STATE.attempts.length > 400) STATE.attempts = STATE.attempts.slice(-400);
    STATE.xp += attempt.xp || 0;
    touchStreak();
    save();
    var earned = checkBadges();
    if (earned.length) toastBadge(earned);
    refreshNav();
  }

  function addJournal(problemTitle, note) {
    if (!note || !note.trim()) return;
    STATE.journal.push({ ts: Date.now(), problemTitle: problemTitle, note: note.trim() });
    if (STATE.journal.length > 100) STATE.journal = STATE.journal.slice(-100);
    save();
    checkBadges();
  }

  /* ---------- XP awarding ---------- */

  function awardWord(correct, timeSec, targetSec) {
    if (!correct) return 8; // effort XP — trying matters
    var xp = 15;
    if (timeSec <= targetSec) xp += 10;          // speed bonus
    if (timeSec <= targetSec * 0.6) xp += 5;     // lightning bonus
    return xp;
  }

  /* ---------- badge toast ---------- */

  var toastHost = null;
  function toastBadge(badges) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:999;display:flex;flex-direction:column;gap:8px;align-items:center;';
      document.body.appendChild(toastHost);
    }
    badges.forEach(function (b, i) {
      var t = document.createElement('div');
      t.style.cssText = 'background:#2b2620;color:#faf5ea;padding:12px 22px;border-radius:12px;font-weight:800;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.25);opacity:0;transition:opacity .4s;font-family:inherit;';
      t.textContent = 'Badge unlocked: ' + b.name + '!';
      toastHost.appendChild(t);
      setTimeout(function () { t.style.opacity = '1'; }, 60 + i * 250);
      setTimeout(function () { t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 450); }, 4200 + i * 250);
    });
  }

  /* ---------- navigation ---------- */

  function refreshNav() {
    var xpEl = document.getElementById('nav-xp');
    var lv = levelOf(STATE.xp);
    if (xpEl) xpEl.textContent = lv.level.name + ' · ' + STATE.xp + ' XP';
    var stEl = document.getElementById('nav-streak');
    if (stEl) stEl.textContent = (STATE.streak.count || 0) + '-day streak';
  }

  function buildNav(active) {
    var links = [
      { href: 'index.html', label: 'Home', key: 'home' },
      { href: 'word-problems.html', label: 'Word Problems', key: 'word' },
      { href: 'speed-lab.html', label: 'Speed Lab', key: 'speed' },
      { href: 'toolbox.html', label: 'Toolbox', key: 'toolbox' },
      { href: 'dashboard.html', label: 'Dashboard', key: 'dash' }
    ];
    var nav = document.getElementById('topnav');
    if (!nav) return;
    var html = '<div class="topnav__inner">' +
      '<a class="brand" href="index.html">' +
      '<span class="brand__mark"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg></span>' +
      '<span class="brand__name">Olympiad <span>Champ</span></span></a>' +
      '<span class="nav-xp" id="nav-xp"></span>' +
      '<span class="nav-streak" id="nav-streak"></span>' +
      '<nav class="topnav__links">';
    links.forEach(function (l) {
      html += '<a href="' + l.href + '"' + (l.key === active ? ' class="is-active"' : '') + '>' + l.label + '</a>';
    });
    html += '</nav></div>';
    nav.innerHTML = html;
    refreshNav();
  }

  /* ---------- timer ---------- */

  function ChampTimer(displayEl, opts) {
    opts = opts || {};
    this.el = displayEl;
    this.onTick = opts.onTick || null;
    this.startAt = null;
    this.elapsed = 0;      // seconds accumulated across pauses
    this.running = false;
    this._int = null;
  }
  ChampTimer.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.startAt = Date.now();
    var self = this;
    this._int = setInterval(function () { self.render(); }, 250);
    this.render();
  };
  ChampTimer.prototype.pause = function () {
    if (!this.running) return;
    this.elapsed += (Date.now() - this.startAt) / 1000;
    this.running = false;
    clearInterval(this._int);
    this.render();
  };
  ChampTimer.prototype.stop = function () {
    this.pause();
    return this.seconds();
  };
  ChampTimer.prototype.seconds = function () {
    var extra = this.running ? (Date.now() - this.startAt) / 1000 : 0;
    return Math.round(this.elapsed + extra);
  };
  ChampTimer.prototype.render = function () {
    if (!this.el) return;
    var s = this.seconds();
    this.el.textContent = fmtTime(s);
    if (this.onTick) this.onTick(s);
  };
  ChampTimer.prototype.reset = function () {
    this.pause();
    this.elapsed = 0;
    this.render();
  };

  function fmtTime(sec) {
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function fmtDate(ts) {
    var d = new Date(ts);
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  /* ---------- small helpers ---------- */

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return '&#' + { '&': '38', '<': '60', '>': '62', '"': '34', "'": '39' }[c] + ';';
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

  /* ---------- animation safety net ---------- */

  /* If animations never get a start tick (headless capture, paused compositor),
     reveal animated content after 1s so nothing can stay invisible. */
  window.addEventListener('load', function () {
    setTimeout(function () {
      document.documentElement.setAttribute('data-fx', 'done');
    }, 1000);
  });

  /* ---------- export ---------- */

  window.OC = {
    STATE: STATE,
    save: save,
    defaultState: defaultState,
    LEVELS: LEVELS,
    levelOf: levelOf,
    BADGES: BADGES,
    record: record,
    addJournal: addJournal,
    awardWord: awardWord,
    buildNav: buildNav,
    refreshNav: refreshNav,
    ChampTimer: ChampTimer,
    fmtTime: fmtTime,
    fmtDate: fmtDate,
    $: $,
    $all: $all,
    esc: esc,
    shuffle: shuffle,
    pick: pick,
    randInt: randInt,
    todayStr: todayStr
  };
})();
