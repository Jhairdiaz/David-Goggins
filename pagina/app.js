(function () {
  "use strict";
  var PLAN = JSON.parse(document.getElementById("plan").textContent);
  var TABS = ["torso-a", "pierna-a", "torso-b", "pierna-b", "progreso", "progresion", "partido"];
  var BY_DATE = { "2026-11-23": "torso-a", "2026-11-24": "partido", "2026-11-25": "pierna-a", "2026-11-26": "pierna-a", "2026-11-27": "torso-b", "2026-11-28": "pierna-b" };
  var LEVELS = [[0, "Cantera"], [300, "Suplente"], [800, "Titular"], [1500, "Capitán"], [2500, "Crack"], [4000, "Figura"], [6000, "Leyenda"]];
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

  /* ---------- Pestañas ---------- */
  function show(id) {
    if (TABS.indexOf(id) < 0) id = BY_DATE[TODAY] || "torso-a";
    $all(".panel[data-tab]").forEach(function (p) { p.hidden = p.getAttribute("data-tab") !== id; });
    $all(".tab").forEach(function (t) {
      var on = t.getAttribute("href") === "#" + id;
      t.setAttribute("aria-selected", on ? "true" : "false");
      if (on) { var c = t.parentNode; if (c.scrollWidth > c.clientWidth) c.scrollLeft = Math.max(0, t.offsetLeft - 24); }
    });
  }
  $all(".day[data-date]").forEach(function (el) { if (el.getAttribute("data-date") === TODAY) el.classList.add("today"); });
  show(location.hash.slice(1));
  window.addEventListener("hashchange", function () { show(location.hash.slice(1)); });

  /* ---------- Estado ---------- */
  var db = null, canWrite = false, loaded = false, remote = {}, drafts = {};
  var syncEl = $("#sync");
  function setSync(text, kind) { syncEl.textContent = text; syncEl.setAttribute("data-kind", kind || ""); }
  function docId(sid) { return TODAY + "_" + sid; }
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
    var badges = [
      { id: "primer", name: "Primer pitazo", desc: "Termina tu primera sesión", ok: sessionsDone >= 1 },
      { id: "record", name: "Primer récord", desc: "Supera una marca anterior", ok: prs >= 1 },
      { id: "lastre", name: "Lastre puesto", desc: "Dominadas o fondos con chaleco", ok: lastre },
      { id: "izq", name: "Izquierda al día", desc: "Pierna A y Pierna B en la misma semana", ok: legsWeek },
      { id: "semana", name: "Semana completa", desc: "4 sesiones en una semana", ok: fullWeek },
      { id: "racha3", name: "Racha de 3", desc: "3 semanas completas seguidas", ok: streak >= 3 },
      { id: "cien", name: "100 series", desc: "Registra 100 series", ok: sets >= 100 },
      { id: "diez", name: "10 récords", desc: "Suma 10 récords personales", ok: prs >= 10 }
    ];
    return { xp: xp, prs: prs, sets: sets, per: per, weeks: weeks, streak: streak, week: weeks[cur] || 0, badges: badges, hist: hist, list: list };
  }
  function levelOf(xp) {
    var i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
    var next = LEVELS[i + 1] || null, base = LEVELS[i][0];
    return { n: i + 1, name: LEVELS[i][1], base: base, next: next, pct: next ? (xp - base) / (next[0] - base) : 1 };
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

  /* ---------- Render: cabecera, semana, progreso ---------- */
  function renderStats() {
    var c = compute(allDocs()), lv = levelOf(c.xp);
    $("#st-lvnum").textContent = lv.n; $("#st-lvname").textContent = lv.name;
    $("#st-xpbar").style.width = Math.round(lv.pct * 100) + "%";
    $("#st-xptext").textContent = lv.next ? c.xp + " XP · faltan " + (lv.next[0] - c.xp) + " para " + lv.next[1] : c.xp + " XP · nivel máximo";
    $("#st-streak").textContent = c.streak; $("#st-streak-u").textContent = c.streak === 1 ? "semana" : "semanas";
    $("#st-week").textContent = Math.min(c.week, 9);
    $all("#st-pips span").forEach(function (p, i) { p.classList.toggle("on", i < c.week); });
    $("#st-prs").textContent = c.prs; $("#st-sets").textContent = c.sets + (c.sets === 1 ? " serie registrada" : " series registradas");
    $all(".day[data-date]").forEach(function (el) {
      var d = el.getAttribute("data-date");
      el.classList.toggle("done", c.list.some(function (x) { return x.fecha === d && x.completada; }));
    });
    // Mi progreso
    $("#pg-lvnum").textContent = lv.n; $("#pg-lvname").textContent = lv.name;
    $("#pg-lvnext").textContent = lv.next ? c.xp + " XP · " + (lv.next[0] - c.xp) + " XP para " + lv.next[1] : c.xp + " XP";
    $("#pg-xpbar").style.width = Math.round(lv.pct * 100) + "%";
    var lad = $("#pg-ladder"); lad.textContent = "";
    LEVELS.forEach(function (L, i) {
      var li = document.createElement("li"); li.className = i + 1 < lv.n ? "past" : i + 1 === lv.n ? "now" : "";
      var b = document.createElement("b"); b.textContent = L[1]; var s = document.createElement("span"); s.textContent = L[0] + " XP";
      li.appendChild(b); li.appendChild(s); lad.appendChild(li);
    });
    var bl = $("#pg-badges"); bl.textContent = "";
    c.badges.forEach(function (bd) {
      var li = document.createElement("li"); li.className = bd.ok ? "ok" : "";
      li.innerHTML = '<span class="bd-ico" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M10 1.5 12.4 6l5 .7-3.6 3.5.9 5L10 12.8 5.3 15.2l.9-5L2.6 6.7l5-.7L10 1.5Z" fill="currentColor"/></svg></span><b></b><span class="bd-d"></span>';
      li.querySelector("b").textContent = bd.name; li.querySelector(".bd-d").textContent = bd.ok ? "Desbloqueado" : bd.desc;
      bl.appendChild(li);
    });
    var tb = $("#pg-hist"), rows = c.list.slice().reverse();
    if (rows.length) {
      tb.textContent = "";
      rows.forEach(function (d) {
        var p = c.per[d.fecha + "_" + d.sesion], tr = document.createElement("tr");
        [fmtDate(d.fecha), (SESSION_NAME[d.sesion] || d.sesion) + (d.completada ? "" : " (en curso)"), String(p.sets), String(p.prs.length), "+" + p.xp].forEach(function (v, i) {
          var td = document.createElement("td"); td.textContent = v; if (i === 4) td.className = "xp"; tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
    }
    // Última vez dinámica
    $all("[data-last]").forEach(function (b) {
      var ex = b.getAttribute("data-last"), l = lastSetsFor(ex, docId(PLAN.ex[ex].s));
      if (l) { b.textContent = summarize(l.sets, ex) + " · " + fmtDate(l.fecha); b.parentNode.classList.remove("first"); }
    });
    PLAN.sessions.forEach(renderSessionProgress);
  }
  function renderSessionProgress(s) {
    var box = $('[data-sprog="' + s.id + '"]'); if (!box) return;
    var total = 0, done = 0, d = drafts[s.id] || remote[docId(s.id)];
    s.ex.forEach(function (ex) { total += PLAN.ex[ex].rows.length; if (d && d.sets && d.sets[ex]) done += d.sets[ex].filter(function (r) { return r && r.done; }).length; });
    $(".sbar i", box).style.width = Math.round(done / total * 100) + "%";
    var c = compute(allDocs()), p = c.per[docId(s.id)];
    $(".stext", box).textContent = (!loaded || !canWrite) ? "Registra tus series para sumar XP" :
      done + " de " + total + " series hoy" + (p ? " · +" + p.xp + " XP" : "") + (d && d.completada ? " · sesión terminada" : "");
    var fin = $('[data-finish="' + s.id + '"]'), re = $('[data-reopen="' + s.id + '"]');
    var completed = !!(d && d.completada);
    fin.disabled = !loaded || !canWrite || completed || done === 0;
    fin.textContent = completed ? "Sesión terminada" : "Terminar sesión";
    re.hidden = !completed || !canWrite;
  }

  /* ---------- Render: registro de series ---------- */
  function renderLogger(exId) {
    var e = PLAN.ex[exId], box = $('.log[data-ex="' + exId + '"]'); if (!box) return;
    var ready = loaded && canWrite;
    var d = ready ? (drafts[e.s] || remote[docId(e.s)]) : null, saved = (d && d.sets && d.sets[exId]) || [];
    var last = lastSetsFor(exId, docId(e.s)), lastSets = last ? last.sets : [];
    var doneN = saved.filter(function (r) { return r && r.done; }).length;
    var h = '<div class="log-h"><span class="lbl">Registro de hoy</span><span class="log-c">' + doneN + " / " + e.rows.length + " series</span></div>";
    h += '<div class="lgrid" role="group" aria-label="Series de ' + e.name.replace(/"/g, "") + '">';
    h += '<span class="lgh">Serie</span><span class="lgh">' + (e.lastre ? "Lastre kg" : "kg") + '</span><span class="lgh">' + (e.secs ? "Seg" : "Reps") + '</span><span class="lgh">RIR</span><span class="lgh"></span>';
    e.rows.forEach(function (row, i) {
      var r = saved[i] || {}, prev = lastSets[i] || null;
      var kg = r.kg !== undefined ? r.kg : (prev ? prev.kg : e.kg);
      var reps = r.reps !== undefined ? r.reps : (prev ? prev.reps : e.repsMin);
      var rir = r.rir !== undefined ? r.rir : (e.rir === null ? "" : e.rir);
      var side = row[1] ? '<em class="' + row[1] + '">' + (row[1] === "izq" ? "Izq" : "Der") + "</em>" : "";
      var dis = ready ? "" : " disabled";
      var idb = exId + "-" + i;
      h += '<span class="sn' + (r.done ? " done" : "") + '" data-i="' + i + '">S' + row[0] + side + "</span>";
      h += '<input id="kg-' + idb + '" data-f="kg" data-i="' + i + '" type="number" inputmode="decimal" step="0.5" min="0" value="' + num(kg) + '" aria-label="Serie ' + row[0] + ' kg"' + (r.done ? ' class="done"' : "") + dis + ">";
      h += '<input id="rp-' + idb + '" data-f="reps" data-i="' + i + '" type="number" inputmode="numeric" step="1" min="0" value="' + num(reps) + '" aria-label="Serie ' + row[0] + (e.secs ? " segundos" : " repeticiones") + '"' + (r.done ? ' class="done"' : "") + dis + ">";
      h += '<select id="ri-' + idb + '" data-f="rir" data-i="' + i + '" aria-label="Serie ' + row[0] + ' RIR"' + (r.done ? ' class="done"' : "") + dis + ">";
      ["", "0", "1", "2", "3", "4"].forEach(function (v) { h += '<option value="' + v + '"' + (String(rir) === v ? " selected" : "") + ">" + (v === "" ? "—" : v === "4" ? "4+" : v) + "</option>"; });
      h += "</select>";
      h += '<button type="button" class="chk' + (r.done ? " on" : "") + '" data-i="' + i + '" aria-pressed="' + (r.done ? "true" : "false") + '" aria-label="Marcar serie ' + row[0] + ' como hecha"' + dis + '><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    });
    h += "</div>";
    if (!ready) h += '<p class="log-off">' + (loaded ? "Solo tú puedes registrar series en esta página." : "El registro se activa al abrir la página con tu cuenta de Claude.") + "</p>";
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
  document.addEventListener("change", function (ev) {
    var el = ev.target, box = el.closest && el.closest(".log[data-ex]"); if (!box || !loaded || !canWrite) return;
    var exId = box.getAttribute("data-ex"), e = PLAN.ex[exId], i = +el.getAttribute("data-i"), d = draftFor(e.s);
    var arr = d.sets[exId]; if (!arr || !arr[i] || !arr[i].done) return;
    var f = el.getAttribute("data-f"); arr[i][f] = f === "rir" ? (el.value === "" ? "" : +el.value) : num(el.value);
    save(e.s); renderStats();
  });
  document.addEventListener("click", function (ev) {
    var chk = ev.target.closest && ev.target.closest(".chk");
    if (chk && loaded && canWrite) { toggleSet(chk); return; }
    var fin = ev.target.closest && ev.target.closest("[data-finish]");
    if (fin && !fin.disabled) { finishSession(fin.getAttribute("data-finish")); return; }
    var re = ev.target.closest && ev.target.closest("[data-reopen]");
    if (re) { var d = draftFor(re.getAttribute("data-reopen")); d.completada = false; delete d.completedAt; save(d.sesion, true); renderStats(); return; }
  });
  function toggleSet(btn) {
    var box = btn.closest(".log[data-ex]"), exId = box.getAttribute("data-ex"), e = PLAN.ex[exId], i = +btn.getAttribute("data-i");
    var d = draftFor(e.s), arr = d.sets[exId] = d.sets[exId] || [];
    while (arr.length <= i) arr.push(null);
    if (arr[i] && arr[i].done) {
      arr[i].done = false;
    } else {
      var kg = num($('[data-f="kg"][data-i="' + i + '"]', box).value), reps = num($('[data-f="reps"][data-i="' + i + '"]', box).value);
      var rv = $('[data-f="rir"][data-i="' + i + '"]', box).value;
      var before = compute(allDocs()).xp;
      arr[i] = { serie: e.rows[i][0], lado: e.rows[i][1], kg: kg, reps: reps, rir: rv === "" ? "" : +rv, done: true, t: new Date().toISOString() };
      var after = compute(allDocs());
      var pr = (after.per[docId(e.s)] || { prs: [] }).prs.some(function (p) { return p.ex === exId && p.kg === kg && p.reps === reps; });
      pop(btn, "+" + (after.xp - before) + " XP" + (pr ? " · récord" : ""), pr);
      startRest(e.rest, e.name);
    }
    save(e.s);
    markRow(box, exId, i, !!(arr[i] && arr[i].done));
    if (arr[i] && arr[i].done) {
      $all('[data-f="kg"]', box).forEach(function (inp) { var j = +inp.getAttribute("data-i"); if (j > i && !(arr[j] && arr[j].done)) inp.value = arr[i].kg; });
    }
    renderStats();
  }
  function markRow(box, exId, i, on) {
    $all('[data-i="' + i + '"]', box).forEach(function (el) {
      if (el.classList.contains("chk")) { el.classList.toggle("on", on); el.setAttribute("aria-pressed", on ? "true" : "false"); }
      else el.classList.toggle("done", on);
    });
    var d = drafts[PLAN.ex[exId].s], n = ((d && d.sets[exId]) || []).filter(function (r) { return r && r.done; }).length;
    $(".log-c", box).textContent = n + " / " + PLAN.ex[exId].rows.length + " series";
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

  /* ---------- Terminar sesión y celebración ---------- */
  function finishSession(sid) {
    var d = draftFor(sid), before = compute(allDocs()), lvB = levelOf(before.xp);
    d.completada = true; d.completedAt = new Date().toISOString();
    var after = compute(allDocs()), lvA = levelOf(after.xp), p = after.per[docId(sid)] || { prs: [], sets: 0, xp: 0 };
    save(sid, true); renderStats();
    var newBadges = after.badges.filter(function (b, i) { return b.ok && !before.badges[i].ok; });
    celebrate({ name: SESSION_NAME[sid], gain: p.xp, total: after.xp, lvB: lvB, lvA: lvA, prs: p.prs, sets: p.sets, week: after.week, streak: after.streak, badges: newBadges });
  }
  var modal = $("#modal");
  function celebrate(r) {
    $("#m-title").textContent = r.lvA.n > r.lvB.n ? "¡Subiste a " + r.lvA.name + "!" : "¡" + r.name + " completada!";
    $("#m-xp").textContent = "+" + r.gain;
    $("#m-lv").textContent = "Nivel " + r.lvA.n + " · " + r.lvA.name;
    $("#m-lvnext").textContent = r.lvA.next ? (r.lvA.next[0] - r.total) + " XP para " + r.lvA.next[1] : "Nivel máximo";
    var bar = $("#m-bar"); bar.style.transition = "none"; bar.style.width = (r.lvA.n > r.lvB.n ? 0 : Math.round(r.lvB.pct * 100)) + "%";
    var facts = $("#m-facts"); facts.textContent = "";
    [[String(r.sets), "series"], [String(r.prs.length), r.prs.length === 1 ? "récord" : "récords"], [r.week + "/4", "esta semana"]].forEach(function (f) {
      var li = document.createElement("li"), b = document.createElement("b"), s = document.createElement("span");
      b.textContent = f[0]; s.textContent = f[1]; li.appendChild(b); li.appendChild(s); facts.appendChild(li);
    });
    var extra = $("#m-extra"); extra.textContent = "";
    r.prs.forEach(function (p) { var li = document.createElement("li"); li.className = "pr"; li.textContent = "Récord en " + PLAN.ex[p.ex].name + ": " + (p.kg > 0 ? fmtKg(p.kg) + " kg × " : "") + p.reps; extra.appendChild(li); });
    r.badges.forEach(function (b) { var li = document.createElement("li"); li.className = "bd"; li.textContent = "Logro desbloqueado: " + b.name; extra.appendChild(li); });
    modal.hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { bar.style.transition = ""; bar.style.width = Math.round(r.lvA.pct * 100) + "%"; }); });
    $("#m-close").focus();
    confetti();
  }
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
  renderAllLoggers(); renderStats();
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
        if (!loaded) { loaded = true; renderAllLoggers(); setSync(canWrite ? "Registro conectado · Claude puede leer tus series" : "Vista de solo lectura", canWrite ? "ok" : "off"); }
        renderStats();
      }, function () { clearTimeout(loadTimer); setSync("Se perdió la conexión con tu registro. Recarga la página para reintentar.", "err"); });
    });
  });
})();
