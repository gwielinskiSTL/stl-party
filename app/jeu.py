"""
Moteur de STL Party : toutes les règles du jeu, sans interface.

L'état de la partie est un simple dictionnaire (enregistré en JSON). Chaque action prend l'état, le modifie
et renvoie une « animation » que l'interface rejoue : dés, cases parcourues, événements à annoncer.

Phases :
    mini_jeu      on joue le mini-jeu du tour, puis on saisit le classement des équipes
    deplacement   chaque équipe, dans l'ordre du mini-jeu, lance ses dés et avance
    fin_tour      tout le monde a joué ; on passe au tour suivant (ou aux bonus)
    bonus         étoiles bonus et classement final
    repartition   les équipes choisissent leurs positions dans l'échange, à tour de rôle
    terminee      ordre de l'échange et objets à utiliser
"""
from __future__ import annotations

import copy
import random
from datetime import datetime

hasard = random.Random()

NOMS_CASES = {
    "T": "Terminus", "R": "Recharge", "B": "Bouchon", "E": "Événement", "I": "Inspecteur",
    "F": "Fantôme du garage", "D": "Détour", "M": "Dépanneur",
}


class ErreurJeu(Exception):
    def __init__(self, message: str, code: int = 400):
        super().__init__(message)
        self.code = code


# ===================================================================================== création
def nouvelle_partie(cfg: dict, equipes: list[dict]) -> dict:
    """equipes : [{"nom": str, "joueurs": [str, ...]}, ...]"""
    if not 2 <= len(equipes) <= 8:
        raise ErreurJeu("Il faut entre 2 et 8 équipes.")
    noms = [str(e.get("nom") or "").strip() for e in equipes]
    if any(not n for n in noms):
        raise ErreurJeu("Chaque équipe doit avoir un nom.")
    if len(set(n.lower() for n in noms)) != len(noms):
        raise ErreurJeu("Deux équipes ont le même nom.")
    p = cfg["partie"]
    liste = []
    for i, (e, nom) in enumerate(zip(equipes, noms)):
        joueurs = [str(j).strip() for j in e.get("joueurs") or [] if str(j).strip()]
        if not joueurs:
            raise ErreurJeu(f"L'équipe « {nom} » n'a aucun joueur.")
        liste.append({
            "id": i, "nom": nom, "joueurs": joueurs, "position": 0,
            "kwh": int(p["kwh_depart"]), "billets": 0, "objets": [],
            "stats": {"cases": 0, "kwh_gagnes": 0, "malchances": 0, "rangs": []},
        })
    cases = cfg["plateau"]["liste"]
    etat = {
        "version": 1,
        "cree_le": datetime.now().isoformat(timespec="seconds"),
        "reglages": {
            "partie": copy.deepcopy(p), "cases": copy.deepcopy(cfg["cases"]),
            "mini_jeux": copy.deepcopy(cfg["mini_jeux"]), "objets": copy.deepcopy(cfg["objets"]),
        },
        "plateau": cases,
        "nb_tours": int(p["nb_tours"]),
        "tour": 1,
        "phase": "mini_jeu",
        "equipes": liste,
        "position_billet": None,
        "file": [], "des": {}, "courant": None, "attente": None,
        "bonus": [], "repartition": None,
        "journal": [],
    }
    _placer_billet(etat)
    _noter(etat, "La partie commence ! Tout le monde part du Terminus.")
    return etat


# ===================================================================================== outils
def _eq(etat: dict, ident) -> dict:
    try:
        return etat["equipes"][int(ident)]
    except (ValueError, TypeError, IndexError):
        raise ErreurJeu(f"Équipe inconnue : {ident}")


def _noter(etat: dict, texte: str):
    etat["journal"].append({"tour": etat["tour"], "texte": texte})
    del etat["journal"][:-200]


def _gagner(etat: dict, eq: dict, kwh: int) -> int:
    """Ajoute (ou retire) des kWh sans descendre sous zéro. Renvoie la variation réelle."""
    avant = eq["kwh"]
    eq["kwh"] = max(0, avant + int(kwh))
    delta = eq["kwh"] - avant
    if delta > 0:
        eq["stats"]["kwh_gagnes"] += delta
    return delta


def _placer_billet(etat: dict):
    """Le Billet d'or va sur une case Recharge au hasard, loin de son ancienne place et des équipes si possible."""
    recharges = [i for i, c in enumerate(etat["plateau"]) if c == "R"]
    occupees = {e["position"] for e in etat["equipes"]}
    ancien = etat.get("position_billet")
    choix = [i for i in recharges if i != ancien and i not in occupees] or [i for i in recharges if i != ancien] \
        or recharges
    etat["position_billet"] = hasard.choice(choix)


def _objet(etat: dict, ident: str) -> dict:
    for o in etat["reglages"]["objets"]:
        if o["id"] == ident:
            return o
    raise ErreurJeu(f"Objet inconnu : {ident}")


def peut_magasiner(etat: dict, eq: dict) -> bool:
    if len(eq["objets"]) >= int(etat["reglages"]["partie"]["max_objets"]):
        return False
    return any(eq["kwh"] >= int(o["prix"]) for o in etat["reglages"]["objets"])


def classement(etat: dict) -> list[dict]:
    """Billets d'or, puis kWh, puis meilleure somme des rangs aux mini-jeux."""
    return sorted(etat["equipes"], key=lambda e: (-e["billets"], -e["kwh"], sum(e["stats"]["rangs"]) or 99, e["id"]))


def mini_jeu_du_tour(etat: dict) -> dict:
    jeux = etat["reglages"]["mini_jeux"]
    jeu = jeux[(etat["tour"] - 1) % len(jeux)]
    joueurs = {}
    for e in etat["equipes"]:
        joueurs[e["id"]] = "Toute l'équipe" if jeu.get("toute_equipe") else e["joueurs"][(etat["tour"] - 1) % len(e["joueurs"])]
    return {**jeu, "joueurs": joueurs}


def _verifier_phase(etat: dict, *phases: str):
    if etat["phase"] not in phases:
        raise ErreurJeu(f"Action impossible pendant la phase « {etat['phase']} ».", 409)


# ===================================================================================== mini-jeu
def resultat_mini_jeu(etat: dict, ordre: list) -> dict:
    """ordre : identifiants des équipes, de la première à la dernière."""
    _verifier_phase(etat, "mini_jeu")
    try:
        ordre = [int(i) for i in ordre]
    except (TypeError, ValueError):
        raise ErreurJeu("Classement invalide.")
    if sorted(ordre) != [e["id"] for e in etat["equipes"]]:
        raise ErreurJeu("Le classement doit contenir chaque équipe une seule fois.")
    p = etat["reglages"]["partie"]
    gains, des = p["gains_mini_jeu"], p["des_mini_jeu"]
    jeu = mini_jeu_du_tour(etat)
    annonces = []
    etat["des"] = {}
    for rang, ident in enumerate(ordre):
        eq = _eq(etat, ident)
        kwh = int(gains[min(rang, len(gains) - 1)])
        nb = int(des[min(rang, len(des) - 1)])
        _gagner(etat, eq, kwh)
        eq["stats"]["rangs"].append(rang + 1)
        etat["des"][str(ident)] = nb
        annonces.append({"equipe": ident, "rang": rang + 1, "kwh": kwh, "des": nb})
    _noter(etat, f"Mini-jeu « {jeu['nom']} » : {_eq(etat, ordre[0])['nom']} gagne.")
    etat["file"] = ordre
    etat["courant"] = ordre[0]
    etat["phase"] = "deplacement"
    return {"type": "mini_jeu", "classement": annonces}


# ===================================================================================== déplacement
def lancer(etat: dict) -> dict:
    _verifier_phase(etat, "deplacement")
    if etat["attente"]:
        raise ErreurJeu("Une décision est attendue avant de lancer les dés.", 409)
    eq = _eq(etat, etat["courant"])
    nb = int(etat["des"].get(str(eq["id"]), 1))
    des = [hasard.randint(1, 6) for _ in range(nb)]
    total = sum(des)
    _noter(etat, f"{eq['nom']} lance {nb} dé{'s' if nb > 1 else ''} : {' + '.join(map(str, des))} = {total}.")
    anim = {"type": "deplacement", "equipe": eq["id"], "des": des, "total": total, "chemin": [], "evenements": []}
    _avancer(etat, eq, total, anim)
    return anim


def _avancer(etat: dict, eq: dict, pas: int, anim: dict):
    """Avance pas à pas. S'arrête en route si une décision est nécessaire (Billet d'or, Dépanneur)."""
    n = len(etat["plateau"])
    reglages = etat["reglages"]
    while pas > 0:
        eq["position"] = (eq["position"] + 1) % n
        pas -= 1
        eq["stats"]["cases"] += 1
        anim["chemin"].append(eq["position"])
        case = etat["plateau"][eq["position"]]

        if case == "T":
            gain = _gagner(etat, eq, reglages["cases"]["terminus"])
            anim["evenements"].append({"titre": "Plein au garage !", "texte": f"{eq['nom']} passe au Terminus : +{gain} kWh.",
                                       "ton": "bon"})

        if eq["position"] == etat["position_billet"]:
            prix = int(reglages["partie"]["prix_billet"])
            if eq["kwh"] >= prix:
                etat["attente"] = {"type": "billet", "equipe": eq["id"], "reste": pas, "prix": prix}
                return
            anim["evenements"].append({"titre": "Billet d'or", "texte": f"{eq['nom']} n'a pas les {prix} kWh pour acheter le Billet d'or.",
                                       "ton": "neutre"})

        if case == "M":
            if peut_magasiner(etat, eq):
                etat["attente"] = {"type": "boutique", "equipe": eq["id"], "reste": pas}
                return
            anim["evenements"].append({"titre": "Dépanneur", "texte": f"{eq['nom']} passe au dépanneur sans pouvoir rien acheter.",
                                       "ton": "neutre"})
    _atterrir(etat, eq, anim)


def _atterrir(etat: dict, eq: dict, anim: dict):
    case = etat["plateau"][eq["position"]]
    r = etat["reglages"]["cases"]
    ev = anim["evenements"]
    nom = eq["nom"]

    if case == "R":
        gain = _gagner(etat, eq, r["recharge"])
        ev.append({"titre": "Recharge", "texte": f"{nom} se branche : +{gain} kWh.", "ton": "bon"})
    elif case == "B":
        perte = -_gagner(etat, eq, -int(r["bouchon"]))
        eq["stats"]["malchances"] += 1
        ev.append({"titre": "Bouchon de circulation", "texte": f"{nom} est pris dans le trafic : −{perte} kWh.", "ton": "mauvais"})
    elif case == "I":
        perte = eq["kwh"] // 2
        _gagner(etat, eq, -perte)
        eq["stats"]["malchances"] += 1
        ev.append({"titre": "L'inspecteur des titres !", "texte": f"Contravention : {nom} perd la moitié de ses kWh (−{perte} kWh).",
                   "ton": "mauvais"})
    elif case == "E":
        # « grand » : l'interface l'annonce en plein écran et attend « Continuer »
        ev.append({**_evenement(etat, eq), "grand": True, "equipe": eq["id"]})
    elif case == "D":
        ev.append(_detour(etat))
    elif case == "F":
        autres = [e for e in etat["equipes"] if e["id"] != eq["id"]]
        prix = int(etat["reglages"]["partie"]["prix_vol_billet"])
        etat["attente"] = {
            "type": "fantome", "equipe": eq["id"], "prix_billet": prix,
            "peut_voler_billet": eq["kwh"] >= prix and any(e["billets"] > 0 for e in autres),
        }
        ev.append({"titre": "Le fantôme du garage", "texte": f"{nom} réveille le fantôme… À qui va-t-il rendre visite ?",
                   "ton": "neutre"})
        return
    _noter(etat, f"{nom} arrive sur la case {NOMS_CASES[case]}.")
    _equipe_suivante(etat)


def _evenement(etat: dict, eq: dict) -> dict:
    nom = eq["nom"]
    n = len(etat["plateau"])
    tirage = hasard.randrange(8)
    if tirage == 0:
        g = _gagner(etat, eq, 5)
        return {"code": "voie_reservee", "titre": "Voie réservée", "texte": f"{nom} file dans la voie réservée : +{g} kWh.", "ton": "bon"}
    if tirage == 1:
        nb = int(etat["des"].get(str(eq["id"]), 1))
        g = _gagner(etat, eq, 2 * nb)
        return {"code": "freinage", "titre": "Freinage régénératif", "texte": f"{nom} récupère 2 kWh par dé lancé : +{g} kWh.", "ton": "bon"}
    if tirage == 2:
        p = -_gagner(etat, eq, -5)
        eq["stats"]["malchances"] += 1
        return {"code": "borne_panne", "titre": "Borne en panne", "texte": f"La borne refuse de charger : {nom} perd {p} kWh.", "ton": "mauvais"}
    if tirage == 3:
        eq["position"] = (eq["position"] - 3) % n
        eq["stats"]["malchances"] += 1
        return {"code": "correspondance_ratee", "titre": "Correspondance ratée", "texte": f"{nom} recule de 3 arrêts.", "ton": "mauvais", "saut": eq["position"]}
    if tirage == 4:
        eq["position"] = (eq["position"] + 3) % n
        eq["stats"]["cases"] += 3
        return {"code": "express", "titre": "Service express", "texte": f"{nom} saute 3 arrêts.", "ton": "bon", "saut": eq["position"]}
    if tirage == 5:
        if len(eq["objets"]) < int(etat["reglages"]["partie"]["max_objets"]):
            o = hasard.choice(etat["reglages"]["objets"])
            eq["objets"].append({"id": o["id"], "utilise": False})
            return {"code": "prime", "titre": "Prime de ponctualité", "texte": f"{nom} reçoit un objet gratuit : {o['nom']} !", "ton": "bon",
                    "objet": o["id"]}
        g = _gagner(etat, eq, 5)
        return {"code": "prime", "titre": "Prime de ponctualité", "texte": f"Sac plein ! {nom} reçoit +{g} kWh à la place.", "ton": "bon"}
    if tirage == 6:
        for e in etat["equipes"]:
            _gagner(etat, e, 2)
        return {"code": "covoiturage", "titre": "Covoiturage", "texte": "Tout le monde partage la route : +2 kWh pour chaque équipe.", "ton": "bon"}
    for e in etat["equipes"]:
        _gagner(etat, e, -2)
    return {"code": "tempete", "titre": "Tempête de neige", "texte": "Le chauffage tourne à fond : −2 kWh pour chaque équipe.", "ton": "mauvais"}


def _detour(etat: dict) -> dict:
    a, b = hasard.sample(etat["equipes"], 2)
    quoi = hasard.choice(["kwh", "billets", "position"])
    if quoi == "kwh":
        a["kwh"], b["kwh"] = b["kwh"], a["kwh"]
        texte = f"{a['nom']} et {b['nom']} échangent leurs kWh !"
    elif quoi == "billets":
        a["billets"], b["billets"] = b["billets"], a["billets"]
        texte = f"{a['nom']} et {b['nom']} échangent leurs Billets d'or !"
    else:
        a["position"], b["position"] = b["position"], a["position"]
        texte = f"{a['nom']} et {b['nom']} échangent leurs places sur le réseau !"
    _noter(etat, f"Détour : {texte}")
    return {"titre": "Détour !", "texte": texte, "ton": "neutre", "echange": [a["id"], b["id"], quoi]}


def decider(etat: dict, decision: dict) -> dict:
    """Répond à la décision attendue (Billet d'or, Dépanneur, Fantôme), puis poursuit le déplacement."""
    _verifier_phase(etat, "deplacement")
    att = etat["attente"]
    if not att:
        raise ErreurJeu("Aucune décision n'est attendue.", 409)
    eq = _eq(etat, att["equipe"])
    anim = {"type": "deplacement", "equipe": eq["id"], "des": [], "total": 0, "chemin": [], "evenements": []}

    if att["type"] == "billet":
        if decision.get("acheter"):
            _gagner(etat, eq, -att["prix"])
            eq["billets"] += 1
            _placer_billet(etat)
            anim["evenements"].append({"titre": "Billet d'or !", "texte": f"{eq['nom']} achète un Billet d'or. Il se déplace ailleurs sur le réseau.",
                                       "ton": "bon", "billet": True})
            _noter(etat, f"{eq['nom']} achète un Billet d'or.")
        else:
            _noter(etat, f"{eq['nom']} laisse passer le Billet d'or.")
        etat["attente"] = None
        _continuer(etat, eq, att["reste"], anim)   # le Billet est toujours sur une Recharge

    elif att["type"] == "boutique":
        ident = decision.get("objet")
        if ident:
            o = _objet(etat, ident)
            if len(eq["objets"]) >= int(etat["reglages"]["partie"]["max_objets"]):
                raise ErreurJeu("Cette équipe a déjà le nombre maximal d'objets.")
            if eq["kwh"] < int(o["prix"]):
                raise ErreurJeu(f"Pas assez de kWh pour {o['nom']} ({o['prix']} kWh).")
            _gagner(etat, eq, -int(o["prix"]))
            eq["objets"].append({"id": o["id"], "utilise": False})
            anim["evenements"].append({"titre": "Dépanneur", "texte": f"{eq['nom']} achète : {o['nom']}.", "ton": "bon"})
            _noter(etat, f"{eq['nom']} achète {o['nom']} au dépanneur.")
        etat["attente"] = None
        _continuer(etat, eq, att["reste"], anim)

    elif att["type"] == "fantome":
        quoi = decision.get("quoi", "kwh")
        if quoi not in ("kwh", "billet"):
            raise ErreurJeu("Choix du fantôme invalide.")
        cible = _eq(etat, decision.get("cible"))
        if cible["id"] == eq["id"]:
            raise ErreurJeu("Le fantôme ne peut pas voler sa propre équipe.")
        if quoi == "billet":
            if eq["kwh"] < att["prix_billet"]:
                raise ErreurJeu(f"Il faut {att['prix_billet']} kWh pour voler un Billet d'or.")
            if cible["billets"] < 1:
                raise ErreurJeu(f"{cible['nom']} n'a aucun Billet d'or.")
            _gagner(etat, eq, -att["prix_billet"])
            cible["billets"] -= 1
            eq["billets"] += 1
            texte = f"Le fantôme vole un Billet d'or à {cible['nom']} pour {eq['nom']} !"
        else:
            montant = min(cible["kwh"], 2 * hasard.randint(2, 6))
            _gagner(etat, cible, -montant)
            _gagner(etat, eq, montant)
            texte = f"Le fantôme vole {montant} kWh à {cible['nom']} pour {eq['nom']}."
        anim["evenements"].append({"titre": "Le fantôme du garage", "texte": texte, "ton": "neutre"})
        _noter(etat, texte)
        etat["attente"] = None
        _equipe_suivante(etat)
    return anim


def _continuer(etat: dict, eq: dict, reste: int, anim: dict):
    if reste > 0:
        _avancer(etat, eq, reste, anim)
    else:
        _atterrir(etat, eq, anim)


def _equipe_suivante(etat: dict):
    file = etat["file"]
    i = file.index(etat["courant"])
    if i + 1 < len(file):
        etat["courant"] = file[i + 1]
    else:
        etat["courant"] = None
        etat["phase"] = "fin_tour"


# ===================================================================================== fin de tour et bonus
def tour_suivant(etat: dict) -> dict:
    _verifier_phase(etat, "fin_tour")
    etat["file"], etat["des"] = [], {}
    if etat["tour"] >= etat["nb_tours"]:
        return _calculer_bonus(etat)
    etat["tour"] += 1
    etat["phase"] = "mini_jeu"
    anim = {"type": "tour", "tour": etat["tour"], "evenements": []}
    if etat["tour"] == etat["nb_tours"]:
        dernier = classement(etat)[-1]
        bonus = int(etat["reglages"]["partie"]["bonus_dernier_tour"])
        _gagner(etat, dernier, bonus)
        texte = f"Dernier tour ! {dernier['nom']}, en queue de peloton, reçoit +{bonus} kWh pour une dernière chance."
        anim["evenements"].append({"titre": "Dernier arrêt", "texte": texte, "ton": "bon"})
        _noter(etat, texte)
    return anim


BONUS = [
    ("Grand voyageur", "le plus d'arrêts parcourus", lambda e: e["stats"]["cases"]),
    ("Pleine charge", "le plus de kWh gagnés", lambda e: e["stats"]["kwh_gagnes"]),
    ("Pas de chance", "le plus de bouchons, contraventions et malchances", lambda e: e["stats"]["malchances"]),
]


def _calculer_bonus(etat: dict) -> dict:
    etat["bonus"] = []
    for titre, critere, mesure in BONUS:
        meilleur = max(mesure(e) for e in etat["equipes"])
        gagnants = [e for e in etat["equipes"] if mesure(e) == meilleur] if meilleur > 0 else []
        for e in gagnants:
            e["billets"] += 1
        etat["bonus"].append({"titre": titre, "critere": critere, "valeur": meilleur, "equipes": [e["id"] for e in gagnants]})
        if gagnants:
            _noter(etat, f"Bonus « {titre} » : {', '.join(e['nom'] for e in gagnants)} (+1 Billet d'or).")
    etat["phase"] = "bonus"
    return {"type": "bonus", "evenements": []}


# ===================================================================================== répartition des positions
def commencer_repartition(etat: dict) -> dict:
    """Les équipes choisissent leurs positions à tour de rôle, dans l'ordre du classement final."""
    _verifier_phase(etat, "bonus")
    ordre_equipes = [e["id"] for e in classement(etat)]
    restants = {e["id"]: len(e["joueurs"]) for e in etat["equipes"]}
    tours = []
    while any(restants.values()):
        for i in ordre_equipes:
            if restants[i]:
                tours.append(i)
                restants[i] -= 1
    etat["repartition"] = {"classement": ordre_equipes, "tours": tours, "indice": 0,
                           "positions": [None] * len(tours)}
    etat["phase"] = "repartition"
    _noter(etat, "Répartition des positions de l'échange : le premier au classement choisit en premier.")
    return {"type": "repartition", "evenements": []}


def choisir_position(etat: dict, position: int) -> dict:
    _verifier_phase(etat, "repartition")
    rep = etat["repartition"]
    try:
        position = int(position)
    except (TypeError, ValueError):
        raise ErreurJeu("Position invalide.")
    if not 1 <= position <= len(rep["positions"]):
        raise ErreurJeu(f"La position doit être entre 1 et {len(rep['positions'])}.")
    if rep["positions"][position - 1] is not None:
        raise ErreurJeu(f"La position {position} est déjà prise.")
    ident = rep["tours"][rep["indice"]]
    rep["positions"][position - 1] = ident
    rep["indice"] += 1
    _noter(etat, f"{_eq(etat, ident)['nom']} prend la position {position}.")
    if rep["indice"] >= len(rep["tours"]):
        etat["phase"] = "terminee"
        _noter(etat, "Toutes les positions sont choisies. Place à l'échange !")
    return {"type": "repartition", "evenements": []}


# ===================================================================================== corrections de l'animateur
def ajuster(etat: dict, ident, kwh: int = 0, billets: int = 0) -> dict:
    eq = _eq(etat, ident)
    try:
        kwh, billets = int(kwh or 0), int(billets or 0)
    except (TypeError, ValueError):
        raise ErreurJeu("Ajustement invalide.")
    eq["kwh"] = max(0, eq["kwh"] + kwh)
    eq["billets"] = max(0, eq["billets"] + billets)
    _noter(etat, f"Correction de l'animateur pour {eq['nom']} : {kwh:+d} kWh, {billets:+d} Billet(s).")
    return {"type": "ajustement", "evenements": []}


def basculer_objet(etat: dict, ident, indice: int) -> dict:
    eq = _eq(etat, ident)
    try:
        objet = eq["objets"][int(indice)]
    except (TypeError, ValueError, IndexError):
        raise ErreurJeu("Objet introuvable.")
    objet["utilise"] = not objet["utilise"]
    nom = _objet(etat, objet["id"])["nom"]
    _noter(etat, f"{eq['nom']} {'utilise' if objet['utilise'] else 'récupère'} : {nom}.")
    return {"type": "objet", "evenements": []}
