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
                eq = etat["equipes"][etat["courant"]]
                jeux = [k for k, o in enumerate(eq["objets"]) if jeu.usage(jeu._objet(etat, o["id"])) == "jeu"]
                if jeux and h.random() < .5:
                    autre = h.choice([e["id"] for e in etat["equipes"] if e["id"] != eq["id"]])
                    try:
                        jeu.utiliser_objet(etat, jeux[0], autre)
                    except jeu.ErreurJeu as err:          # chantier refusé (Terminus, cône déjà là)
                        assert "chantier" in str(err).lower()
                jeu.lancer(etat)
            elif att["type"] == "embranchement":
                jeu.decider(etat, {"vers": h.choice(att["options"])["vers"]})
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
            jeu.tirer_pige(etat)
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


@pytest.mark.parametrize("graine", range(30))
def test_parties_completes(cfg, equipes, graine):
    jeu.hasard.seed(graine)
    carte = ["classique", "express", "grand_reseau"][graine % 3]
    etat = jeu.nouvelle_partie(cfg, equipes, {"carte": carte})
    jouer_jusqu_a_la_fin(etat, graine)
    lignes = etat["pige"]["lignes"]
    assert [l["ordre"] for l in lignes] == list(range(1, 26))
    assert sorted(l["rang"] for l in lignes) == list(range(1, 26))
    assert sorted((l["equipe"], l["joueur"]) for l in lignes) == sorted((e["id"], j) for e in etat["equipes"] for j in e["joueurs"])
    assert len(etat["bonus"]) == 3
    for a in etat["pige"]["objets"]:                       # chaque objet va à un membre de son équipe
        assert a["joueur"] in etat["equipes"][a["equipe"]]["joueurs"]
    for e in etat["equipes"]:                              # seuls les objets d'échange sont distribués
        echange = [k for k, o in enumerate(e["objets"]) if jeu.usage(jeu._objet(etat, o["id"])) == "echange"]
        assert sorted(a["indice"] for a in etat["pige"]["objets"] if a["equipe"] == e["id"]) == echange


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
    """Un achat en route n'a pas de page de garde ; l'arrivée est annoncée à la fin du trajet."""
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
    assert not any(ev["code"] == "achat" for ev in anim["evenements"])     # pas de page de garde après un achat
    assert etat["equipes"][0]["objets"] == [{"id": "retard", "utilise": False}]
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



# ------------------------------------------------------------------------------ équipes au hasard
def test_repartir_equipes_equilibrees():
    personnes = [f"Personne {k}" for k in range(23)] + ["personne 3", "  ", "Personne   4"]   # doublons et vide
    equipes = jeu.repartir_equipes(personnes, 5)
    tous = [p for e in equipes for p in e]
    assert len(tous) == 23 and len(set(tous)) == 23
    assert sorted(len(e) for e in equipes) == [4, 4, 5, 5, 5]


@pytest.mark.parametrize("personnes, nb, message", [
    (["A", "B"], 5, "au moins 5"), (["A", "B", "C"], 1, "entre 2 et 8"), (["A"] * 9, "x", "invalide"),
])
def test_repartir_equipes_invalide(personnes, nb, message):
    with pytest.raises(jeu.ErreurJeu, match=message):
        jeu.repartir_equipes(personnes, nb)


# ------------------------------------------------------------------------------ pige privée
def _partie_finie(cfg, equipes, billets=(4, 3, 2, 1, 0)):
    etat = jeu.nouvelle_partie(cfg, equipes)
    for e, b in zip(etat["equipes"], billets):
        e["billets"] = b
    etat["phase"] = "bonus"
    return etat


def test_poids_selon_le_rang_final(cfg, equipes):
    etat = _partie_finie(cfg, equipes, billets=(0, 1, 4, 2, 3))
    assert jeu.poids_equipes(etat) == {2: 5.0, 4: 4.0, 3: 3.0, 1: 2.0, 0: 1.0}


def test_simulation_favorise_sans_garantir(cfg, equipes):
    etat = _partie_finie(cfg, equipes)
    sim = {s["equipe"]: s for s in jeu.simuler_pige(etat, 4000)["equipes"]}
    assert sim[0]["rang_moyen"] < sim[2]["rang_moyen"] < sim[4]["rang_moyen"]
    assert sim[4]["chance_premier"] > 0.01                 # la dernière équipe peut quand même finir 1re
    assert abs(sum(s["chance_premier"] for s in sim.values()) - 1) < 0.01


def test_tirage_reproduit_la_loi_sans_remise(cfg, equipes):
    """Chance d'être tiré 1er = poids / somme des poids (5 membres × (5+4+3+2+1) = 75)."""
    etat = _partie_finie(cfg, equipes)
    sim = {s["equipe"]: s for s in jeu.simuler_pige(etat, 20000)["equipes"]}
    for eq, attendu in {0: 25 / 75, 4: 5 / 75}.items():
        assert abs(sim[eq]["chance_premier"] - attendu) < 0.02


def test_avantage_dernier_inverse_l_ordre(cfg, equipes):
    cfg["pige"]["avantage"] = "dernier"
    etat = _partie_finie(cfg, equipes)
    jeu.tirer_pige(etat)
    lignes = etat["pige"]["lignes"]
    assert lignes[0]["rang"] == 25 and lignes[-1]["rang"] == 1
    assert etat["phase"] == "terminee"


def test_pige_seulement_apres_les_bonus(cfg, equipes):
    with pytest.raises(jeu.ErreurJeu):
        jeu.tirer_pige(jeu.nouvelle_partie(cfg, equipes))



# ------------------------------------------------------------------------------ options de partie
def test_options_de_partie(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes, {"nb_tours": 3, "carte": "express", "objets": ["gel", "chantier"]})
    assert etat["nb_tours"] == 3 and etat["carte"]["id"] == "express"
    assert [o["id"] for o in etat["reglages"]["objets"]] == ["gel", "chantier"]
    assert len(etat["plateau"]) == len(etat["carte"]["noeuds"]) and etat["plateau"][0] == "T"
    for mauvais, message in [({"nb_tours": 0}, "entre 1 et 20"), ({"carte": "lune"}, "Carte inconnue"),
                             ({"objets": ["licorne"]}, "Objet inconnu")]:
        with pytest.raises(jeu.ErreurJeu, match=message):
            jeu.nouvelle_partie(cfg, equipes, mauvais)


def test_sans_objets_le_depanneur_ne_s_ouvre_pas(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes, {"objets": []})
    assert not jeu.peut_magasiner(etat, etat["equipes"][0])


# ------------------------------------------------------------------------------ embranchements
def test_embranchement_gauche_ou_droite(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes, {"carte": "express"})
    etat["position_billet"] = 14
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    eq = etat["equipes"][0]
    eq["position"], eq["trace"] = 1, [0, 1]
    jeu.hasard.seed(4)
    anim = jeu.lancer(etat)
    att = etat["attente"]
    assert att["type"] == "embranchement" and att["case"] == 3 and anim["chemin"] == [2, 3]
    assert {o["sens"] for o in att["options"]} == {"tout droit", "à droite"}
    express = next(o for o in att["options"] if o["nom"] == "Express")
    with pytest.raises(jeu.ErreurJeu, match="route"):
        jeu.decider(etat, {"vers": 10})
    anim = jeu.decider(etat, {"vers": express["vers"]})
    assert anim["chemin"][0] == express["vers"]                      # il a bien pris l'express
    assert all(i >= 28 or i in (20, 21, 22) for i in anim["chemin"][:len(anim["chemin"])])


def test_arret_pile_sur_l_embranchement_choisit_au_tour_suivant(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes, {"carte": "express"})
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    eq = etat["equipes"][0]
    eq["position"] = 3                                               # déjà sur l'embranchement
    anim = jeu.lancer(etat)
    assert anim["chemin"] == [] and etat["attente"]["type"] == "embranchement" and len(anim["des"]) == 3


def test_correspondance_ratee_suit_la_trace(cfg, equipes):
    etat = jeu.nouvelle_partie(cfg, equipes, {"carte": "express"})
    eq = etat["equipes"][0]
    eq["position"], eq["trace"] = 21, [0, 1, 2, 3, 28, 29, 30, 31, 20, 21]
    jeu.hasard.randrange = lambda n: 3                               # force « Correspondance ratée »
    try:
        ev = jeu._evenement(etat, eq)
    finally:
        del jeu.hasard.randrange
    assert ev["code"] == "correspondance_ratee" and eq["position"] == 30       # recule par l'express emprunté


# ------------------------------------------------------------------------------ objets de jeu
def _au_tour_de_0(cfg, equipes, objets):
    etat = jeu.nouvelle_partie(cfg, equipes)
    etat["plateau"] = ["T"] + ["R"] * 31
    etat["position_billet"] = 20
    jeu.resultat_mini_jeu(etat, [0, 1, 2, 3, 4])
    etat["equipes"][0]["objets"] = [{"id": i, "utilise": False} for i in objets]
    return etat


def test_de_supplementaire(cfg, equipes):
    etat = _au_tour_de_0(cfg, equipes, ["de_supplementaire", "gel"])
    anim = jeu.utiliser_objet(etat, 0)
    assert anim["evenements"][0]["code"] == "objet_de" and jeu.nb_des(etat, 0) == 4
    assert [o["id"] for o in etat["equipes"][0]["objets"]] == ["gel"]
    with pytest.raises(jeu.ErreurJeu, match="pendant l'échange"):
        jeu.utiliser_objet(etat, 0)
    assert len(jeu.lancer(etat)["des"]) == 4 and etat["modif_des"] == {}


def test_feu_rouge(cfg, equipes):
    etat = _au_tour_de_0(cfg, equipes, ["feu_rouge"])
    with pytest.raises(jeu.ErreurJeu, match="autre équipe"):
        jeu.utiliser_objet(etat, 0, 0)
    jeu.utiliser_objet(etat, 0, 4)
    assert jeu.nb_des(etat, 4) == 1                                  # 2 dés − 1
    etat["modif_des"]["4"] = -5
    assert jeu.nb_des(etat, 4) == 1                                  # jamais moins d'un dé


def test_cone_de_chantier(cfg, equipes):
    etat = _au_tour_de_0(cfg, equipes, ["chantier", "chantier"])
    etat["equipes"][0]["position"] = 5
    jeu.utiliser_objet(etat, 0)
    assert etat["pieges"] == [{"case": 5, "equipe": 0, "valeur": 10}]
    with pytest.raises(jeu.ErreurJeu, match="déjà un cône"):
        jeu.utiliser_objet(etat, 0)
    poseur, victime = etat["equipes"][0], etat["equipes"][1]
    kwh_poseur, kwh_victime = poseur["kwh"], victime["kwh"]
    victime["position"] = 5
    anim = {"evenements": []}
    jeu._atterrir(etat, victime, anim)
    assert anim["evenements"][0]["code"] == "piege" and etat["pieges"] == []
    assert poseur["kwh"] == kwh_poseur + 10 and victime["kwh"] == kwh_victime - 10 + 3    # puis la Recharge
    # le poseur ne tombe pas dans son propre piège
    etat["pieges"] = [{"case": 7, "equipe": 0, "valeur": 10}]
    poseur["position"] = 7
    anim = {"evenements": []}
    jeu._atterrir(etat, poseur, anim)
    assert etat["pieges"] and anim["evenements"][0]["code"] == "recharge"
