"""
STL Party — jeu de plateau à la Mario Party qui détermine l'ordre de l'échange de cadeaux de la STL.

    python -m app.main            (depuis la racine du projet)

La partie est enregistrée après chaque action dans PARTIES/partie.json : un rechargement de la page ou un
redémarrage du serveur ne perd rien. Les 50 états précédents sont gardés pour le bouton « Annuler ».
Toutes les erreurs sont renvoyées en JSON {"erreur": "..."} ; une erreur n'arrête jamais le serveur.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import secrets
import socket
import threading
from datetime import datetime
from pathlib import Path

from fastapi import Body, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import config, jeu

STATIQUE = Path(__file__).resolve().parent / "static"
MAX_HISTORIQUE = 50

app = FastAPI(title="STL Party", docs_url=None, redoc_url=None)
journal_serveur = logging.getLogger("stl_party")
_verrou = threading.Lock()


@app.exception_handler(jeu.ErreurJeu)
async def _err_jeu(_: Request, e: jeu.ErreurJeu):
    return JSONResponse({"erreur": str(e)}, status_code=e.code)


@app.exception_handler(config.ErreurConfig)
async def _err_config(_: Request, e: config.ErreurConfig):
    return JSONResponse({"erreur": str(e)}, status_code=500)


@app.exception_handler(Exception)
async def _err_generique(_: Request, e: Exception):
    journal_serveur.exception("Erreur inattendue")
    return JSONResponse({"erreur": f"Erreur interne : {type(e).__name__} : {e}"}, status_code=500)


@app.middleware("http")
async def _sans_cache(request: Request, call_next):
    reponse = await call_next(request)
    if request.url.path.startswith("/api/"):
        reponse.headers["Cache-Control"] = "no-store"
    else:   # page et fichiers statiques : toujours revalidés, pour qu'une mise à jour soit vue tout de suite
        reponse.headers["Cache-Control"] = "no-cache"
    return reponse


# ------------------------------------------------------------------------------ enregistrement
def _fichier(nom: str) -> Path:
    return config.dossier_donnees() / nom


def _lire_json(nom: str, defaut):
    chemin = _fichier(nom)
    if not chemin.exists():
        return defaut
    return json.loads(chemin.read_text(encoding="utf-8"))


def _ecrire_json(nom: str, contenu):
    chemin = _fichier(nom)
    temporaire = chemin.with_suffix(".tmp")
    temporaire.write_text(json.dumps(contenu, ensure_ascii=False, indent=1), encoding="utf-8")
    temporaire.replace(chemin)          # écriture atomique : jamais de fichier à moitié écrit


def _charger() -> dict | None:
    return _lire_json("partie.json", None)


def _vue(etat: dict | None) -> dict:
    """Vue publique (écran projeté) : le détail de la pige n'y figure jamais."""
    if etat is None:
        return {"etat": None, "peut_annuler": False}
    public = dict(etat)
    if etat.get("pige"):
        public["pige"] = {"faite": True, "participants": len(etat["pige"]["lignes"]), "objets": len(etat["pige"]["objets"])}
    return {
        "etat": public,
        "peut_annuler": bool(_lire_json("historique.json", [])),
        "classement": [e["id"] for e in jeu.classement(etat)],
        "mini_jeu": jeu.mini_jeu_du_tour(etat) if etat["phase"] in ("mini_jeu", "deplacement", "fin_tour") else None,
        "peut_magasiner": {e["id"]: jeu.peut_magasiner(etat, e) for e in etat["equipes"]},
    }


def _agir(action, *args, **kwargs) -> dict:
    """Charge la partie, applique l'action, enregistre l'état précédent dans l'historique, puis le nouvel état."""
    with _verrou:
        etat = _charger()
        if etat is None:
            raise jeu.ErreurJeu("Aucune partie en cours.", 404)
        avant = json.loads(json.dumps(etat))
        animation = action(etat, *args, **kwargs)
        historique = _lire_json("historique.json", [])
        historique.append(avant)
        _ecrire_json("historique.json", historique[-MAX_HISTORIQUE:])
        _ecrire_json("partie.json", etat)
        return {"partie": _vue(etat), "animation": animation}


# ------------------------------------------------------------------------------ API
@app.get("/api/sante")
def sante():
    return {"statut": "ok"}


@app.get("/api/configuration")
def configuration():
    cfg = config.lire()
    return {"partie": cfg["partie"], "cases": cfg["cases"], "plateau": cfg["plateau"]["liste"],
            "mode_noel": bool(cfg["application"].get("mode_noel", False)),
            "animations": str(cfg["application"].get("animations", "toujours")),
            "mini_jeux": cfg["mini_jeux"], "objets": cfg["objets"], "noms_cases": jeu.NOMS_CASES}


@app.get("/api/partie")
def partie():
    return _vue(_charger())


@app.post("/api/partie")
def nouvelle(corps: dict = Body(...)):
    with _verrou:
        ancienne = _charger()
        if ancienne is not None:
            _archiver(ancienne)
        etat = jeu.nouvelle_partie(config.lire(), corps.get("equipes") or [])
        _ecrire_json("historique.json", [])
        _ecrire_json("partie.json", etat)
        return {"partie": _vue(etat), "animation": {"type": "nouvelle", "evenements": []}}


@app.delete("/api/partie")
def abandonner():
    with _verrou:
        etat = _charger()
        if etat is not None:
            _archiver(etat)
        for nom in ("partie.json", "historique.json"):
            _fichier(nom).unlink(missing_ok=True)
        return _vue(None)


def _archiver(etat: dict):
    dossier = config.dossier_donnees() / "archives"
    dossier.mkdir(exist_ok=True)
    (dossier / f"partie_{datetime.now():%Y-%m-%d_%Hh%M%S}.json").write_text(
        json.dumps(etat, ensure_ascii=False, indent=1), encoding="utf-8")


@app.post("/api/mini-jeu")
def mini_jeu(corps: dict = Body(...)):
    return _agir(jeu.resultat_mini_jeu, corps.get("ordre") or [])


@app.post("/api/lancer")
def lancer():
    return _agir(jeu.lancer)


@app.post("/api/decision")
def decision(corps: dict = Body(...)):
    return _agir(jeu.decider, corps)


@app.post("/api/tour-suivant")
def tour_suivant():
    return _agir(jeu.tour_suivant)


@app.post("/api/equipes/aleatoires")
def equipes_aleatoires(corps: dict = Body(...)):
    """Forme des équipes au hasard à partir d'une liste de participants (avant la partie)."""
    return {"equipes": jeu.repartir_equipes(corps.get("personnes") or [], corps.get("nb_equipes") or 5)}


@app.post("/api/pige")
def tirer_pige():
    return _agir(jeu.tirer_pige)


# ------------------------------------------------------------------------------ page privée de l'animateur
LOCAL = {"127.0.0.1", "::1", "localhost"}


def _verifier_prive(request: Request):
    """Sans code_prive : lisible seulement sur le poste qui fait tourner le jeu. Avec un code : code exigé."""
    code = config.lire()["code_prive"]
    fourni = request.headers.get("X-Code-Prive") or request.query_params.get("code") or ""
    if code:
        if not secrets.compare_digest(fourni, code):
            raise jeu.ErreurJeu("Code de la page privée requis ou invalide.", 403)
    elif (request.client.host if request.client else "") not in LOCAL:
        raise jeu.ErreurJeu("Le classement privé ne s'ouvre que sur le poste qui fait tourner le jeu "
                            "(ou ajoutez code_prive dans [pige] de STL_PARTY.toml).", 403)
    return code != ""


@app.get("/api/pige")
def lire_pige(request: Request):
    _verifier_prive(request)
    etat = _charger()
    if etat is None or not etat.get("pige"):
        raise jeu.ErreurJeu("La pige n'est pas encore tirée.", 404)
    return {
        "pige": etat["pige"],
        "equipes": [{"id": e["id"], "nom": e["nom"], "objets": e["objets"], "billets": e["billets"], "kwh": e["kwh"]}
                    for e in etat["equipes"]],
        "objets": etat["reglages"]["objets"],
    }


@app.get("/api/pige.csv")
def pige_csv(request: Request):
    _verifier_prive(request)
    donnees = lire_pige(request)
    noms = {e["id"]: e["nom"] for e in donnees["equipes"]}
    objets = {o["id"]: o["nom"] for o in donnees["objets"]}
    par_joueur: dict = {}
    for a in donnees["pige"]["objets"]:
        e = donnees["equipes"][a["equipe"]]
        par_joueur.setdefault((a["equipe"], a["joueur"]), []).append(objets.get(e["objets"][a["indice"]]["id"], ""))
    sortie = io.StringIO()
    ecrivain = csv.writer(sortie, delimiter=";")
    ecrivain.writerow(["Ordre de pige", "Participant", "Équipe", "Rang tiré (1 = meilleur)", "Objets"])
    for l in donnees["pige"]["lignes"]:
        ecrivain.writerow([l["ordre"], l["joueur"], noms[l["equipe"]], l["rang"],
                           ", ".join(par_joueur.get((l["equipe"], l["joueur"]), []))])
    return Response("\ufeff" + sortie.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="pige_stl_party.csv"'})


@app.get("/prive")
def page_privee():
    return FileResponse(STATIQUE / "prive.html")


@app.post("/api/ajuster")
def ajuster(corps: dict = Body(...)):
    return _agir(jeu.ajuster, corps.get("equipe"), corps.get("kwh", 0), corps.get("billets", 0))


@app.post("/api/objet")
def objet(corps: dict = Body(...)):
    return _agir(jeu.basculer_objet, corps.get("equipe"), corps.get("indice"))


@app.post("/api/annuler")
def annuler():
    with _verrou:
        historique = _lire_json("historique.json", [])
        if not historique:
            raise jeu.ErreurJeu("Rien à annuler.", 409)
        etat = historique.pop()
        _ecrire_json("historique.json", historique)
        _ecrire_json("partie.json", etat)
        return {"partie": _vue(etat), "animation": {"type": "annulation", "evenements": []}}


# ------------------------------------------------------------------------------ interface
@app.get("/")
def accueil():
    return FileResponse(STATIQUE / "index.html")


app.mount("/static", StaticFiles(directory=STATIQUE), name="static")


def main():
    import uvicorn

    reglages = config.application()
    hote, port = reglages["hote"], reglages["port"]
    print("=" * 70)
    print(" STL Party — le jeu qui décide de l'ordre de l'échange de cadeaux")
    print(f" Sur ce poste       : http://localhost:{port}")
    if hote in ("0.0.0.0", "::"):
        try:
            print(f" Depuis le réseau   : http://{socket.gethostbyname(socket.gethostname())}:{port}")
        except OSError:
            pass
    print(" Ctrl+C pour arrêter.")
    print("=" * 70)
    uvicorn.run(app, host=hote, port=port, log_level="warning")


if __name__ == "__main__":
    main()
