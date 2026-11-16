"""
Réglages de STL Party : variable PARTY_* → STL_PARTY.toml à la racine → valeur par défaut.

    PARTY_CONFIG   chemin d'un autre fichier de configuration
    PARTY_DONNEES  dossier où la partie est enregistrée (défaut : PARTIES/ à la racine)
    PARTY_HOTE, PARTY_PORT
"""
from __future__ import annotations

import os
import tomllib
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
LETTRES_CASES = {"T", "R", "B", "E", "I", "F", "D", "M"}


class ErreurConfig(Exception):
    pass


def chemin_config() -> Path:
    return Path(os.getenv("PARTY_CONFIG") or RACINE / "STL_PARTY.toml")


def dossier_donnees() -> Path:
    dossier = Path(os.getenv("PARTY_DONNEES") or RACINE / "PARTIES")
    dossier.mkdir(parents=True, exist_ok=True)
    return dossier


def lire() -> dict:
    """Lit et valide la configuration. Lève ErreurConfig avec un message lisible."""
    chemin = chemin_config()
    try:
        cfg = tomllib.loads(chemin.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ErreurConfig(f"Fichier de configuration introuvable : {chemin}")
    except tomllib.TOMLDecodeError as e:
        raise ErreurConfig(f"{chemin.name} invalide : {e}")

    for section in ("application", "partie", "cases", "plateau"):
        if not isinstance(cfg.get(section), dict):
            raise ErreurConfig(f"Section [{section}] absente de {chemin.name}")
    if not cfg.get("mini_jeux"):
        raise ErreurConfig("Aucun [[mini_jeux]] dans la configuration")
    if not cfg.get("objets"):
        raise ErreurConfig("Aucun [[objets]] dans la configuration")

    cases = cfg["plateau"]["cases"].split()
    inconnues = sorted(set(cases) - LETTRES_CASES)
    if inconnues:
        raise ErreurConfig(f"Cases inconnues dans [plateau] : {', '.join(inconnues)}")
    if not cases or cases[0] != "T":
        raise ErreurConfig("La première case du plateau doit être le Terminus (T)")
    if "R" not in cases:
        raise ErreurConfig("Le plateau doit avoir au moins une case Recharge (R) pour le Billet d'or")
    cfg["plateau"]["liste"] = cases

    p = cfg["partie"]
    if int(p["nb_tours"]) < 1:
        raise ErreurConfig("nb_tours doit être au moins 1")
    if not p.get("des_mini_jeu") or not p.get("gains_mini_jeu"):
        raise ErreurConfig("des_mini_jeu et gains_mini_jeu ne peuvent pas être vides")
    return cfg


def application() -> dict:
    app = lire()["application"]
    return {
        "hote": os.getenv("PARTY_HOTE") or app.get("hote", "127.0.0.1"),
        "port": int(os.getenv("PARTY_PORT") or app.get("port", 3510)),
    }
