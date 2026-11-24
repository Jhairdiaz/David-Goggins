import html, re
from PIL import Image

E = html.escape

# Cada ejercicio: nombre, imagen, carga, series, reps, rir, descanso, tempo, nota técnica, última vez, siguiente paso, izquierda primero, nota de foto
SESSIONS = [
 dict(id="torso-a", name="Torso A", md="MD-1", focus="Empuje horizontal y tirón vertical lastrado",
  callout="Día antes del partido: RIR 2 en todo, nunca al fallo.",
  warmup=["Rotaciones torácicas en cuadrupedia, 2 min", "10 retracciones escapulares colgado de la barra", "2×10 flexiones con pausa abajo", "1×8 press plano con 19 kg a RIR 5"],
  ex=[
   ("Press plano con mancuernas","Dumbbell_Bench_Press","19 kg","4","10–15","1–2","2:30","3-1-X-0",
    "Escápulas juntas y abajo, codos a 45–60°. La pausa de 1 s abajo elimina el rebote y hace trabajar al pectoral en estiramiento.",
    "3×10 · RIR 1","4×15 → 22 kg",False,None),
   ("Dominadas pronas lastradas","Pullups","Chaleco 10 kg","4","6–10","1–2","2:30","3-0-X-0",
    "Desde colgado completo hasta el pecho a la barra. Con 13 de máximo, sin lastre las series quedan lejos del fallo; el chaleco devuelve el estímulo al rango que construye músculo.",
    "4×7 sin lastre · máx. 13","4×10 → +2,5–5 kg",False,None),
   ("Press inclinado 30°","Incline_Dumbbell_Press","19 kg","3","8–12","1","2:00","3-0-X-1",
    "Banco a unos 30°, no más: trabaja la parte alta del pecho sin que el hombro se lleve el trabajo.",
    "3×8","3×12 → 22 kg",False,None),
   ("Remo a una mano en banco","One-Arm_Dumbbell_Row","22 kg","3 / lado","10–15","1","1:30","2-0-X-1",
    "Lleva el codo hacia la cadera, pausa de 1 s arriba y estira del todo abajo.",
    "3×10","3×15 → 4 series, bajada 3 s",False,None),
   ("Elevación lateral","Side_Lateral_Raise","10 kg","4","12–20","1–2","1:00","2-0-1-1",
    "Los dos brazos a la vez, codos un poco flexionados y sin impulso del cuerpo.",
    "4×12","4×20 → pausa 1 s arriba",False,None),
   ("Curl martillo alterno","Alternate_Hammer_Curl","15 kg","3","8–12","1","1:30","3-0-1-0",
    "Palma hacia dentro, sin balancear. Con 15 kg controlas la bajada de 3 s mejor que con 19 kg.",
    "3×7 con 19 kg","3×12 → 19 kg",False,None),
  ]),
 dict(id="pierna-a", name="Pierna A", md="MD+2", focus="Cuádriceps y trabajo unilateral · la sesión más pesada de pierna",
  callout="Si llegas con agujetas fuertes del partido: RIR +1 y quita la última serie de cada ejercicio. La serie extra de la izquierda se mantiene.",
  warmup=["3 min de trote en el sitio", "10 sentadillas profundas con pausa", "10 split squats por lado sin peso", "2×5 saltos bajos al banco"],
  ex=[
   ("Sentadilla búlgara","Split_Squat_with_Dumbbells","2×19 kg","Izq 4 · Der 3","8–12","1–2","2:00 entre lados","3-0-X-0",
    "Pie trasero sobre el banco, la rodilla delantera avanza sobre la punta del pie y el torso queda erguido para cargar el cuádriceps. La derecha hace exactamente las reps que hizo la izquierda.",
    "Primera sesión","Izq 4×12 → 2×22 kg",True,None),
   ("Sentadilla goblet con talones elevados","Goblet_Squat","22 kg","3","12–20","1–2","2:00","3-1-1-0",
    "Talones sobre un disco o tabla de 2–3 cm. Más flexión de rodilla significa más cuádriceps con poca carga.",
    "Primera sesión","3×20 → bajada 4 s",False,"En la foto los talones están en el suelo; tú elévalos."),
   ("Step-up al banco","Dumbbell_Step_Ups","2×19 kg","2 / lado","8–12","2","1:30","2-0-1-0",
    "Sube solo con la pierna de arriba, sin impulsarte con la de abajo.",
    "Primera sesión","2×12 → 2×22 kg",True,None),
   ("Peso muerto rumano","Stiff-Legged_Dumbbell_Deadlift","2×22 kg","3","10–15","2","2:00","3-1-1-0",
    "Rodillas un poco flexionadas, la cadera va atrás y los isquios se estiran. Espalda neutra todo el recorrido.",
    "Primera sesión","3×15 → bajada 4 s",False,None),
   ("Gemelo de pie unilateral","Standing_Dumbbell_Calf_Raise","22 kg","3 / lado","10–15","1","1:00","2-2-1-1",
    "A una pierna, con la punta sobre un escalón. Pausa de 2 s abajo en el máximo estiramiento.",
    "Primera sesión","3×15 → pausa 3 s abajo",False,"La foto es a dos piernas; tú hazlo a una."),
  ]),
 dict(id="torso-b", name="Torso B", md="MD+3", focus="Fondos lastrados y tirón vertical con más reps",
  callout=None,
  warmup=["Rotaciones torácicas en cuadrupedia, 2 min", "10 retracciones escapulares colgado de la barra", "2×10 flexiones con pausa abajo", "2×5 fondos lentos a medio recorrido"],
  ex=[
   ("Fondos en paralelas lastrados","Dips_-_Chest_Version","Chaleco 10 kg","4","6–10","1–2","2:30","3-0-X-0",
    "Torso inclinado 20–30° para cargar el pecho. Baja hasta que el hombro quede a la altura del codo, sin dolor en la parte delantera del hombro.",
    "Máx. 15 sin lastre","4×10 → +2,5–5 kg",False,None),
   ("Dominadas supinas o neutras","Chin-Up","Peso corporal","4","8–12","1–2","2:00","3-0-X-0",
    "Palmas hacia ti: más bíceps y dorsal en estiramiento. Sin lastre y con más reps, para complementar el día pesado de Torso A.",
    "Primera sesión","4×12 → chaleco 10 kg",False,None),
   ("Press plano con pausa de 2 s","Dumbbell_Bench_Press","19 kg","3","8–12","2","2:00","3-2-X-0",
    "Segundo estímulo de pecho de la semana. Pausa completa de 2 s abajo, sin rebote.",
    "Primera sesión","3×12 → 22 kg",False,None),
   ("Press militar sentado","Seated_Dumbbell_Press","19 kg","3","8–12","1–2","2:00","2-0-X-0",
    "Respaldo a 75–80°, sin arquear la zona lumbar. Si no llegas a 8 reps, baja a 15 kg.",
    "Primera sesión","3×12 → 22 kg",False,None),
   ("Remo con pecho apoyado","Dumbbell_Incline_Row","2×19 kg","3","12–15","1","1:30","2-0-X-1",
    "Boca abajo en el banco inclinado. Sin poder hacer trampa con la lumbar, el trabajo lo hacen el dorsal y el trapecio medio.",
    "Primera sesión","3×15 → 2×22 kg",False,None),
   ("Extensión francesa a dos manos","Seated_Triceps_Press","1×22 kg","3","10–15","1","1:30","3-0-1-0",
    "Sentado, con los codos apuntando al techo. Estira la porción larga del tríceps.",
    "Primera sesión","3×15 → bajada 4 s",False,None),
  ]),
 dict(id="pierna-b", name="Pierna B", md="MD+4", focus="Cadena posterior y prevención · baja fatiga, nunca más tarde de MD-3",
  callout="Si cae justo a MD-3, haz los nórdicos a 2 series.",
  warmup=["Movilidad de cadera 90/90", "10 puentes de glúteo", "10 sentadillas goblet ligeras"],
  ex=[
   ("Hip thrust unilateral en banco","Barbell_Hip_Thrust","22 kg","3 / lado","10–15","2","1:30","2-1-X-1",
    "Escápulas en el borde del banco y la mancuerna sobre la cadera, a una pierna.",
    "Primera sesión","3×15 → pausa 2 s arriba",True,"La foto es con barra y a dos piernas; tú hazlo con mancuerna y a una pierna."),
   ("Split squat, pie trasero en el suelo","Split_Squats","2×19 kg","Izq 3 · Der 2","10–12","3","1:30","2-0-1-0",
    "Volumen extra para la izquierda sin acumular daño muscular. Lejos del fallo a propósito.",
    "Primera sesión","Se mantiene a RIR 3",True,None),
   ("Curl nórdico excéntrico","Natural_Glute_Ham_Raise","Peso corporal","3","3–6","—","2:00","bajada 4–5 s",
    "Rodillas en el suelo y tobillos anclados bajo el banco. Baja lo más lento que puedas y ayúdate con las manos para volver. Es la mejor prevención de lesión de isquios en fútbol.",
    "Primera sesión","3×6 → bajada más lenta",False,"La foto usa una máquina; tú ancla los pies bajo el banco."),
   ("Plancha Copenhague","Side_Bridge","Peso corporal","3 / lado","15–30 s","—","1:00","isométrico",
    "Plancha lateral con la pierna de arriba sobre el banco (por la rodilla es más fácil, por el tobillo más difícil) y la de abajo en el aire. Protege el aductor en los cambios de dirección.",
    "Primera sesión","30 s → apoyo en el tobillo",False,"La foto es una plancha lateral normal; sube la pierna de arriba al banco."),
   ("Gemelo sentado","Barbell_Seated_Calf_Raise","22 kg","3","15–20","1","1:00","2-1-1-1",
    "Punta del pie sobre un disco y la mancuerna apoyada en los muslos. Trabaja el sóleo, clave en las aceleraciones.",
    "Primera sesión","3×20 → a una pierna",False,"La foto es con barra; tú usa la mancuerna."),
  ]),
]

import json

def parse_rows(sets):
    m = re.match(r"Izq (\d+) · Der (\d+)", sets)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        rows = []
        for n in range(1, max(a, b) + 1):
            if n <= a: rows.append([n, "izq"])
            if n <= b: rows.append([n, "der"])
        return rows
    m = re.match(r"(\d+) / lado", sets)
    if m:
        rows = []
        for n in range(1, int(m.group(1)) + 1):
            rows += [[n, "izq"], [n, "der"]]
        return rows
    return [[n, None] for n in range(1, int(re.match(r"\d+", sets).group(0)) + 1)]

def parse_kg(load):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*kg", load)
    return float(m.group(1).replace(",", ".")) if m else 0

def parse_rest(rest):
    m = re.match(r"(\d+):(\d+)", rest)
    return int(m.group(1)) * 60 + int(m.group(2)) if m else 90

def plan_json():
    out = {"sessions": [], "ex": {}}
    for s in SESSIONS:
        ids = []
        for i, e in enumerate(s["ex"]):
            name, img, load, sets, reps, rir, rest, tempo, note, last, nxt, left, approx = e
            eid = f'{s["id"]}-{i+1}'
            ids.append(eid)
            rmin = re.match(r"(\d+)", reps)
            rirm = re.match(r"(\d)", rir)
            out["ex"][eid] = {
                "id": eid, "s": s["id"], "name": name, "rows": parse_rows(sets),
                "kg": parse_kg(load), "lastre": ("Chaleco" in load or "Peso corporal" in load),
                "secs": reps.endswith(" s"), "repsMin": int(rmin.group(1)) if rmin else 0,
                "rir": int(rirm.group(1)) if rirm else None, "rest": parse_rest(rest),
            }
        out["sessions"].append({"id": s["id"], "name": s["name"], "ex": ids})
    return json.dumps(out, ensure_ascii=False).replace("<", "\\u003c")

def portrait(img):
    i = Image.open(f"img/{img}_0.jpg")
    return i.height > i.width * 0.9

def tempo_html(t):
    parts = t.split("-")
    if len(parts) != 4:
        return f'<div class="tempo tempo-text"><span class="k">Tempo</span><span class="free">{E(t)}</span></div>'
    labels = ["Baja", "Pausa", "Sube", "Arriba"]
    cells = []
    for v, l in zip(parts, labels):
        off = " off" if v == "0" else ""
        val = "X" if v == "X" else f"{v}s"
        title = "explosivo" if v == "X" else (f"{v} s" if v != "0" else "sin pausa")
        cells.append(f'<span class="seg{off}" title="{l}: {title}"><b>{val}</b><i>{l}</i></span>')
    return f'<div class="tempo"><span class="k">Tempo <code>{E(t)}</code></span><div class="segs">{"".join(cells)}</div></div>'

def card(sid, i, e):
    name, img, load, sets, reps, rir, rest, tempo, note, last, nxt, left, approx = e
    tags = '<span class="tag tag-left"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Izquierda primero</span>' if left else ""
    if "Chaleco" in load:
        tags += '<span class="tag tag-load">Lastrado</span>'
    pcls = " portrait" if portrait(img) else ""
    ap = f'<p class="approx">{E(approx)}</p>' if approx else ""
    long_sets = " long" if len(sets) > 4 else ""
    first = last == "Primera sesión"
    nrows = len(parse_rows(sets))
    return f'''<details class="ex" id="{sid}-{i}">
  <summary class="ex-sum">
    <span class="idx">{i:02d}</span>
    <span class="ex-t"><b>{E(name)}</b><small>{E(sets)} × {E(reps)} · {E(load)}</small></span>
    {('<span class="tags">'+tags+'</span>') if tags else ''}
    <span class="ex-st" data-st="{sid}-{i}">0/{nrows}</span>
    <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </summary>
  <div class="ex-body">
  <div class="ex-media">
    <div class="pics{pcls}">
      <figure><img src="img/{img}_0.jpg" alt="{E(name)}, posición inicial" loading="lazy" width="560" height="420"><figcaption>Inicio</figcaption></figure>
      <figure><img src="img/{img}_1.jpg" alt="{E(name)}, posición final" loading="lazy" width="560" height="420"><figcaption>Final</figcaption></figure>
    </div>{ap}
  </div>
  <div class="ex-main">
    <div class="rx">
      <div class="rx-big"><div><span class="lbl">Series</span><span class="num{long_sets}">{E(sets)}</span></div><span class="times" aria-hidden="true">×</span><div><span class="lbl">Reps</span><span class="num">{E(reps)}</span></div></div>
      <dl class="rx-meta"><div><dt>Carga</dt><dd>{E(load)}</dd></div><div><dt>RIR</dt><dd>{E(rir)}</dd></div><div><dt>Descanso</dt><dd>{E(rest)}</dd></div></dl>
    </div>
    {tempo_html(tempo)}
    <p class="note">{E(note)}</p>
    <div class="track">
      <div class="{'first' if first else ''}"><span>Última vez</span><b data-last="{sid}-{i}">{E(last)}</b></div>
      <div class="next"><span>Siguiente paso</span><b>{E(nxt)}</b></div>
    </div>
    <div class="log" data-ex="{sid}-{i}"></div>
  </div>
  </div>
</details>'''

panels = []
for s in SESSIONS:
    wu = "".join(f"<li>{E(w)}</li>" for w in s["warmup"])
    call = f'<p class="callout"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5v4.2M8 11v.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>{E(s["callout"])}</p>' if s["callout"] else ""
    cards = "\n".join(card(s["id"], i + 1, e) for i, e in enumerate(s["ex"]))
    panels.append(f'''<section class="panel" id="{s["id"]}" data-tab="{s["id"]}" aria-label="{s["name"]}">
  <header class="panel-head">
    <div class="ph-title"><span class="md">{s["md"]}</span><h2>{s["name"]}</h2></div>
    <p class="focus">{E(s["focus"])}</p>
    {call}
    <div class="sprog" data-sprog="{s["id"]}"><div class="sbar"><i></i></div><span class="stext">Misión: registra tus series para ganar EXP</span></div>
  </header>
  <details class="warmup"><summary><span class="lbl">Calentamiento</span><span class="wu-n">{len(s["warmup"])} pasos · 8–10 min</span><svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></summary><ol>{wu}</ol></details>
  <div class="ex-list">{cards}</div>
  <div class="finish-wrap"><button type="button" class="finish" data-finish="{s["id"]}">Completar misión</button><button type="button" class="reopen" data-reopen="{s["id"]}" hidden>Reabrir misión</button></div>
</section>''')

import os
AVATAR_SVG = '''<svg class="av-svg" viewBox="0 0 120 120" aria-hidden="true"><g stroke="rgba(53,215,255,.16)" stroke-width="2"><path d="M-10 95 60-10M10 125 95-10M45 128 128 10"/></g><path d="M12 122c4-25 21-36 48-38 27 2 44 13 48 38z" fill="#0c1d4c"/><path d="M47 85 60 99 73 85" fill="none" stroke="#35d7ff" stroke-width="2.2"/><text x="60" y="117" text-anchor="middle" font-family="Saira Condensed,Arial Narrow,sans-serif" font-weight="800" font-style="italic" font-size="19" fill="#fff">10</text><path d="M51 70v16h18V70z" fill="#050d26"/><ellipse cx="60" cy="56" rx="19" ry="23" fill="#050d26"/><path d="M37 53 33 33l11 7-2-17 11 11 3-16 7 14 8-13 1 16 11-8-3 15 8-2-7 12c-2-12-11-19-21-19s-19 7-22 19z" fill="#050d26"/><path class="eye" d="m47 57 9-2m8 0 9 2" stroke="#35d7ff" stroke-width="2.8" stroke-linecap="round"/></svg>'''
def avatar_html():
    if os.path.exists("img/avatar.jpg"):
        return '<img class="av-img" src="img/avatar.jpg" alt="Avatar del jugador">'
    return AVATAR_SVG

tpl = open("plantilla.html").read().replace("<!--AVATAR-->", avatar_html())
open("rutina.html", "w").write(tpl.replace("<!--PANELS-->", "\n".join(panels)).replace("/*PLAN*/", plan_json()).replace("/*APP*/", open("app.js").read()))
print("ok", sum(len(s["ex"]) for s in SESSIONS), "ejercicios")
