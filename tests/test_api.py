"""API : enregistrement de la partie, annulation, erreurs en JSON."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_sante_et_page():
    assert client.get("/api/sante").json() == {"statut": "ok"}
    assert "STL Party" in client.get("/").text
    assert client.get("/static/app.js").status_code == 200


def test_configuration():
    c = client.get("/api/configuration").json()
    assert c["plateau"][0] == "T" and len(c["mini_jeux"]) == 6 and c["objets"]
    assert c["mode_noel"] is False
    assert c["animations"] == "toujours"


def test_fichiers_statiques_revalides():
    assert client.get("/static/app.js").headers["cache-control"] == "no-cache"
    assert client.get("/api/sante").headers["cache-control"] == "no-store"


def test_mode_noel_par_defaut(monkeypatch, tmp_path):
    from app import config
    texte = config.chemin_config().read_text(encoding="utf-8").replace("mode_noel = false", "mode_noel = true")
    autre = tmp_path / "config.toml"
    autre.write_text(texte, encoding="utf-8")
    monkeypatch.setenv("PARTY_CONFIG", str(autre))
    assert client.get("/api/configuration").json()["mode_noel"] is True


def test_flux_complet_et_annuler(equipes):
    assert client.get("/api/partie").json()["etat"] is None
    r = client.post("/api/partie", json={"equipes": equipes})
    assert r.status_code == 200
    etat = r.json()["partie"]["etat"]
    assert etat["phase"] == "mini_jeu"

    r = client.post("/api/mini-jeu", json={"ordre": [4, 3, 2, 1, 0]}).json()
    assert r["partie"]["etat"]["phase"] == "deplacement" and r["animation"]["type"] == "mini_jeu"
    assert r["partie"]["peut_annuler"] is True

    # la partie survit à un « redémarrage » : elle est relue du disque
    assert client.get("/api/partie").json()["etat"]["courant"] == 4

    r = client.post("/api/annuler").json()
    assert r["partie"]["etat"]["phase"] == "mini_jeu"


def test_erreurs_en_json(equipes):
    r = client.post("/api/lancer")
    assert r.status_code == 404 and "Aucune partie" in r.json()["erreur"]
    client.post("/api/partie", json={"equipes": equipes})
    r = client.post("/api/lancer")
    assert r.status_code == 409 and "phase" in r.json()["erreur"]
    r = client.post("/api/mini-jeu", json={"ordre": [0]})
    assert r.status_code == 400
    r = client.post("/api/partie", json={"equipes": equipes[:1]})
    assert r.status_code == 400


def test_nouvelle_partie_archive_l_ancienne(equipes, tmp_path):
    client.post("/api/partie", json={"equipes": equipes})
    client.delete("/api/partie")
    assert client.get("/api/partie").json()["etat"] is None
    assert list((tmp_path / "PARTIES" / "archives").glob("partie_*.json"))


def test_ajuster_et_objets(equipes):
    client.post("/api/partie", json={"equipes": equipes})
    r = client.post("/api/ajuster", json={"equipe": 2, "kwh": 5, "billets": 1}).json()
    q = r["partie"]["etat"]["equipes"][2]
    assert q["kwh"] == 15 and q["billets"] == 1
    assert r["partie"]["classement"][0] == 2
    assert client.post("/api/objet", json={"equipe": 2, "indice": 0}).status_code == 400



def test_equipes_aleatoires():
    r = client.post("/api/equipes/aleatoires", json={"personnes": [f"P{k}" for k in range(12)], "nb_equipes": 3}).json()
    assert sorted(len(e) for e in r["equipes"]) == [4, 4, 4]
    assert client.post("/api/equipes/aleatoires", json={"personnes": ["A"], "nb_equipes": 3}).status_code == 400


def _jusqu_a_la_pige(equipes, tmp_path):
    import json
    client.post("/api/partie", json={"equipes": equipes})
    fichier = tmp_path / "PARTIES" / "partie.json"
    etat = json.loads(fichier.read_text(encoding="utf-8"))
    etat["phase"] = "bonus"
    etat["equipes"][0]["objets"] = [{"id": "gel", "utilise": False}]
    fichier.write_text(json.dumps(etat), encoding="utf-8")
    return client.post("/api/pige").json()


def test_pige_jamais_dans_la_vue_publique(equipes, tmp_path):
    r = _jusqu_a_la_pige(equipes, tmp_path)
    publique = r["partie"]["etat"]["pige"]
    assert publique == {"faite": True, "participants": 25, "objets": 1}
    assert "lignes" not in client.get("/api/partie").json()["etat"]["pige"]
    assert "Joueur" not in str(client.get("/api/partie").json()["etat"]["pige"])


def test_page_privee_refusee_hors_du_poste(equipes, tmp_path):
    _jusqu_a_la_pige(equipes, tmp_path)
    r = client.get("/api/pige")                      # le client de test n'est pas « localhost »
    assert r.status_code == 403 and "poste" in r.json()["erreur"]
    assert client.get("/api/pige.csv").status_code == 403


def test_page_privee_avec_code(equipes, tmp_path, monkeypatch):
    monkeypatch.setenv("PARTY_CODE_PRIVE", "sapin")
    _jusqu_a_la_pige(equipes, tmp_path)
    assert client.get("/api/pige", params={"code": "faux"}).status_code == 403
    r = client.get("/api/pige", headers={"X-Code-Prive": "sapin"})
    assert r.status_code == 200 and len(r.json()["pige"]["lignes"]) == 25
    csv_ = client.get("/api/pige.csv", params={"code": "sapin"})
    assert csv_.status_code == 200 and "Ordre de pige" in csv_.text and "Gel" in csv_.text
    assert "sapin" not in client.get("/api/configuration").text


# ------------------------------------------------------------------------------ suivi sur cellulaire
def test_suivi_sans_partie():
    assert client.get("/api/suivi").json()["partie"] is False


def test_suivi_suit_l_ecran_projete(equipes):
    client.post("/api/partie", json={"equipes": equipes})
    client.post("/api/suivi/synchroniser", json={"noel": True})
    client.post("/api/mini-jeu", json={"ordre": [4, 3, 2, 1, 0]})
    v = client.get("/api/suivi").json()
    assert v["phase"] == "mini_jeu" and v["noel"] is True       # l'écran n'a pas encore fini d'afficher le mini-jeu
    client.post("/api/suivi/synchroniser", json={})
    v = client.get("/api/suivi").json()
    assert v["phase"] == "deplacement" and v["courant"] == "Équipe 5"
    assert v["equipes"][0]["nom"] == "Équipe 5" and v["equipes"][0]["des"] == 3


def test_suivi_cache_les_points_pendant_le_devoilement(equipes, tmp_path):
    _jusqu_a_la_pige(equipes, tmp_path)          # passe par la phase bonus
    import json
    fichier = tmp_path / "PARTIES" / "partie.json"
    etat = json.loads(fichier.read_text(encoding="utf-8"))
    etat["phase"] = "bonus"
    (tmp_path / "PARTIES" / "suivi.json").write_text(json.dumps({"etat": etat, "noel": False, "maj": None}), encoding="utf-8")
    v = client.get("/api/suivi").json()
    assert v["resultats_caches"] is True and v["journal"] == []
    assert all(e["kwh"] is None and e["billets"] is None and e["rang"] is None for e in v["equipes"])


def test_ordre_de_pige_seulement_si_publie(equipes, tmp_path, monkeypatch):
    monkeypatch.setenv("PARTY_CODE_PRIVE", "sapin")
    _jusqu_a_la_pige(equipes, tmp_path)
    client.post("/api/suivi/synchroniser", json={})
    v = client.get("/api/suivi").json()
    assert v["pige"] == {"faite": True, "publiee": False}
    assert client.post("/api/pige/publication", json={"publiee": True}).status_code == 403      # sans code
    assert client.post("/api/pige/publication", json={"publiee": True}, headers={"X-Code-Prive": "sapin"}).status_code == 200
    v = client.get("/api/suivi").json()
    assert v["pige"]["publiee"] and len(v["pige"]["ordre"]) == 25
    assert set(v["pige"]["ordre"][0]) == {"ordre", "joueur", "equipe"}                         # jamais les objets
    assert "indice" not in json_texte(v)


def json_texte(v):
    import json
    return json.dumps(v)


def test_adresse_et_qr():
    a = client.get("/api/suivi/adresse").json()
    assert a["url"].endswith("/suivre")
    if a["qr"]:
        r = client.get("/api/suivi/qr.svg")
        assert r.status_code == 200 and r.text.lstrip().startswith("<svg")
    assert "Suivi" in client.get("/suivre").text
