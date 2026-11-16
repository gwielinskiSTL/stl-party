"""Règles du jeu (app/jeu.py), sans serveur."""
import random

import pytest

from app import jeu


def jouer_jusqu_a_la_fin(etat, graine=0):
    """Joue une partie complète avec des décisions au hasard ; renvoie le nombre d'actions."""
    h = random.Random(graine)
    actions = 0
    while etat["phase"] != "terminee":
        actions += 1
        assert actions < 2000, "la partie ne se termine pas"
        phase = etat["phase"]
        if phase == "mini_jeu":
            ordre = [e["id"] for e in etat["equipes"]]
            h.shuffle(ordre)
            jeu.resultat_mini_jeu(etat, ordre)
        elif phase == "deplacement":
            att = etat["attente"]
            if not att:
                jeu.lancer(etat)
            elif att["type"] == "billet":
                jeu.decider(etat, {"acheter": h.random() < .8})
            elif att["type"] == "boutique":
                eq = etat["equipes"][att["equipe"]]
                possibles = [o["id"] for o in etat["reglages"]["objets"] if o["prix"] <= eq["kwh"]]
                jeu.decider(etat, {"objet": h.choice(possibles + [None])})
            else:
                autres = [e for e in etat["equipes"] if e["id"] != att["equipe"]]
                if att["peut_voler_billet"]:
                    cible = h.choice([e for e in autres if e["billets"] > 0])
                    jeu.decider(etat, {"cible": cible["id"], "quoi": "billet"})
                else:
                    jeu.decider(etat, {"cible": h.choice(autres)["id"], "quoi": "kwh"})
        elif phase == "fin_tour":
            jeu.tour_suivant(etat)
        elif phase == "bonus":
            jeu.commencer_repartition(etat)
        elif phase == "repartition":
            libres = [i + 1 for i, p in enumerate(etat["repartition"]["positions"]) if p is None]
            jeu.choisir_position(etat, h.choice(libres))
        for e in etat["equipes"]:
            assert e["kwh"] >= 0 and e["billets"] >= 0
            assert len(e["objets"]) <= etat["reglages"]["partie"]["max_objets"]
            assert 0 <= e["position"] < len(etat["plateau"])
    return actions


def test_nouvelle_partie(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    assert etat["phase"] == "mini_jeu" and etat["tour"] == 1
    assert all(e["kwh"] == cfg["partie"]["kwh_depart"] and e["position"] == 0 for e in etat["equipes"])
    assert etat["plateau"][etat["position_billet"]] == "R"


@pytest.mark.parametrize("modif, message", [
    (lambda eq: eq[:1], "entre 2 et 8"),
    (lambda eq: [eq[0], dict(eq[0])], "même nom"),
    (lambda eq: [eq[0], {"nom": "Vide", "joueurs": ["", " "]}], "aucun joueur"),
    (lambda eq: [eq[0], {"nom": " ", "joueurs": ["A"]}], "un nom"),
])
def test_equipes_invalides(cfg, equipes, modif, message):
    with pytest.raises(jeu.ErreurJeu, match=message):
        jeu.nouvelle_partie(cfg, modif(equipes))


def test_mini_jeu_donne_des_et_kwh(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    jeu.resultat_mini_jeu(etat, [3, 1, 4, 0, 2])
    p = cfg["partie"]
    assert etat["phase"] == "deplacement" and etat["courant"] == 3
    assert etat["des"] == {str(i): p["des_mini_jeu"][r] for r, i in enumerate([3, 1, 4, 0, 2])}
    assert etat["equipes"][3]["kwh"] == p["kwh_depart"] + p["gains_mini_jeu"][0]
    with pytest.raises(jeu.ErreurJeu):
        jeu.lancer(jeu.nouvelle_partie(cfg, equipes))     # pas encore de mini-jeu


def test_classement_incomplet_refuse(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    with pytest.raises(jeu.ErreurJeu, match="chaque équipe"):
        jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 3])


def test_lancer_avance_du_total_des(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    etat["position_billet"] = None                     # pas d'interruption pour ce test
    etat["plateau"] = ["T"] + ["R"] * 31
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    anim = jeu.lancer(etat)
    assert len(anim["des"]) == cfg["partie"]["des_mini_jeu"][0]
    assert etat["equipes"][0]["position"] == anim["total"] % 32
    assert anim["chemin"][-1] == anim["total"] % 32
    assert etat["courant"] == 1


def test_billet_d_or_interrompt_et_s_achete(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    etat["plateau"] = ["T"] + ["R"] * 31
    etat["position_billet"] = 1                        # première case : toujours croisée
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])       # 1re équipe : 10 + 10 kWh = 20
    jeu.lancer(etat)
    att = etat["attente"]
    assert att["type"] == "billet" and att["equipe"] == 0
    kwh = etat["equipes"][0]["kwh"]
    jeu.decider(etat, {"acheter": True})
    eq = etat["equipes"][0]
    assert eq["billets"] == 1 and etat["position_billet"] != 1
    assert eq["kwh"] >= kwh - cfg["partie"]["prix_billet"]         # moins le prix, plus les recharges
    assert etat["attente"] is None and etat["courant"] == 1


def test_billet_trop_cher_ne_bloque_pas(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    etat["plateau"] = ["T"] + ["R"] * 31
    etat["position_billet"] = 1
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    etat["courant"] = 4                                # la dernière n'a que 10 kWh
    etat["file"] = [4]
    anim = jeu.lancer(etat)
    assert etat["attente"] is None
    assert any("Billet" in ev["titre"] for ev in anim["evenements"])


def test_depanneur(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    etat["plateau"] = ["T", "M"] + ["R"] * 30
    etat["position_billet"] = 5
    for e in etat["equipes"]:
        e["kwh"] = 0                                   # personne ne peut acheter le Billet
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    jeu.lancer(etat)
    assert etat["attente"]["type"] == "boutique"
    with pytest.raises(jeu.ErreurJeu, match="Pas assez"):
        jeu.decider(etat, {"objet": "bouclier"})
    jeu.decider(etat, {"objet": "retard"})
    assert etat["equipes"][0]["objets"] == [{"id": "retard", "utilise": False}]


def test_fantome_vole_un_billet(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    etat["equipes"][0]["kwh"] = 40
    etat["equipes"][2]["billets"] = 2
    etat["attente"] = {"type": "fantome", "equipe": 0, "prix_billet": 30, "peut_voler_billet": True}
    with pytest.raises(jeu.ErreurJeu, match="propre équipe"):
        jeu.decider(etat, {"cible": 0, "quoi": "kwh"})
    with pytest.raises(jeu.ErreurJeu, match="aucun Billet"):
        jeu.decider(etat, {"cible": 1, "quoi": "billet"})
    jeu.decider(etat, {"cible": 2, "quoi": "billet"})
    assert etat["equipes"][0]["billets"] == 1 and etat["equipes"][2]["billets"] == 1
    assert etat["equipes"][0]["kwh"] == 10 and etat["courant"] == 1


def test_inspecteur_prend_la_moitie(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    eq = etat["equipes"][0]
    eq["kwh"], etat["plateau"][eq["position"]] = 21, "I"
    jeu._atterrir(etat, eq, {"evenements": []})
    assert eq["kwh"] == 11 and eq["stats"]["malchances"] == 1


def test_dernier_tour_aide_la_derniere_equipe(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    etat["tour"] = etat["nb_tours"] - 1
    etat["phase"] = "fin_tour"
    etat["equipes"][3]["kwh"] = 0
    anim = jeu.tour_suivant(etat)
    assert etat["tour"] == etat["nb_tours"]
    assert etat["equipes"][3]["kwh"] == cfg["partie"]["bonus_dernier_tour"]
    assert anim["evenements"][0]["titre"] == "Dernier arrêt"


def test_repartition_a_tour_de_role(cfg, equipes):
    equipes[4]["joueurs"] = equipes[4]["joueurs"][:3]     # une équipe plus petite
    etat = jeu.nouvelle_partie(cfg, equipes)
    etat["phase"] = "bonus"
    etat["equipes"][2]["billets"] = 3
    jeu.commencer_repartition(etat)
    rep = etat["repartition"]
    assert len(rep["positions"]) == 23
    assert rep["tours"][0] == 2                            # la première au classement choisit d'abord
    assert rep["tours"].count(4) == 3
    jeu.choisir_position(etat, 23)
    with pytest.raises(jeu.ErreurJeu, match="déjà prise"):
        jeu.choisir_position(etat, 23)


@pytest.mark.parametrize("graine", range(30))
def test_parties_completes(cfg, equipes, graine):
    jeu.hasard.seed(graine)
    etat = jeu.nouvelle_partie(cfg, equipes)
    jouer_jusqu_a_la_fin(etat, graine)
    rep = etat["repartition"]["positions"]
    assert None not in rep and len(rep) == 25
    assert all(rep.count(e["id"]) == 5 for e in etat["equipes"])
    assert len(etat["bonus"]) == 3


def test_case_evenement_annoncee_en_grand(cfg, equipes):
    """Chaque carte Événement porte un code (illustration) et demande l'écran géant."""
    codes = set()
    for graine in range(60):
        jeu.hasard.seed(graine)
        etat = jeu.nouvelle_partie(cfg, equipes)
        jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
        eq = etat["equipes"][0]
        eq["position"] = 3
        etat["plateau"][3] = "E"
        anim = {"evenements": []}
        jeu._atterrir(etat, eq, anim)
        ev = anim["evenements"][0]
        assert ev["grand"] is True and ev["equipe"] == 0
        codes.add(ev["code"])
    assert codes == {"voie_reservee", "freinage", "borne_panne", "correspondance_ratee", "express", "prime",
                     "covoiturage", "tempete"}


def test_objets_ont_une_explication(cfg):
    assert all(o.get("explication") for o in cfg["objets"])


@pytest.mark.parametrize("graine", range(10))
def test_chaque_evenement_a_un_code(cfg, equipes, graine):
    """Chaque événement envoyé à l'interface a un code : sa page de garde et son illustration en dépendent."""
    jeu.hasard.seed(graine)
    etat = jeu.nouvelle_partie(cfg, equipes)
    h = random.Random(graine)
    while etat["phase"] not in ("bonus", "terminee"):
        if etat["phase"] == "mini_jeu":
            anim = jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
        elif etat["phase"] == "fin_tour":
            anim = jeu.tour_suivant(etat)
        elif not etat["attente"]:
            anim = jeu.lancer(etat)
        else:
            att = etat["attente"]
            if att["type"] == "billet":
                anim = jeu.decider(etat, {"acheter": True})
            elif att["type"] == "boutique":
                q = etat["equipes"][att["equipe"]]
                ok = [o["id"] for o in etat["reglages"]["objets"] if o["prix"] <= q["kwh"]]
                anim = jeu.decider(etat, {"objet": ok[0] if ok else None})
            else:
                autres = [e["id"] for e in etat["equipes"] if e["id"] != att["equipe"]]
                anim = jeu.decider(etat, {"cible": h.choice(autres), "quoi": "kwh"})
        for ev in anim.get("evenements", []):
            assert ev.get("code"), ev


def test_evenements_dates_sur_le_trajet(cfg, equipes):
    """Un achat en route est annoncé tout de suite (étape 0), le passage au Terminus à sa case, l'arrivée à la fin."""
    etat = jeu.nouvelle_partie(cfg, equipes)
    etat["plateau"] = ["T", "M"] + ["R"] * 30
    etat["position_billet"] = 20
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    eq = etat["equipes"][0]
    eq["position"], eq["kwh"] = 28, 50
    jeu.lancer(etat)                                   # 3 dés : passe le Terminus (case 0), s'arrête au dépanneur (1)
    assert etat["attente"]["type"] == "boutique"
    reste = etat["attente"]["reste"]
    anim = jeu.decider(etat, {"objet": "retard"})
    achat = anim["evenements"][0]
    assert achat["code"] == "achat" and achat["etape"] == 0
    arrivee = anim["evenements"][-1]
    assert arrivee["code"] == "recharge" and arrivee["etape"] == len(anim["chemin"]) == reste


def test_terminus_annonce_a_sa_case(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes)
    etat["plateau"] = ["T"] + ["R"] * 31
    etat["position_billet"] = 20
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    etat["equipes"][0]["position"] = 30
    anim = jeu.lancer(etat)
    terminus = next(ev for ev in anim["evenements"] if ev["code"] == "terminus")
    assert anim["chemin"][terminus["etape"] - 1] == 0
