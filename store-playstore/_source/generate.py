# Génère les visuels Play Store (rendu par Chrome via Playwright). Lancer : python generate.py
import json, pathlib, random, subprocess, tempfile
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = '<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Manrope:wght@400;500;700;800&family=IBM+Plex+Mono:wght@500;600&display=block" rel="stylesheet">'
RIDGE = '<svg class="ridge" viewBox="0 0 380 24"><polyline points="0,14 50,14 69,4 98,20 133,2 170,14 380,14" fill="none" stroke="#E8A93B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'


def mark(style):
    return (
        f'<svg viewBox="0 0 120 120" style="{style}"><circle cx="60" cy="60" r="58" fill="#fff"/>'
        '<circle cx="60" cy="60" r="50" fill="none" stroke="#E8A93B" stroke-width="3.5" stroke-dasharray="1.2 7"/>'
        '<circle cx="60" cy="60" r="40" fill="#0E4C56"/>'
        '<path d="M42 62L55 75L80 45" fill="none" stroke="#F3EFE3" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    )


CSS = """*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden}
body{background:linear-gradient(165deg,#0E4C56,#0A363D);font-family:Manrope;color:#16211F;position:relative}
.cap{position:absolute;top:90px;left:80px;right:80px;color:#fff}.cap h1{font:700 76px/1.1 Fraunces}.cap p{font:500 34px/1.35 Manrope;color:#CFE7E3;margin-top:22px}
.ridge{width:220px;height:16px;display:block;margin-top:24px}
.phone{position:absolute;left:150px;top:520px;width:780px;height:1600px;background:#111;border-radius:70px;padding:18px}
.screen{width:744px;height:1564px;background:#F3EFE3;border-radius:54px;overflow:hidden;position:relative}
.ui{zoom:2;width:372px}
.bar{height:30px;background:#0E4C56;color:#fff;font:600 11px Manrope;padding:9px 20px 0}
.head{background:#0E4C56;color:#fff;padding:8px 16px 14px;font:600 20px Fraunces}
.body{padding:14px;display:flex;flex-direction:column;gap:14px}
.hero{background:#0E4C56;border-radius:22px;padding:20px;color:#fff}.hero .ridge{width:140px;height:12px;margin:8px 0}
.eye{font:500 11px 'IBM Plex Mono';letter-spacing:2px;text-transform:uppercase;color:#E8A93B}
.hello{font:700 26px Fraunces;margin-top:6px}.meta{font:400 13px Manrope;color:#CFE7E3}
.card{background:#fff;border:1px solid rgba(22,33,31,.12);border-radius:16px;padding:18px}
.lab{font:500 11px 'IBM Plex Mono';letter-spacing:2px;text-transform:uppercase;color:#35A69A}
.row{display:flex;gap:8px;margin-top:12px}.row>div{flex:1}.sl{font-size:12px;color:#6B7371}.sv{font:600 17px 'IBM Plex Mono';color:#0E4C56;margin-top:4px}
.sch{font:500 12px Manrope;color:#6B7371;margin-top:14px}
.btn{background:#E8A93B;color:#0A363D;font:800 16px Manrope;text-align:center;border-radius:12px;padding:18px;margin-top:14px}
.link{font:500 12px Manrope;color:#35A69A;text-align:center;margin-top:12px}
.amt{font:600 22px 'IBM Plex Mono';color:#0E4C56;margin-top:6px}
.line{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-top:1px solid rgba(22,33,31,.1);font:500 14px Manrope}.line:first-of-type{border:0}.line b{font:600 13px 'IBM Plex Mono';color:#0E4C56}
.title{font:600 20px Fraunces;color:#0E4C56;margin-bottom:8px}.big{font:700 34px Fraunces;color:#fff}
.tag{font:700 11px Manrope;padding:4px 9px;border-radius:99px}
.tabs{position:absolute;bottom:0;left:0;right:0;height:130px;background:#fff;border-top:2px solid rgba(22,33,31,.1);display:flex;justify-content:space-around;padding-top:36px;font:500 24px Manrope;color:#6B7371}.tabs b{color:#0E4C56}
.cam{position:absolute;inset:0;background:radial-gradient(circle,#3b4a4a,#0d1414)}
.frame{position:absolute;left:150px;top:400px;width:444px;height:444px;border:8px solid #E8A93B;border-radius:40px;background:#fff;padding:36px}
.ov{position:absolute;left:0;right:0;color:#fff;text-align:center}
"""
TABS = ["Pointage", "Congés", "Paie", "Historique", "Profil"]


def caption(h, p):
    return f'<style>{CSS}</style><div class="cap"><h1>{h}</h1>{RIDGE}<p>{p}</p></div>'


def shot(name, h, p, head, body, active):
    tabs = "".join(f"<b>{t}</b>" if t == active else f"<span>{t}</span>" for t in TABS)
    return name, 1080, 1920, (
        caption(h, p)
        + f'<div class="phone"><div class="screen"><div class="ui"><div class="bar">08:02</div><div class="head">{head}</div>'
        + f'<div class="body">{body}</div></div><div class="tabs">{tabs}</div></div></div>'
    )


def qr():
    random.seed(7)
    cells = ""
    for y in range(25):
        for x in range(25):
            corner = (x < 7 and y < 7) or (x > 17 and y < 7) or (x < 7 and y > 17)
            if corner:
                u, v = x % 18, y % 18
                on = u in (0, 6) or v in (0, 6) or (2 <= u <= 4 and 2 <= v <= 4)
            else:
                on = random.random() < 0.5
            if on:
                cells += f'<rect x="{x}" y="{y}" width="1" height="1"/>'
    return f'<svg viewBox="0 0 25 25" fill="#0A363D" style="width:100%;height:100%">{cells}</svg>'


def line(label, value):
    return f'<div class="line"><span>{label}</span><b>{value}</b></div>'


def status(label, sub, text, bg, fg):
    return (
        f'<div class="line"><span>{label}<br><small style="color:#6B7371">{sub}</small></span>'
        f'<span class="tag" style="background:{bg};color:{fg}">{text}</span></div>'
    )


GREEN = ("#E3F4EC", "#1E8A5F")
AMBER = ("#FFF3DA", "#A86A00")

ASSETS = [
    ("icon-512.png", 512, 512,
     "<style>*{margin:0}body{width:512px;height:512px;background:#0E4C56;display:flex;align-items:center;justify-content:center}</style>"
     + mark("width:390px")),
    ("feature-graphic-1024x500.png", 1024, 500,
     "<style>*{margin:0;box-sizing:border-box}html,body{width:1024px;height:500px;overflow:hidden}"
     "body{background:linear-gradient(120deg,#0E4C56,#0A363D);color:#fff;display:flex;align-items:center;padding:0 70px;gap:50px}"
     ".ridge{width:240px;height:16px;display:block;margin:18px 0}h1{font:700 74px Fraunces}p{font:500 30px/1.3 Manrope;color:#CFE7E3}</style>"
     + mark("width:230px;flex:none")
     + f"<div><h1>Mshahara</h1>{RIDGE}<p>Pointage, congés et bulletins de paie, dans votre poche.</p></div>"),
    shot("01-pointage.png", "Pointez en un geste", "Entrée et sortie enregistrées depuis votre téléphone.", "Pointage",
         f'<div class="hero"><div class="eye">Espace collaborateur</div><div class="hello">Bonjour Fatima Said Ali</div>{RIDGE}'
         '<div class="meta">Assistante administrative · 2026-11-05</div></div>'
         '<div class="card"><div class="lab">Aujourd’hui</div><div class="row"><div><div class="sl">Entrée</div><div class="sv">—</div></div>'
         '<div><div class="sl">Sortie</div><div class="sv">—</div></div><div><div class="sl">Statut</div><div class="sv">à badger</div></div></div>'
         '<div class="sch">Horaire : 08:00–17:00 · retard après 10 min · entrée dès 07:00</div>'
         '<div class="btn">Pointer l’entrée</div><div class="link">Pointer en scannant le QR code du site ›</div></div>',
         "Pointage"),
    ("02-qr.png", 1080, 1920,
     caption("Scannez le QR code du site", "Un code qui change toutes les 15 secondes.")
     + '<div class="phone"><div class="screen"><div class="cam"></div>'
     '<div class="ov" style="top:290px;font:700 34px Manrope">Visez le QR code de l’écran</div>'
     f'<div class="frame">{qr()}</div>'
     '<div class="ov" style="top:900px;font:500 28px Manrope">Le code change toutes les 15 secondes.</div></div></div>'),
    shot("03-paie.png", "Votre paie, toujours à portée", "Consultez vos bulletins et votre contrat.", "Ma paie",
         '<div class="hero"><div class="meta">Salaire de base mensuel</div><div class="big">250 000 KMF</div></div>'
         '<div class="card"><div class="title">Mon contrat</div>'
         + line("Poste", "Assistante adm.") + line("Type de contrat", "CDI") + line("Date d’embauche", "01/11/2024")
         + '</div><div class="lab">Mes bulletins de paie</div><div class="card">'
         + line("Octobre 2026", "221 500 KMF") + line("Septembre 2026", "221 500 KMF") + line("Août 2026", "221 500 KMF")
         + "</div>",
         "Paie"),
    shot("04-conges.png", "Vos congés sans paperasse", "Demandez, suivez, consultez votre solde.", "Mes congés",
         '<div class="hero"><div class="big">18</div><div class="meta">jours restants</div>'
         '<div class="meta" style="color:#E8A93B;font-weight:700;margin-top:8px">Congé annuel</div></div>'
         '<div class="btn" style="margin:0">+ Demander un congé</div><div class="lab">Mes demandes</div><div class="card">'
         + status("Congé annuel", "22 – 26 déc. 2026", "En attente", *AMBER)
         + status("Congé annuel", "10 – 14 août 2026", "Validée", *GREEN)
         + "</div>",
         "Congés"),
    shot("05-historique.png", "Vos présences en un coup d’œil", "Un oubli ? Demandez une correction.", "Historique",
         '<div class="btn" style="margin:0">Demander une correction</div>'
         '<div class="lab">Présences du mois · touchez un jour pour le corriger</div><div class="card">'
         + status("05/11", "07:56 – en cours", "Présent", *GREEN)
         + status("04/11", "07:58 – 17:04", "Présent", *GREEN)
         + status("03/11", "08:17 – 17:01", "En retard", *AMBER)
         + status("02/11", "07:52 – 17:10", "Présent", *GREEN)
         + "</div>",
         "Historique"),
]

(ROOT / "screenshots").mkdir(exist_ok=True)
jobs = [
    {"w": w, "h": h, "html": f"<!doctype html><meta charset=utf-8>{FONTS}{html}",
     "out": str((ROOT / "screenshots" if name[0].isdigit() else ROOT) / name)}
    for name, w, h, html in ASSETS
]
jobfile = pathlib.Path(tempfile.gettempdir()) / "mshahara-jobs.json"
jobfile.write_text(json.dumps(jobs), encoding="utf-8")
subprocess.run(["node", str(pathlib.Path(__file__).with_name("render.cjs")), str(jobfile)], check=True)
for job in jobs:
    img = Image.open(job["out"]).convert("RGB")
    img.save(job["out"])
    print(pathlib.Path(job["out"]).name, img.size)

shots = sorted((ROOT / "screenshots").glob("*.png"))
sheet = Image.new("RGB", (300 * len(shots), 533), "white")
for k, f in enumerate(shots):
    sheet.paste(Image.open(f).resize((300, 533)), (k * 300, 0))
sheet.save(pathlib.Path(tempfile.gettempdir()) / "mshahara-sheet.png")
