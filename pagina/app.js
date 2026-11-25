(function () {
  "use strict";
  var PLAN = JSON.parse(document.getElementById("plan-data").textContent);
  var TABS = ["torso-a", "pierna-a", "torso-b", "pierna-b", "progreso", "progresion", "partido"];
  var BY_DATE = { "2026-11-23": "torso-a", "2026-11-24": "partido", "2026-11-25": "pierna-a", "2026-11-26": "pierna-a", "2026-11-27": "torso-b", "2026-11-28": "pierna-b" };
  var RANKING = [[0, 300], [150, 250], [300, 200], [500, 150], [800, 100], [1200, 75], [1700, 50], [2400, 30], [3200, 20], [4200, 11], [5500, 5], [7000, 3], [8500, 1]];
  var XP_MATCH = 60, XP_GOAL = 30, XP_ASSIST = 20;
  var XP_LEVEL = 100;
  var WEEK_GOAL = 4;
  var XP_SET = 10, XP_PR = 25, XP_SESSION = 50, XP_WEEK = 100;
  var SESSION_NAME = {};
  PLAN.sessions.forEach(function (s) { SESSION_NAME[s.id] = s.name; });

  function pad(n) { return String(n).padStart(2, "0"); }
  function isoLocal(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  var TODAY = isoLocal(new Date());
  function weekKey(s) {
    var p = s.split("-").map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10);
  }
  function prevWeek(k) { var p = k.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] - 7)).toISOString().slice(0, 10); }
  function fmtDate(s) {
    var p = s.split("-").map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    var dn = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getUTCDay()];
    var mn = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][p[1] - 1];
    return dn + " " + p[2] + " " + mn;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function num(v) { var n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : 0; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtKg(k) { return (Math.round(k * 10) / 10).toString().replace(".", ","); }

  /* ---------- Navegación (menú inferior + sesiones) ---------- */
  var SCREENS = ["inicio", "entrenar", "partido", "carta", "plan"];
  var SESS = ["torso-a", "pierna-a", "torso-b", "pierna-b"];
  var ALIAS = { progreso: "carta", progresion: "plan" };
  var curSession = null, autoOpened = {};
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function todaySession() { var s = BY_DATE[TODAY]; return SESS.indexOf(s) >= 0 ? s : null; }
  function route() {
    var h = (location.hash || "").slice(1); h = ALIAS[h] || h;
    var screen = "inicio", sess = null;
    if (SESS.indexOf(h) >= 0) { screen = "entrenar"; sess = h; }
    else if (SCREENS.indexOf(h) >= 0) screen = h;
    if (screen === "entrenar" && !sess) sess = curSession || todaySession() || lsGet("arma10-ses") || "torso-a";
    $all(".screen").forEach(function (s) { s.hidden = s.getAttribute("data-screen") !== screen; });
    $all(".bnav a").forEach(function (a) { if (a.getAttribute("data-nav") === screen) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (sess) {
      curSession = sess; lsSet("arma10-ses", sess);
      $all(".panel[data-tab]").forEach(function (p) { p.hidden = p.getAttribute("data-tab") !== sess; });
      $all(".segb").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-seg") === sess ? "true" : "false"); b.classList.toggle("today-seg", b.getAttribute("data-seg") === todaySession()); });
      openNext(sess);
    }
    window.scrollTo(0, 0);
  }
  function openNext(sid) {
    if (autoOpened[sid] || !loaded) return;
    var s = PLAN.sessions.filter(function (x) { return x.id === sid; })[0]; if (!s) return;
    var target = null;
    s.ex.some(function (ex) { var rows = getRows(ex); if (rows.filter(function (r) { return r && r.done; }).length < rows.length) { target = ex; return true; } return false; });
    if (target) { var d = document.getElementById(target); if (d) d.open = true; }
    autoOpened[sid] = true;
  }
  $all(".day[data-date]").forEach(function (el) { if (el.getAttribute("data-date") === TODAY) el.classList.add("today"); });
  window.addEventListener("hashchange", route);

  /* ---------- Estado ---------- */
  var db = null, canWrite = false, loaded = false, remote = {}, drafts = {}, matches = {}, matchesLoaded = false, knees = {}, kneesLoaded = false;
  var syncEl = $("#sync");
  function setSync(text, kind) { syncEl.textContent = text; syncEl.setAttribute("data-kind", kind || ""); }
  function hasDone(d) { var s = (d && d.sets) || {}; return Object.keys(s).some(function (ex) { return (s[ex] || []).some(function (r) { return r && r.done; }); }); }
  /* La misión vale para toda la semana (lun–dom): si ya la empezaste o completaste
     otro día de esta semana, se abre ese registro en lugar de uno nuevo y vacío. */
  function docId(sid) {
    var wk = weekKey(TODAY), best = null, bestScore = 0;
    Object.keys(remote).forEach(function (k) {
      var f = k.slice(0, 10), d = remote[k];
      if (k.slice(11) !== sid || f < wk || f > TODAY || !d) return;
      var sc = d.completada ? 3 : hasDone(d) ? 2 : 0;
      if (sc > bestScore || (sc && sc === bestScore && f > best.slice(0, 10))) { best = k; bestScore = sc; }
    });
    return best || TODAY + "_" + sid;
  }
  function draftFor(sid) {
    if (!drafts[sid]) {
      var r = remote[docId(sid)];
      drafts[sid] = r ? clone(r) : { fecha: TODAY, sesion: sid, semana: 1, sets: {}, completada: false };
      if (!drafts[sid].sets) drafts[sid].sets = {};
    }
    return drafts[sid];
  }
  function allDocs(excludeKey) {
    var m = {};
    Object.keys(remote).forEach(function (k) { m[k] = remote[k]; });
    Object.keys(drafts).forEach(function (sid) { m[docId(sid)] = drafts[sid]; });
    if (excludeKey) delete m[excludeKey];
    return Object.keys(m).map(function (k) { return m[k]; }).filter(function (d) {
      if (!d || !d.fecha || !d.sesion) return false;
      if (d.completada) return true;
      var s = d.sets || {};
      return Object.keys(s).some(function (ex) { return (s[ex] || []).some(function (r) { return r && r.done; }); });
    });
  }

  /* ---------- Cálculo de XP, récords, racha y logros ---------- */
  function dominated(hist, k, n) { return hist.some(function (p) { return p[0] >= k && p[1] >= n; }); }
  function compute(list) {
    list = list.slice().sort(function (a, b) { var x = a.fecha + a.sesion, y = b.fecha + b.sesion; return x < y ? -1 : x > y ? 1 : 0; });
    var hist = {}, xp = 0, prs = 0, sets = 0, per = {}, weeks = {}, weekSes = {}, lastre = false;
    list.forEach(function (d) {
      var key = d.fecha + "_" + d.sesion, sx = 0, sp = [], count = 0, s = d.sets || {};
      Object.keys(s).forEach(function (ex) {
        var done = (s[ex] || []).filter(function (r) { return r && r.done; });
        var h = hist[ex] || [], had = h.length > 0, best = null;
        done.forEach(function (r) {
          var k = num(r.kg), n = num(r.reps);
          count++; sx += XP_SET;
          if ((ex === "torso-a-2" || ex === "torso-b-1") && k > 0) lastre = true;
          if (had && n > 0 && !dominated(h, k, n)) { if (!best || k > best.kg || (k === best.kg && n > best.reps)) best = { ex: ex, kg: k, reps: n }; }
        });
        if (best) { sp.push(best); sx += XP_PR; }
        hist[ex] = h.concat(done.map(function (r) { return [num(r.kg), num(r.reps)]; }));
      });
      if (d.completada) {
        sx += XP_SESSION;
        var wk = weekKey(d.fecha);
        weeks[wk] = (weeks[wk] || 0) + 1;
        (weekSes[wk] = weekSes[wk] || {})[d.sesion] = true;
        if (weeks[wk] === WEEK_GOAL) sx += XP_WEEK;
      }
      xp += sx; prs += sp.length; sets += count;
      per[key] = { xp: sx, prs: sp, sets: count, doc: d };
    });
    var cur = weekKey(TODAY), streak = 0, k = (weeks[cur] || 0) >= WEEK_GOAL ? cur : prevWeek(cur);
    while ((weeks[k] || 0) >= WEEK_GOAL) { streak++; k = prevWeek(k); }
    var sessionsDone = list.filter(function (d) { return d.completada; }).length;
    var legsWeek = Object.keys(weekSes).some(function (w) { return weekSes[w]["pierna-a"] && weekSes[w]["pierna-b"]; });
    var fullWeek = Object.keys(weeks).some(function (w) { return weeks[w] >= WEEK_GOAL; });
    var torso = 0, pierna = 0;
    list.forEach(function (d) { var s = d.sets || {}; Object.keys(s).forEach(function (ex) { var n = (s[ex] || []).filter(function (r) { return r && r.done; }).length; if (ex.indexOf("torso") === 0) torso += n; else pierna += n; }); });
    var mins = 0, goals = 0, assists = 0, mcount = 0, mper = {}, matchWeek = null, maxG = 0, maxA = 0, maxGA = 0, golYPase = false, full90 = false, gRun = 0, gRunMax = 0, completoSemana = false;
    Object.keys(matches).sort().forEach(function (k) {
      var m = matches[k]; if (!m || !m.fecha) return;
      var mx = XP_MATCH + XP_GOAL * num(m.goles) + XP_ASSIST * num(m.asistencias);
      xp += mx; mins += num(m.minutos); goals += num(m.goles); assists += num(m.asistencias); mcount++;
      mper[m.fecha] = { xp: mx, doc: m };
      var g = num(m.goles), a = num(m.asistencias);
      maxG = Math.max(maxG, g); maxA = Math.max(maxA, a); maxGA = Math.max(maxGA, g + a);
      if (g >= 1 && a >= 1) golYPase = true; if (num(m.minutos) >= (num(m.formato) === 11 ? 90 : 60)) full90 = true;
      gRun = g >= 1 ? gRun + 1 : 0; gRunMax = Math.max(gRunMax, gRun);
      if ((weeks[weekKey(m.fecha)] || 0) >= WEEK_GOAL) completoSemana = true;
      if (weekKey(m.fecha) === cur) matchWeek = mper[m.fecha];
    });
    var badges = [
      { id: "debut", name: "Debut", desc: "Completa tu primera misión", ok: sessionsDone >= 1 },
      { id: "cancha", name: "Pisando cancha", desc: "Registra tu primer partido", ok: mcount >= 1 },
      { id: "record", name: "Rompe límites", desc: "Supera una marca anterior", ok: prs >= 1 },
      { id: "gol", name: "Hambre de gol", desc: "Registra tu primer gol", ok: goals >= 1 },
      { id: "asist", name: "Visión de juego", desc: "Registra tu primera asistencia", ok: assists >= 1 },
      { id: "lastre", name: "Peso extra", desc: "Dominadas o fondos con chaleco", ok: lastre },
      { id: "izq", name: "Pierna izquierda", desc: "Pierna A y Pierna B en la misma semana", ok: legsWeek },
      { id: "semana", name: "Semana perfecta", desc: "4 misiones en una semana", ok: fullWeek },
      { id: "motor", name: "Motor", desc: "300 minutos jugados", ok: mins >= 300 },
      { id: "racha3", name: "Imparable", desc: "3 semanas perfectas seguidas", ok: streak >= 3 },
      { id: "cien", name: "Cien series", desc: "Registra 100 series", ok: sets >= 100 },
      { id: "diez", name: "Diez récords", desc: "Suma 10 récords personales", ok: prs >= 10 },
      { id: "doblete", name: "Doblete", desc: "2 goles en un partido", ok: maxG >= 2 },
      { id: "hat", name: "Hat-trick", desc: "3 goles en un partido", ok: maxG >= 3 },
      { id: "golpase", name: "Gol y pase", desc: "Gol y asistencia en el mismo partido", ok: golYPase },
      { id: "cerebro", name: "Cerebro del equipo", desc: "3 asistencias en un partido", ok: maxA >= 3 },
      { id: "crack", name: "Partido de 10", desc: "Participa en 5 goles en un partido (G + A)", ok: maxGA >= 5 },
      { id: "racha", name: "Racha goleadora", desc: "Marca en 3 partidos seguidos", ok: gRunMax >= 3 },
      { id: "g10", name: "Diez goles", desc: "Suma 10 goles", ok: goals >= 10 },
      { id: "a10", name: "Diez asistencias", desc: "Suma 10 asistencias", ok: assists >= 10 },
      { id: "noventa", name: "Todo el partido", desc: "Juega el partido completo (60' en F6/F8, 90' en F11)", ok: full90 },
      { id: "rodilla", name: "Cuerpo de élite", desc: "7 chequeos de rodilla", ok: Object.keys(knees).length >= 7 },
      { id: "fijo", name: "Titular fijo", desc: "Registra 10 partidos", ok: mcount >= 10 },
      { id: "completo", name: "Atleta completo", desc: "Semana perfecta con partido incluido", ok: completoSemana }
    ];
    function cap(v) { return Math.min(99, v); }
    var attrs = [
      { k: "FÍS", n: "Físico", v: cap(45 + Math.floor(sets / 6)), d: sets + " series" },
      { k: "FUE", n: "Fuerza", v: cap(45 + prs * 2 + Math.floor(torso / 12)), d: prs + " récords" },
      { k: "POT", n: "Potencia", v: cap(45 + Math.floor(pierna / 5)), d: pierna + " series de pierna" },
      { k: "RES", n: "Resistencia", v: cap(45 + Math.floor(mins / 30)), d: mins + " min jugados" },
      { k: "ATQ", n: "Ataque", v: cap(45 + goals * 3 + assists * 2), d: goals + " G · " + assists + " A" },
      { k: "MEN", n: "Mentalidad", v: cap(45 + sessionsDone * 2 + streak * 4), d: sessionsDone + (sessionsDone === 1 ? " misión" : " misiones") }
    ];
    var ovr = Math.round(attrs.reduce(function (s, x) { return s + x.v; }, 0) / attrs.length);
    return { xp: xp, prs: prs, sets: sets, per: per, weeks: weeks, streak: streak, week: weeks[cur] || 0, badges: badges, hist: hist, list: list,
      torso: torso, pierna: pierna, done: sessionsDone, mins: mins, goals: goals, assists: assists, mcount: mcount, mper: mper, matchWeek: matchWeek, attrs: attrs, ovr: ovr };
  }
  function levelOf(xp) {
    var lvl = Math.floor(xp / XP_LEVEL) + 1, r = 0;
    while (r + 1 < RANKING.length && xp >= RANKING[r + 1][0]) r++;
    return { n: lvl, pos: RANKING[r][1], rankIdx: r, nextRank: RANKING[r + 1] || null, toNext: lvl * XP_LEVEL - xp, pct: (xp % XP_LEVEL) / XP_LEVEL };
  }
  function lastSetsFor(ex, excludeKey) {
    var list = allDocs(excludeKey).filter(function (d) { return d.sets && d.sets[ex] && d.sets[ex].some(function (r) { return r && r.done; }); });
    list.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
    return list.length ? { fecha: list[0].fecha, sets: list[0].sets[ex].filter(function (r) { return r && r.done; }) } : null;
  }
  function summarize(sets, ex) {
    var e = PLAN.ex[ex], reps = sets.map(function (r) { return num(r.reps); }), kgs = sets.map(function (r) { return num(r.kg); });
    var sameR = reps.every(function (r) { return r === reps[0]; }), sameK = kgs.every(function (k) { return k === kgs[0]; });
    var unit = e.secs ? " s" : "";
    var repTxt = sameR ? sets.length + "×" + reps[0] + unit : reps.join(", ") + unit;
    var kgTxt = sameK ? (kgs[0] > 0 ? fmtKg(kgs[0]) + " kg" : (e.lastre ? "sin lastre" : "")) : kgs.map(fmtKg).join("/") + " kg";
    var rir = sets[sets.length - 1].rir;
    return repTxt + (kgTxt ? " · " + kgTxt : "") + (rir !== null && rir !== undefined && rir !== "" ? " · RIR " + rir : "");
  }

  /* ---------- Render: cabecera, semana, estado ---------- */
  function renderStats() {
    var c = compute(allDocs()), lv = levelOf(c.xp);
    $("#st-rank").textContent = lv.pos; $("#tb-rank").textContent = lv.pos; $("#tb-lv").textContent = lv.n;
    var tier = lv.pos <= 5 ? 5 : lv.pos <= 30 ? 4 : lv.pos <= 100 ? 3 : lv.pos < 200 ? 2 : 1;
    $all("[data-avatar]").forEach(function (el) { el.setAttribute("data-tier", tier); });
    renderToday(c);
    $("#st-ranknext").textContent = lv.nextRank ? "Faltan " + (lv.nextRank[0] - c.xp) + " EXP para subir al #" + lv.nextRank[1] : "Número 1 del programa";
    $("#st-lvnum").textContent = lv.n; $("#st-lvexp").textContent = c.xp + " EXP";
    $("#st-xpbar").style.width = Math.round(lv.pct * 100) + "%";
    $("#st-xptext").textContent = "Faltan " + lv.toNext + " EXP para el nivel " + (lv.n + 1);
    $("#st-ovr").textContent = c.ovr; $("#st-ovrsub").textContent = c.prs + " récords · " + c.mcount + (c.mcount === 1 ? " partido" : " partidos");
    $("#st-streak").textContent = c.streak; $("#st-streak-u").textContent = c.streak === 1 ? "semana" : "semanas";
    $("#st-week").textContent = Math.min(c.week, 9);
    $all("#st-pips span").forEach(function (p, i) { p.classList.toggle("on", i < c.week); });
    $("#st-match").textContent = c.matchWeek ? "Registrado · +" + c.matchWeek.xp + " EXP" : "Pendiente";
    $all(".day[data-date]").forEach(function (el) {
      var d = el.getAttribute("data-date");
      el.classList.toggle("done", c.list.some(function (x) { return x.fecha === d && x.completada; }) || !!c.mper[d]);
    });
    // Carta de jugador
    $("#pg-ovr").textContent = c.ovr;
    $("#pg-rank").textContent = "Ranking #" + lv.pos + " · Nivel " + lv.n + " · " + c.xp + " EXP";
    $("#pg-xpbar").style.width = Math.round(lv.pct * 100) + "%";
    $("#pg-lvnext").textContent = lv.toNext + " EXP para el nivel " + (lv.n + 1) + (lv.nextRank ? " · " + (lv.nextRank[0] - c.xp) + " EXP para subir al #" + lv.nextRank[1] : "");
    drawRadar(c.attrs);
    var at = $("#pg-attrs"); at.textContent = "";
    c.attrs.forEach(function (x) {
      var dv = document.createElement("div"), dt = document.createElement("dt"), dd = document.createElement("dd"), sm = document.createElement("small");
      dt.textContent = x.k + " · " + x.n; dd.textContent = x.v; sm.textContent = x.d; dv.appendChild(dt); dv.appendChild(dd); dv.appendChild(sm); at.appendChild(dv);
    });
    var lad = $("#pg-ladder"); lad.textContent = "";
    RANKING.forEach(function (R, i) {
      var li = document.createElement("li"); li.className = i < lv.rankIdx ? "past" : i === lv.rankIdx ? "now" : "";
      var b = document.createElement("b"); b.textContent = "#" + R[1]; var s = document.createElement("span"); s.textContent = R[0] + " EXP";
      li.appendChild(b); li.appendChild(s); lad.appendChild(li);
    });
    var bl = $("#pg-badges"); bl.textContent = "";
    c.badges.forEach(function (bd) {
      var li = document.createElement("li"); li.className = bd.ok ? "ok" : "";
      li.innerHTML = '<span class="bd-ico" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 2 12.4 7l5.1.6-3.8 3.6 1 5.1L10 13.8l-4.7 2.5 1-5.1L2.5 7.6 7.6 7 10 2Z" fill="currentColor"/></svg></span><b></b><span class="bd-d"></span>';
      li.querySelector("b").textContent = bd.name; li.querySelector(".bd-d").textContent = bd.ok ? "Arma desbloqueada" : bd.desc;
      bl.appendChild(li);
    });
    var rows = c.list.map(function (d) { var p = c.per[d.fecha + "_" + d.sesion]; return { f: d.fecha, a: "Misión · " + (SESSION_NAME[d.sesion] || d.sesion) + (d.completada ? "" : " (en curso)"), d: p.sets + " series", r: String(p.prs.length), x: p.xp }; });
    Object.keys(c.mper).forEach(function (f) { var m = c.mper[f]; rows.push({ f: f, a: "Partido F" + (num(m.doc.formato) || 8), d: num(m.doc.minutos) + "' · " + num(m.doc.goles) + " G · " + num(m.doc.asistencias) + " A", r: "—", x: m.xp }); });
    rows.sort(function (x, y) { return x.f < y.f ? 1 : x.f > y.f ? -1 : 0; });
    var tb = $("#pg-hist");
    if (rows.length) {
      tb.textContent = "";
      rows.forEach(function (r) {
        var tr = document.createElement("tr");
        [fmtDate(r.f), r.a, r.d, r.r, "+" + r.x + " EXP"].forEach(function (v, i) { var td = document.createElement("td"); td.textContent = v; if (i === 4) td.className = "xp"; tr.appendChild(td); });
        tb.appendChild(tr);
      });
    }
    $all("[data-last]").forEach(function (b) {
      var ex = b.getAttribute("data-last"), l = lastSetsFor(ex, docId(PLAN.ex[ex].s));
      if (l) { b.textContent = summarize(l.sets, ex) + " · " + fmtDate(l.fecha); b.parentNode.classList.remove("first"); }
    });
    PLAN.sessions.forEach(renderSessionProgress);
  }
  function drawRadar(attrs) {
    var svg = $("#pg-radar"), cx = 160, cy = 138, R = 98, n = attrs.length, h = "";
    function pt(i, f) { var ang = -Math.PI / 2 + i * 2 * Math.PI / n; return [(cx + Math.cos(ang) * R * f).toFixed(1), (cy + Math.sin(ang) * R * f).toFixed(1)]; }
    [0.25, 0.5, 0.75, 1].forEach(function (f) { h += '<polygon class="grid" points="' + attrs.map(function (_, i) { return pt(i, f).join(","); }).join(" ") + '"/>'; });
    attrs.forEach(function (_, i) { var p = pt(i, 1); h += '<line class="axis" x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '"/>'; });
    h += '<polygon class="val" points="' + attrs.map(function (x, i) { return pt(i, x.v / 99).join(","); }).join(" ") + '"/>';
    attrs.forEach(function (x, i) {
      var p = pt(i, x.v / 99), q = pt(i, 1.2);
      h += '<circle class="dot" cx="' + p[0] + '" cy="' + p[1] + '" r="3.5"/>';
      h += '<text x="' + q[0] + '" y="' + (+q[1] + 4) + '" text-anchor="middle">' + x.k + ' <tspan class="v">' + x.v + "</tspan></text>";
    });
    svg.innerHTML = h;
  }
  function renderToday(c) {
    var key = BY_DATE[TODAY], title, sub, href, go = "Abrir";
    if (key === "partido") {
      var m = c.mper[TODAY];
      title = "Partido · 7:00 PM"; sub = m ? "Registrado: " + num(m.doc.minutos) + "' · " + num(m.doc.goles) + " G · " + num(m.doc.asistencias) + " A" : "Al terminar, regístralo y suma EXP";
      href = "#partido"; go = m ? "Ver" : "Registrar";
    } else if (SESS.indexOf(key) >= 0) {
      var rows = 0, done = 0, s = PLAN.sessions.filter(function (x) { return x.id === key; })[0], d = drafts[key] || remote[docId(key)];
      s.ex.forEach(function (ex) { var r = getRows(ex); rows += r.length; done += r.filter(function (x) { return x && x.done; }).length; });
      title = s.name; sub = d && d.completada ? "Misión completada · " + done + " series" : done ? "En curso · " + done + " de " + rows + " series" : rows + " series · " + s.ex.length + " ejercicios";
      href = "#" + key; go = d && d.completada ? "Ver" : done ? "Seguir" : "Empezar";
    } else {
      title = "Descanso"; sub = "Recupera: caminar, movilidad y buena comida. Siguiente misión mañana."; href = "#plan"; go = "Plan";
    }
    $("#td-title").textContent = title; $("#td-sub").textContent = sub; $("#td-go").textContent = go; $("#today").setAttribute("href", href);
  }
  function renderSessionProgress(s) {
    var box = $('[data-sprog="' + s.id + '"]'); if (!box) return;
    var total = 0, done = 0, d = drafts[s.id] || remote[docId(s.id)];
    s.ex.forEach(function (ex) { var rows = getRows(ex), dn = rows.filter(function (r) { return r && r.done; }).length; total += rows.length; done += dn; updateChip(ex, dn, rows.length); });
    $(".sbar i", box).style.width = (total ? Math.round(done / total * 100) : 0) + "%";
    var c = compute(allDocs()), p = c.per[docId(s.id)];
    $(".stext", box).textContent = (!loaded || !canWrite) ? "Misión: registra tus series para ganar EXP" :
      "Progreso de la misión: " + done + " / " + total + " series" + (p ? " · +" + p.xp + " EXP" : "") + (d && d.completada ? " · completada" : "");
    var fin = $('[data-finish="' + s.id + '"]'), re = $('[data-reopen="' + s.id + '"]');
    var completed = !!(d && d.completada);
    fin.disabled = !loaded || !canWrite || completed || done === 0;
    fin.textContent = completed ? "Misión completada" : "Completar misión";
    re.hidden = !completed || !canWrite;
  }

  /* ---------- Render: registro de series ---------- */
  function getRows(exId) {
    var e = PLAN.ex[exId], d = drafts[e.s] || remote[docId(e.s)], arr = d && d.sets && d.sets[exId];
    var tpl = e.rows.map(function (r) { return { serie: r[0], lado: r[1] }; });
    if (!arr || !arr.length) return tpl;
    var n = Math.max(arr.length, 0), out = [];
    for (var i = 0; i < n; i++) out.push(arr[i] || tpl[i] || { serie: i + 1, lado: null });
    return out;
  }
  function renderLogger(exId) {
    var e = PLAN.ex[exId], box = $('.log[data-ex="' + exId + '"]'); if (!box) return;
    var ready = loaded && canWrite, rows = getRows(exId);
    var last = lastSetsFor(exId, docId(e.s)), lastSets = last ? last.sets : [];
    var doneN = rows.filter(function (r) { return r && r.done; }).length;
    var h = '<div class="log-h"><span class="lbl">Series de hoy</span><span class="log-c">' + doneN + " / " + rows.length + " series</span></div>";
    h += '<div class="lgrid" role="group" aria-label="Series de ' + e.name.replace(/"/g, "") + '">';
    h += '<span class="lgh">Serie</span><span class="lgh">' + (e.lastre ? "Lastre kg" : "kg") + '</span><span class="lgh">' + (e.secs ? "Seg" : "Reps") + '</span><span class="lgh">RIR</span><span class="lgh"></span><span class="lgh"></span>';
    var dis = ready ? "" : " disabled";
    rows.forEach(function (r, i) {
      var prev = lastSets[i] || null;
      var kg = r.kg !== undefined ? r.kg : (prev ? prev.kg : e.kg);
      var reps = r.reps !== undefined ? r.reps : (prev ? prev.reps : e.repsMin);
      var rir = r.rir !== undefined ? r.rir : (e.rir === null ? "" : e.rir);
      var side = r.lado ? '<em class="' + r.lado + '">' + (r.lado === "izq" ? "Izq" : "Der") + "</em>" : "";
      var dn = r.done ? ' class="done"' : "", idb = exId + "-" + i;
      h += '<span class="sn' + (r.done ? " done" : "") + '" data-i="' + i + '" data-serie="' + num(r.serie) + '" data-lado="' + (r.lado || "") + '">S' + num(r.serie) + side + "</span>";
      h += '<input id="kg-' + idb + '" data-f="kg" data-i="' + i + '" type="number" inputmode="decimal" step="0.5" min="0" value="' + num(kg) + '" aria-label="Serie ' + num(r.serie) + ' kg"' + dn + dis + ">";
      h += '<input id="rp-' + idb + '" data-f="reps" data-i="' + i + '" type="number" inputmode="numeric" step="1" min="0" value="' + num(reps) + '" aria-label="Serie ' + num(r.serie) + (e.secs ? " segundos" : " repeticiones") + '"' + dn + dis + ">";
      h += '<select id="ri-' + idb + '" data-f="rir" data-i="' + i + '" aria-label="Serie ' + num(r.serie) + ' RIR"' + dn + dis + ">";
      ["", "0", "1", "2", "3", "4"].forEach(function (v) { h += '<option value="' + v + '"' + (String(rir) === v ? " selected" : "") + ">" + (v === "" ? "—" : v === "4" ? "4+" : v) + "</option>"; });
      h += "</select>";
      h += '<button type="button" class="chk' + (r.done ? " on" : "") + '" data-i="' + i + '" aria-pressed="' + (r.done ? "true" : "false") + '" aria-label="Marcar serie ' + num(r.serie) + ' como hecha"' + dis + '><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
      h += '<button type="button" class="del" data-del="' + i + '" aria-label="Eliminar serie ' + num(r.serie) + '"' + dis + '><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
    });
    h += "</div>";
    if (ready) h += '<button type="button" class="addset" data-add="' + exId + '"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Añadir serie</button>';
    else h += '<p class="log-off">' + (loaded ? "Solo tú puedes registrar series en esta página." : "El registro se activa al abrir la página con tu cuenta de Claude.") + "</p>";
    box.innerHTML = h;
  }
  function renderAllLoggers() { Object.keys(PLAN.ex).forEach(renderLogger); }

  /* ---------- Guardado ---------- */
  var timers = {}, writing = {}, again = {};
  function save(sid, now) {
    clearTimeout(timers[sid]);
    setSync("Guardando…", "busy");
    timers[sid] = setTimeout(function () { flush(sid); }, now ? 0 : 350);
  }
  function flush(sid) {
    if (!db || !drafts[sid]) return;
    if (writing[sid]) { again[sid] = true; return; }
    writing[sid] = true;
    var body = clone(drafts[sid]); body.updatedAt = new Date().toISOString();
    db.doc("sesiones/" + docId(sid)).set(body).then(function () {
      setSync("Guardado en tu cuenta · Claude puede leer tu registro", "ok");
    }, function (err) {
      var code = err && err.code;
      if (code === "invalid_argument") { canWrite = false; renderAllLoggers(); }
      setSync(code === "quota_exceeded" ? "No hay espacio para más registros." : "No se pudo guardar. Revisa tu conexión y vuelve a marcar la serie.", "err");
    }).then(function () {
      writing[sid] = false;
      if (again[sid]) { again[sid] = false; flush(sid); }
    });
  }

  /* ---------- Interacción ---------- */
  function materialize(exId, box) {
    var e = PLAN.ex[exId], d = draftFor(e.s), old = d.sets[exId] || [];
    var arr = $all(".sn[data-i]", box).map(function (sn) {
      var i = +sn.getAttribute("data-i"), prev = old[i];
      if (prev && prev.done) return prev;
      var rv = $('[data-f="rir"][data-i="' + i + '"]', box).value;
      return { serie: +sn.getAttribute("data-serie"), lado: sn.getAttribute("data-lado") || null,
        kg: num($('[data-f="kg"][data-i="' + i + '"]', box).value), reps: num($('[data-f="reps"][data-i="' + i + '"]', box).value), rir: rv === "" ? "" : +rv, done: false };
    });
    d.sets[exId] = arr; return arr;
  }
  function renumber(arr) {
    var cnt = { izq: 0, der: 0 }, n = 0;
    arr.forEach(function (r) { if (r.lado) r.serie = ++cnt[r.lado]; else r.serie = ++n; });
  }
  document.addEventListener("change", function (ev) {
    var el = ev.target, box = el.closest && el.closest(".log[data-ex]"); if (!box || !loaded || !canWrite) return;
    var exId = box.getAttribute("data-ex"), e = PLAN.ex[exId], i = +el.getAttribute("data-i"), d = draftFor(e.s);
    var arr = d.sets[exId]; if (!arr || !arr[i] || !arr[i].done) return;
    var f = el.getAttribute("data-f"); arr[i][f] = f === "rir" ? (el.value === "" ? "" : +el.value) : num(el.value);
    save(e.s); renderStats();
  });
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest ? ev.target : null; if (!t) return;
    var chk = t.closest(".chk");
    if (chk && loaded && canWrite) { toggleSet(chk); return; }
    var add = t.closest("[data-add]");
    if (add && loaded && canWrite) { addSet(add.getAttribute("data-add")); return; }
    var del = t.closest("[data-del]");
    if (del && loaded && canWrite) { delSet(del); return; }
    var fin = t.closest("[data-finish]");
    if (fin && !fin.disabled) { finishSession(fin.getAttribute("data-finish")); return; }
    var re = t.closest("[data-reopen]");
    if (re) { var d = draftFor(re.getAttribute("data-reopen")); d.completada = false; delete d.completedAt; save(d.sesion, true); renderStats(); return; }
    if (t.closest("#toast-undo") && undoFn) { var f = undoFn; undoFn = null; hideToast(); f(); }
  });
  function toggleSet(btn) {
    var box = btn.closest(".log[data-ex]"), exId = box.getAttribute("data-ex"), e = PLAN.ex[exId], i = +btn.getAttribute("data-i");
    var arr = materialize(exId, box), r = arr[i];
    if (r.done) {
      r.done = false;
    } else {
      var before = compute(allDocs()), lvB = levelOf(before.xp);
      var rv = $('[data-f="rir"][data-i="' + i + '"]', box).value;
      r.kg = num($('[data-f="kg"][data-i="' + i + '"]', box).value); r.reps = num($('[data-f="reps"][data-i="' + i + '"]', box).value);
      r.rir = rv === "" ? "" : +rv; r.done = true; r.t = new Date().toISOString();
      var after = compute(allDocs()), lvA = levelOf(after.xp);
      var pr = (after.per[docId(e.s)] || { prs: [] }).prs.some(function (p) { return p.ex === exId && p.kg === r.kg && p.reps === r.reps; });
      pop(btn, "+" + (after.xp - before.xp) + " EXP" + (pr ? " · récord" : ""), pr);
      if (lvA.rankIdx > lvB.rankIdx) sysNote("Subes en el ranking", "#" + lvA.pos, "Antes #" + lvB.pos + " · " + after.xp + " EXP");
      else if (lvA.n > lvB.n) sysNote("Nivel superado", "Nivel " + lvA.n, "Ranking #" + lvA.pos + " · " + after.xp + " EXP");
      startRest(e.rest, e.name);
      $all('[data-f="kg"]', box).forEach(function (inp) { var j = +inp.getAttribute("data-i"); if (j > i && !(arr[j] && arr[j].done)) { inp.value = r.kg; arr[j].kg = r.kg; } });
    }
    save(e.s);
    markRow(box, exId, i, r.done);
    renderStats();
  }
  function updateChip(exId, dn, tot) {
    var ch = $('[data-st="' + exId + '"]'); if (!ch) return;
    ch.textContent = dn + "/" + tot; ch.classList.toggle("full", tot > 0 && dn >= tot); ch.classList.toggle("part", dn > 0 && dn < tot);
  }
  function markRow(box, exId, i, on) {
    $all('[data-i="' + i + '"]', box).forEach(function (el) {
      if (el.classList.contains("chk")) { el.classList.toggle("on", on); el.setAttribute("aria-pressed", on ? "true" : "false"); }
      else el.classList.toggle("done", on);
    });
    var rows = getRows(exId);
    $(".log-c", box).textContent = rows.filter(function (r) { return r && r.done; }).length + " / " + rows.length + " series";
  }
  function addSet(exId) {
    var e = PLAN.ex[exId], box = $('.log[data-ex="' + exId + '"]'), arr = materialize(exId, box);
    var uni = e.rows.some(function (r) { return r[1]; }), last = arr[arr.length - 1] || null, row;
    if (uni) row = last && last.lado === "izq" ? { serie: last.serie, lado: "der" } : { serie: (last ? last.serie : 0) + 1, lado: "izq" };
    else row = { serie: arr.length + 1, lado: null };
    row.kg = last ? last.kg : e.kg; row.reps = last ? last.reps : e.repsMin; row.rir = last ? last.rir : (e.rir === null ? "" : e.rir); row.done = false;
    arr.push(row); renumber(arr);
    save(e.s); renderLogger(exId); renderStats();
    var nb = $('.log[data-ex="' + exId + '"] .chk[data-i="' + (arr.length - 1) + '"]'); if (nb) nb.focus();
  }
  function delSet(btn) {
    var box = btn.closest(".log[data-ex]"), exId = box.getAttribute("data-ex"), e = PLAN.ex[exId], i = +btn.getAttribute("data-del");
    var arr = materialize(exId, box), removed = arr.splice(i, 1)[0];
    renumber(arr); save(e.s); renderLogger(exId); renderStats();
    showToast("Serie eliminada" + (removed && removed.done ? " (−10 EXP)" : ""), function () {
      var a2 = draftFor(e.s).sets[exId] = draftFor(e.s).sets[exId] || [];
      a2.splice(Math.min(i, a2.length), 0, removed); renumber(a2); save(e.s); renderLogger(exId); renderStats();
    });
  }
  var undoFn = null, toastTimer = null, toast = document.createElement("div");
  toast.className = "toast"; toast.hidden = true; toast.setAttribute("role", "status");
  toast.innerHTML = '<span id="toast-t"></span><button type="button" id="toast-undo">Deshacer</button>';
  document.body.appendChild(toast);
  function showToast(text, undo) { $("#toast-t").textContent = text; undoFn = undo; toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, 6000); }
  function hideToast() { toast.hidden = true; undoFn = null; }
  function sysNote(label, big, sub) {
    var n = document.createElement("div"); n.className = "sysnote"; n.setAttribute("role", "status");
    var l = document.createElement("span"); l.className = "lbl"; l.textContent = "[ RANKING ] " + label;
    var b = document.createElement("b"); b.textContent = big; var s = document.createElement("span"); s.textContent = sub;
    n.appendChild(l); n.appendChild(b); n.appendChild(s); document.body.appendChild(n);
    setTimeout(function () { n.remove(); }, 2700);
  }
  function pop(anchor, text, pr) {
    var r = anchor.getBoundingClientRect(), el = document.createElement("div");
    el.className = "xp-pop" + (pr ? " pr" : ""); el.textContent = text;
    el.style.left = (r.left + r.width / 2) + "px"; el.style.top = (r.top + window.scrollY - 6) + "px";
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 1300);
  }

  /* ---------- Temporizador de descanso ---------- */
  var rest = $("#rest"), restT = $("#rest-t"), restBar = $("#rest-bar"), restName = $("#rest-n"), restTimer = null, restEnd = 0, restTotal = 0;
  function fmtS(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + pad(s % 60); }
  function startRest(secs, name) {
    restTotal = secs; restEnd = Date.now() + secs * 1000; restName.textContent = name;
    rest.hidden = false; rest.classList.remove("end"); tick();
    clearInterval(restTimer); restTimer = setInterval(tick, 250);
  }
  function tick() {
    var left = (restEnd - Date.now()) / 1000;
    restT.textContent = fmtS(left); restBar.style.width = Math.max(0, Math.min(100, (1 - left / restTotal) * 100)) + "%";
    if (left <= 0) {
      clearInterval(restTimer); rest.classList.add("end"); restT.textContent = "¡Vamos!";
      beep(); try { if (navigator.vibrate) navigator.vibrate([180, 80, 180]); } catch (e) {}
      setTimeout(function () { if (rest.classList.contains("end")) rest.hidden = true; }, 4000);
    }
  }
  var actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.22].forEach(function (t) {
        var o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.0001, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.2, actx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + t + 0.18); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.2);
      });
    } catch (e) {}
  }
  $("#rest-add").addEventListener("click", function () { restEnd += 15000; restTotal += 15; if (rest.classList.contains("end")) { rest.classList.remove("end"); clearInterval(restTimer); restTimer = setInterval(tick, 250); } tick(); });
  $("#rest-skip").addEventListener("click", function () { clearInterval(restTimer); rest.hidden = true; });

  /* ---------- Completar misión y celebración ---------- */
  function finishSession(sid) {
    var d = draftFor(sid), before = compute(allDocs()), lvB = levelOf(before.xp);
    d.completada = true; d.completedAt = new Date().toISOString();
    var after = compute(allDocs()), lvA = levelOf(after.xp), p = after.per[docId(sid)] || { prs: [], sets: 0, xp: 0 };
    save(sid, true); renderStats();
    celebrate({ kind: "mision", name: SESSION_NAME[sid], gain: p.xp, before: before, after: after, lvB: lvB, lvA: lvA, prs: p.prs,
      facts: [[String(p.sets), "series"], [String(p.prs.length), p.prs.length === 1 ? "récord" : "récords"], [after.week + "/4", "misiones semana"]] });
  }
  var modal = $("#modal");
  function celebrate(r) {
    var up = r.lvA.n > r.lvB.n, rankUp = r.lvA.rankIdx > r.lvB.rankIdx, flow = r.prs.length > 0;
    var sheet = $(".sheet");
    sheet.classList.toggle("lvup", up && !rankUp && !flow); sheet.classList.toggle("flow", flow || rankUp);
    $(".m-eyebrow").textContent = r.kind === "partido" ? "[ Partido registrado ]" : "[ Misión superada ] " + r.name;
    $("#m-title").textContent = rankUp ? "¡Subes al #" + r.lvA.pos + "!" : flow ? "Estado flow" : up ? "Nivel " + r.lvA.n : r.kind === "partido" ? "Partido sumado" : "Misión superada";
    $("#m-xp").textContent = "+" + r.gain;
    $("#m-lv").textContent = "Nivel " + r.lvA.n + " · Ranking #" + r.lvA.pos;
    $("#m-lvnext").textContent = r.lvA.toNext + " EXP para el nivel " + (r.lvA.n + 1);
    var bar = $("#m-bar"); bar.style.transition = "none"; bar.style.width = (up ? 0 : Math.round(r.lvB.pct * 100)) + "%";
    var facts = $("#m-facts"); facts.textContent = "";
    r.facts.forEach(function (f) {
      var li = document.createElement("li"), b = document.createElement("b"), s = document.createElement("span");
      b.textContent = f[0]; s.textContent = f[1]; li.appendChild(b); li.appendChild(s); facts.appendChild(li);
    });
    var extra = $("#m-extra"); extra.textContent = "";
    r.prs.forEach(function (p) { var li = document.createElement("li"); li.className = "pr"; li.textContent = "Récord · " + PLAN.ex[p.ex].name + ": " + (p.kg > 0 ? fmtKg(p.kg) + " kg × " : "") + p.reps; extra.appendChild(li); });
    if (rankUp) { var lr = document.createElement("li"); lr.className = "bd"; lr.textContent = "Ranking: #" + r.lvB.pos + " → #" + r.lvA.pos; extra.appendChild(lr); }
    r.after.badges.forEach(function (b, i) { if (b.ok && !r.before.badges[i].ok) { var li = document.createElement("li"); li.className = "bd"; li.textContent = "Arma desbloqueada: " + b.name; extra.appendChild(li); } });
    modal.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.transition = ""; bar.style.width = Math.round(r.lvA.pct * 100) + "%"; }); });
    $("#m-close").focus();
    confetti();
  }

  /* ---------- Registro de partido ---------- */
  var mf = { fecha: $("#mf-fecha"), fmt: $("#mf-fmt"), rod: $("#mf-rod"), min: $("#mf-min"), gol: $("#mf-gol"), asi: $("#mf-asi"), rpe: $("#mf-rpe"), pier: $("#mf-pier"), notas: $("#mf-notas"), save: $("#mf-save"), status: $("#mf-status") };
  mf.fecha.value = TODAY; mf.fecha.max = TODAY;
  function clampN(v, lo, hi) { v = Math.round(num(v)); return Math.max(lo, Math.min(hi, v)); }
  function fillMatchForm() {
    var m = matches[mf.fecha.value];
    if (m) {
      mf.min.value = num(m.minutos); mf.gol.value = num(m.goles); mf.asi.value = num(m.asistencias);
      mf.rpe.value = String(m.rpe || 7); mf.pier.value = String(m.piernas || 3); mf.notas.value = m.notas || "";
      mf.fmt.value = String(m.formato || 8); mf.rod.value = m.rodilla == null ? "" : String(m.rodilla);
      mf.save.textContent = "Actualizar partido"; mf.status.textContent = "Partido del " + fmtDate(m.fecha) + " guardado. Puedes corregir los datos.";
    } else {
      mf.fmt.value = "8"; mf.rod.value = ""; mf.min.value = 60; mf.gol.value = 0; mf.asi.value = 0; mf.rpe.value = "7"; mf.pier.value = "3"; mf.notas.value = "";
      mf.save.textContent = "Guardar partido"; mf.status.textContent = "Al terminar, apunta tus datos: suman EXP y me sirven para ajustar la Pierna A.";
    }
    mf.save.disabled = !(loaded && matchesLoaded && canWrite);
  }
  mf.fecha.addEventListener("change", fillMatchForm);
  mf.fmt.addEventListener("change", function () { var v = num(mf.min.value); if (v === 60 || v === 90) mf.min.value = mf.fmt.value === "11" ? 90 : 60; });

  /* ---------- Chequeo diario de la rodilla izquierda ---------- */
  var KN_COLOR = function (v) { return v <= 3 ? "#2ecc71" : v <= 5 ? "#f2c94c" : "#ff4f6e"; };
  var knBtns = $("#kn-btns"), knRec = $("#kn-rec"), knStrip = $("#kn-strip");
  for (var kv = 0; kv <= 10; kv++) { var kb = document.createElement("button"); kb.type = "button"; kb.textContent = kv; kb.setAttribute("data-v", kv); kb.setAttribute("aria-pressed", "false"); kb.setAttribute("aria-label", "Dolor " + kv + " de 10"); kb.style.setProperty("--kc", KN_COLOR(kv)); knBtns.appendChild(kb); }
  function addDays(iso, n) { var p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
  function renderKnee() {
    var k = knees[TODAY], v = k ? num(k.dolor) : null, leg = BY_DATE[TODAY] === "pierna-a" || BY_DATE[TODAY] === "pierna-b";
    $all("#kn-btns button").forEach(function (b) { b.setAttribute("aria-pressed", String(v !== null && +b.getAttribute("data-v") === v)); b.disabled = !(kneesLoaded && canWrite); });
    if (v === null) { knRec.setAttribute("data-lvl", ""); knRec.textContent = "Marca cómo amaneció la rodilla y te digo cómo entrenar hoy."; }
    else if (v <= 3) { knRec.setAttribute("data-lvl", "ok"); knRec.textContent = v + "/10 · Verde. " + (leg ? "Sesión de pierna completa, con la regla de dolor ≤3/10." : "Día normal. Si quieres, 3 × 45 s de sentadilla en pared."); }
    else if (v <= 5) { knRec.setAttribute("data-lvl", "mid"); knRec.textContent = v + "/10 · Ámbar. " + (leg ? "Entrena pierna con RIR +1, quita la última serie y baja solo hasta donde no pase de 3/10." : "Evita saltos y sprints hoy. Sentadilla en pared 4 × 45 s."); }
    else { knRec.setAttribute("data-lvl", "hi"); knRec.textContent = v + "/10 · Rojo. Hoy nada de pierna pesada ni saltos: solo isométricos suaves sin dolor. Si sigue así 2–3 días, o hay hinchazón, ve al fisioterapeuta."; }
    knStrip.textContent = "";
    for (var i = 6; i >= 0; i--) {
      var d = addDays(TODAY, -i), r = knees[d], x = r ? num(r.dolor) : null, el = document.createElement("div");
      el.className = "kn-d" + (i === 0 ? " kn-now" : ""); el.title = fmtDate(d) + (x === null ? ": sin dato" : ": " + x + "/10");
      var bar = document.createElement("i"); if (x !== null) { var f = document.createElement("b"); f.style.height = Math.max(6, x * 10) + "%"; f.style.setProperty("--kc", KN_COLOR(x)); bar.appendChild(f); }
      var lab = document.createElement("span"); lab.textContent = x === null ? "·" : x;
      var dd = document.createElement("span"); dd.textContent = ["D", "L", "M", "X", "J", "V", "S"][new Date(d + "T12:00:00").getDay()];
      el.appendChild(bar); el.appendChild(lab); el.appendChild(dd); knStrip.appendChild(el);
    }
  }
  knBtns.addEventListener("click", function (ev) {
    var b = ev.target.closest("button"); if (!b || b.disabled || !db) return;
    var v = +b.getAttribute("data-v"), prev = knees[TODAY];
    knees[TODAY] = { fecha: TODAY, dolor: v, updatedAt: new Date().toISOString() }; renderKnee(); renderStats(); setSync("Guardando…", "busy");
    db.doc("rodilla/" + TODAY).set(knees[TODAY]).then(function () { setSync("Guardado en tu cuenta · Claude puede leer tu registro", "ok"); })
      .catch(function () { if (prev) knees[TODAY] = prev; else delete knees[TODAY]; renderKnee(); setSync("No se pudo guardar el chequeo de rodilla. Revisa tu conexión.", "err"); });
  });
  renderKnee();
  mf.save.addEventListener("click", function () {
    if (!db || !canWrite || mf.save.disabled) return;
    var f = mf.fecha.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f > TODAY) { mf.status.textContent = "Elige la fecha del partido (hoy o antes)."; return; }
    var before = compute(allDocs()), lvB = levelOf(before.xp), isNew = !matches[f];
    var body = { fecha: f, minutos: clampN(mf.min.value, 0, 130), goles: clampN(mf.gol.value, 0, 20), asistencias: clampN(mf.asi.value, 0, 20),
      rpe: clampN(mf.rpe.value, 1, 10), piernas: clampN(mf.pier.value, 1, 5), formato: clampN(mf.fmt.value, 6, 11),
      rodilla: mf.rod.value === "" ? null : clampN(mf.rod.value, 0, 10), notas: String(mf.notas.value || "").slice(0, 200), updatedAt: new Date().toISOString() };
    var prev = matches[f]; matches[f] = body;
    var after = compute(allDocs()), lvA = levelOf(after.xp);
    renderStats(); mf.save.disabled = true; setSync("Guardando…", "busy");
    db.doc("partidos/" + f).set(body).then(function () {
      setSync("Guardado en tu cuenta · Claude puede leer tu registro", "ok"); fillMatchForm();
      if (isNew) celebrate({ kind: "partido", name: "Partido", gain: after.xp - before.xp, before: before, after: after, lvB: lvB, lvA: lvA, prs: [],
        facts: [[body.minutos + "'", "jugados"], [String(body.goles), body.goles === 1 ? "gol" : "goles"], [String(body.asistencias), body.asistencias === 1 ? "asistencia" : "asistencias"]] });
      else mf.status.textContent = "Partido actualizado.";
    }, function () {
      if (prev) matches[f] = prev; else delete matches[f];
      renderStats(); mf.save.disabled = false;
      setSync("No se pudo guardar el partido. Revisa tu conexión e inténtalo de nuevo.", "err");
    });
  });
  $("#m-close").addEventListener("click", function () { modal.hidden = true; });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.hidden = true; });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) modal.hidden = true; });
  function confetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var cv = $("#confetti"), ctx = cv.getContext("2d"), W = cv.width = innerWidth, H = cv.height = innerHeight;
    var cs = getComputedStyle(document.documentElement), cols = [cs.getPropertyValue("--accent"), cs.getPropertyValue("--left"), "#f2c94c", cs.getPropertyValue("--ink")];
    var ps = []; for (var i = 0; i < 120; i++) ps.push({ x: W / 2, y: H * 0.38, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 11 - 3, r: Math.random() * 6 + 3, c: cols[i % 4].trim() || "#0d6b44", a: Math.random() * 6 });
    var t0 = performance.now(); cv.hidden = false;
    (function frame(t) {
      ctx.clearRect(0, 0, W, H);
      ps.forEach(function (p) { p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.a += 0.15; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); });
      if (t - t0 < 1800) requestAnimationFrame(frame); else { ctx.clearRect(0, 0, W, H); cv.hidden = true; }
    })(t0);
  }

  /* ---------- Arranque ---------- */
  renderAllLoggers(); renderStats(); route();
  var loadTimer = setTimeout(function () { if (!loaded) setSync("Tu registro aún no responde. Puedes ver la rutina; el registro se activa al conectar.", "err"); }, 10000);
  if (!window.claude || !window.claude.use) { clearTimeout(loadTimer); setSync("Abre esta página en Claude para registrar tus series.", "off"); return; }
  Promise.all([window.claude.use("db"), window.claude.use("user")]).then(function (res) {
    db = res[0]; var user = res[1];
    if (!db) { clearTimeout(loadTimer); setSync("El registro no está disponible en esta vista. La rutina sigue visible.", "off"); return; }
    var perm = user && user.can ? Promise.resolve(user.can("data.write")).catch(function () { return null; }) : Promise.resolve(null);
    perm.then(function (w) {
      canWrite = w !== false;
      db.collection("sesiones").onSnapshot(function (snap) {
        remote = {};
        snap.docs.forEach(function (doc) { if (doc.exists) remote[doc.id] = doc.data(); });
        if (!snap.metadata.fromCache) clearTimeout(loadTimer);
        if (!loaded) { loaded = true; renderAllLoggers(); if (curSession) openNext(curSession); setSync(canWrite ? "Registro conectado · Claude puede leer tus series y partidos" : "Vista de solo lectura", canWrite ? "ok" : "off"); }
        renderStats(); fillMatchForm();
      }, function () { clearTimeout(loadTimer); setSync("Se perdió la conexión con tu registro. Recarga la página para reintentar.", "err"); });
      db.collection("partidos").onSnapshot(function (snap) {
        matches = {};
        snap.docs.forEach(function (doc) { if (doc.exists) matches[doc.id] = doc.data(); });
        if (!matchesLoaded) { matchesLoaded = true; fillMatchForm(); }
        renderStats();
      }, function () { setSync("Se perdió la conexión con tus partidos. Recarga la página para reintentar.", "err"); });
      db.collection("rodilla").onSnapshot(function (snap) {
        knees = {};
        snap.docs.forEach(function (doc) { if (doc.exists) knees[doc.id] = doc.data(); });
        kneesLoaded = true; renderKnee(); renderStats();
      }, function () { setSync("Se perdió la conexión con el chequeo de rodilla. Recarga la página.", "err"); });
    });
  });
})();
