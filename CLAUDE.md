# Consignes pour les sessions Claude sur ce dépôt

- Lire d'abord `README.md`. Tout en français : code, messages, documentation.
- Règles du jeu : `app/jeu.py` (seul endroit où elles vivent) ; l'interface (`app/static/`) ne fait qu'afficher et animer.
- Interface : charte graphique STL (même base que `stl-temps-normes`, `docs/CHARTE_GRAPHIQUE_STL.md` de ce dépôt).
  Rouge réservé aux alertes ; chaque couleur d'équipe est doublée d'un numéro. Seule exception : le mode Noël
  (styles sous `body.noel`, jetons `--noel-*` dans `:root`), qui garde le rouge STL pour les alertes.
- Lancer `python -m pytest -q` avant chaque commit ; ajouter une note dans `docs/mises_a_jour/`.
- Aucune partie enregistrée dans git (`PARTIES/`).
