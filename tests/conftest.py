"""Données isolées dans un dossier temporaire ; hasard fixé pour des parties reproductibles."""
import random

import pytest

from app import config, jeu


@pytest.fixture(autouse=True)
def isoler(monkeypatch, tmp_path):
    monkeypatch.setenv("PARTY_DONNEES", str(tmp_path / "PARTIES"))
    monkeypatch.setattr(jeu, "hasard", random.Random(2026))


@pytest.fixture
def cfg():
    return config.lire()


@pytest.fixture
def equipes():
    return [{"nom": f"Équipe {i + 1}", "joueurs": [f"Joueur {i + 1}.{k + 1}" for k in range(5)]} for i in range(5)]
