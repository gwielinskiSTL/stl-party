"""
STL Party — jeu de plateau à la Mario Party qui détermine l'ordre de l'échange de cadeaux de la STL.

    python -m app.main            (depuis la racine du projet)

La partie est enregistrée après chaque action dans PARTIES/partie.json : un rechargement de la page ou un
redémarrage du serveur ne perd rien. Les 50 états précédents sont gardés pour le bouton « Annuler ».
Toutes les erreurs sont renvoyées en JSON {"erreur": "..."} ; une erreur n'arrête jamais le serveur.
"""
from __future__ import annotations

import json
import logging
import socket
import threading
from datetime import datetime
from pathlib import Path

from fastapi import Body, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
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
    if etat is None:
        return {"etat": None, "peut_annuler": False}
    return {
        "etat": etat,
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


@app.post("/api/repartition/commencer")
def commencer_repartition():
    return _agir(jeu.commencer_repartition)


@app.post("/api/repartition")
def repartition(corps: dict = Body(...)):
    return _agir(jeu.choisir_position, corps.get("position"))


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
