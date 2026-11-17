"""
Cartes (plateaux) de STL Party. Une carte est un graphe orienté de cases :

    {"id", "nom", "description", "scene": {gauche, droite, haut, bas en %},
     "noeuds": [{"type": "R", "x": .., "y": .., "suivants": [i, ...], "options": [...]}]}

Coordonnées dans un repère de 1000 × 620 (celui du SVG). Une case avec plusieurs suivants est un embranchement :
l'équipe qui y passe choisit sa route. « options » décrit chaque route (à gauche / à droite / tout droit, nom,
aperçu des prochaines cases) pour l'interface.
La case 0 est toujours le Terminus (départ). La « scène » est la zone libre où l'interface affiche ses messages.
"""
from __future__ import annotations

X0, Y0, X1, Y1 = 50, 50, 950, 570


def _perimetre(n: int) -> list[tuple[float, float]]:
    """n points répartis sur le rectangle, dans le sens horaire depuis le coin haut gauche."""
    largeur, hauteur = X1 - X0, Y1 - Y0
    per = 2 * (largeur + hauteur)
    points = []
    for i in range(n):
        d = i * per / n
        if d < largeur:
            points.append((X0 + d, Y0))
        elif (d := d - largeur) < hauteur:
            points.append((X1, Y0 + d))
        elif (d := d - hauteur) < largeur:
            points.append((X1 - d, Y1))
        else:
            points.append((X0, Y1 - (d - largeur)))
    return points


def _rectangle_regulier() -> list[tuple[float, float]]:
    """28 cases : côtés haut et bas tous les 100 px (x = 50, 150, … 950), côtés gauche et droit à 4 cases.
    Indices : haut 0-9 (x = 50 + 100 k), droite 10-13, coin bas droit 14, bas 15-23 (x = 850 → 50), gauche 24-27."""
    pts = [(50 + 100 * k, 50) for k in range(10)]
    pts += [(950, y) for y in (154, 258, 362, 466)]
    pts += [(950, 570)]
    pts += [(850 - 100 * k, 570) for k in range(9)]
    pts += [(50, y) for y in (466, 362, 258, 154)]
    return pts


def _cote_bas(x: int) -> int:
    return 15 + (850 - x) // 100


def _boucle(types: list[str], points: list[tuple[float, float]]) -> list[dict]:
    n = len(types)
    return [{"type": t, "x": round(x, 1), "y": round(y, 1), "suivants": [(i + 1) % n]}
            for i, (t, (x, y)) in enumerate(zip(types, points))]


def _sens(noeuds: list[dict], avant: int, ici: int, apres: int) -> str:
    """Sens du virage vu par l'autobus (axe des y vers le bas) : produit vectoriel > 0 → à droite."""
    ax, ay = noeuds[ici]["x"] - noeuds[avant]["x"], noeuds[ici]["y"] - noeuds[avant]["y"]
    bx, by = noeuds[apres]["x"] - noeuds[ici]["x"], noeuds[apres]["y"] - noeuds[ici]["y"]
    croix = ax * by - ay * bx
    norme = max(1e-9, (ax * ax + ay * ay) ** 0.5 * (bx * bx + by * by) ** 0.5)
    if abs(croix) / norme < 0.3:
        return "tout droit"
    return "à droite" if croix > 0 else "à gauche"


def _completer_options(noeuds: list[dict], noms: dict[tuple[int, int], str]):
    """Ajoute à chaque embranchement la description de ses routes (sens, nom, aperçu des 5 cases suivantes)."""
    precedents: dict[int, list[int]] = {}
    for i, n in enumerate(noeuds):
        for s in n["suivants"]:
            precedents.setdefault(s, []).append(i)
    for i, n in enumerate(noeuds):
        if len(n["suivants"]) < 2:
            continue
        avant = precedents[i][0]
        options = []
        for s in n["suivants"]:
            apercu, j = [], s
            for _ in range(5):
                apercu.append(noeuds[j]["type"])
                j = noeuds[j]["suivants"][0]
            options.append({"vers": s, "sens": _sens(noeuds, avant, i, s), "nom": noms.get((i, s), ""), "apercu": apercu})
        n["options"] = options


# ===================================================================================== les cartes
def classique(cases: list[str]) -> dict:
    return {
        "id": "classique", "nom": "La boucle",
        "description": "Une seule ligne qui fait le tour du réseau. Simple et efficace.",
        "scene": {"gauche": 14, "droite": 14, "haut": 20, "bas": 20},
        "noeuds": _boucle(cases, _perimetre(len(cases))),
    }


def express() -> dict:
    """Un embranchement : la ligne locale (longue, riche en recharges et en achats) ou l'express (court, risqué)."""
    types = list("TRERRMRERBRDRFREMBRERIRERBRR")          # 28 cases du rectangle
    noeuds = _boucle(types, _rectangle_regulier())
    # express : de la case du haut x = 350 (indice 3) jusqu'à la case du bas x = 350
    depart, arrivee = 3, _cote_bas(350)
    chemin = [(350, y) for y in (154, 258, 362, 466)]
    debut = len(noeuds)
    for k, ((x, y), t) in enumerate(zip(chemin, "IRBE")):
        noeuds.append({"type": t, "x": x, "y": y, "suivants": [debut + k + 1 if k < len(chemin) - 1 else arrivee]})
    noeuds[depart]["suivants"] = [depart + 1, debut]
    _completer_options(noeuds, {(depart, depart + 1): "Ligne locale", (depart, debut): "Express"})
    return {
        "id": "express", "nom": "Express ou local",
        "description": "Un embranchement : la ligne locale fait tout le tour (recharges, dépanneurs), l'express coupe "
                       "au plus court… en passant devant l'inspecteur.",
        "scene": {"gauche": 40, "droite": 8, "haut": 19, "bas": 19},
        "noeuds": noeuds,
    }


def grand_reseau() -> dict:
    """Deux embranchements : un raccourci vers le bas à gauche, une petite boucle à droite."""
    types = list("TRRERMBRERIRDRFRERBMRERIRERB")
    noeuds = _boucle(types, _rectangle_regulier())
    # raccourci ouest : du haut x = 250 (indice 2) au bas x = 250
    j1, fin1 = 2, _cote_bas(250)
    d1 = len(noeuds)
    for k, ((x, y), t) in enumerate(zip([(250, y) for y in (154, 258, 362, 466)], "BRIE")):
        noeuds.append({"type": t, "x": x, "y": y, "suivants": [d1 + k + 1 if k < 3 else fin1]})
    noeuds[j1]["suivants"] = [j1 + 1, d1]
    # boucle est : du bas x = 750 (indice 16), on remonte jusqu'au haut x = 750 (indice 7)
    j2, fin2 = _cote_bas(750), 7
    d2 = len(noeuds)
    for k, ((x, y), t) in enumerate(zip([(750, y) for y in (466, 362, 258, 154)], "RMFR")):
        noeuds.append({"type": t, "x": x, "y": y, "suivants": [d2 + k + 1 if k < 3 else fin2]})
    noeuds[j2]["suivants"] = [j2 + 1, d2]
    _completer_options(noeuds, {
        (j1, j1 + 1): "Ligne principale", (j1, d1): "Raccourci de l'ouest",
        (j2, j2 + 1): "Retour au Terminus", (j2, d2): "Boucle de l'est",
    })
    return {
        "id": "grand_reseau", "nom": "Le grand réseau",
        "description": "Deux embranchements : un raccourci à l'ouest, et une boucle à l'est où l'on peut tourner "
                       "plusieurs fois autour du Billet d'or.",
        "scene": {"gauche": 29, "droite": 29, "haut": 19, "bas": 19},
        "noeuds": noeuds,
    }


def toutes(cases_classique: list[str]) -> list[dict]:
    return [classique(cases_classique), express(), grand_reseau()]


def par_id(ident: str, cases_classique: list[str]) -> dict:
    for c in toutes(cases_classique):
        if c["id"] == ident:
            return c
    raise KeyError(ident)
