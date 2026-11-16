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
