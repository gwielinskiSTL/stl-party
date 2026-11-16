# STL Party

Jeu de plateau à la *Mario Party* pour l'**échange de cadeaux de la STL** : les équipes jouent des mini-jeux,
avancent sur le réseau, ramassent des kWh et des **Billets d'or**. Le classement final décide **qui choisit sa
position dans l'échange en premier**, et les objets achetés en route servent pendant l'échange (voler, protéger,
geler…).

Même pile que les autres outils (modèle PATTE / stl-temps-normes) : petit serveur **FastAPI** local, une page
**HTML/CSS/JS sans cadriciel**, charte graphique STL, aucune ressource Internet. Pensé pour être projeté.

## Démarrer

```
conda env create -f environment.yml      (une fois)
lancer.bat                               (double-clic) — ou : conda activate stl-party && python -m app.main
```

Puis http://127.0.0.1:3510. L'interrupteur **Mode Noël** de l'en-tête ajoute les couleurs des fêtes (retenu par le
navigateur ; `mode_noel = true` dans `STL_PARTY.toml` pour l'activer par défaut). Pour y accéder d'un autre poste, mettre `hote = "0.0.0.0"` dans `STL_PARTY.toml`.
Le logo officiel se dépose dans `app/static/logo-stl.svg` (masqué s'il est absent, jamais redessiné).

## Déroulement (≈ 45 à 60 min pour 5 équipes de 5)

1. **Mini-jeu** : un joueur par équipe (le suivant de la liste à chaque tour ; le dernier mini-jeu est en équipe).
   L'animateur clique les équipes de la première à la dernière.
2. **Récompense** : 1re et 2e → 3 dés, les autres → 2 dés ; kWh de 10 à 0 selon le rang. Les équipes jouent dans
   l'ordre du mini-jeu.
3. **Déplacements** : lancer des dés, le pion avance, la case s'applique. En passant sur le Billet d'or (20 kWh) ou
   au Dépanneur, une fenêtre propose l'achat (le dépanneur s'ouvre en plein écran, objets illustrés et expliqués).
   Une case Événement s'annonce en plein écran ; on appuie sur « Continuer » pour poursuivre.
4. Après 6 tours : **étoiles bonus** (Grand voyageur, Pleine charge, Pas de chance), **classement final** (Billets,
   puis kWh), puis **choix des positions** à tour de rôle et **liste imprimable** avec les objets à utiliser.

Toutes les règles et valeurs sont dans [`STL_PARTY.toml`](STL_PARTY.toml) : nombre de tours, dés et kWh par rang,
prix, plateau, mini-jeux, objets. Les règles détaillées pour la salle : bouton **Règles** (`app/static/aide.html`).

## Structure

```
stl-party/
├── STL_PARTY.toml       ← configuration unique (lue à la création d'une partie)
├── lancer.bat           ← démarrage par double-clic, port 3510
├── environment.yml      ← environnement Conda « stl-party »
├── app/
│   ├── main.py          ← FastAPI : /api/..., enregistrement, annulation ; erreurs toujours en JSON
│   ├── jeu.py           ← toutes les règles (état = dictionnaire JSON)
│   ├── config.py        ← lecture et validation de STL_PARTY.toml
│   └── static/          ← index.html, app.js (affichage + animations), illustrations.js (dessins SVG),
│                          style.css (charte), aide.html, images/ (images d'objets facultatives)
├── tests/               ← pytest : règles, 30 parties complètes au hasard, API
├── docs/                ← charte graphique, notes de mise à jour datées
└── PARTIES/             ← partie en cours, historique d'annulation, archives (jamais dans git)
```

## Filets de sécurité pour l'animateur

- La partie est enregistrée **après chaque action** : recharger la page ou redémarrer le serveur ne perd rien.
- **Annuler** revient en arrière d'une action (jusqu'à 50).
- Cliquer une équipe dans le classement permet de **corriger** ses kWh ou ses Billets (noté au journal).
- **Nouvelle partie** archive l'ancienne dans `PARTIES/archives/`.

## API

| Route | Effet |
|---|---|
| `GET /api/sante` | `{"statut": "ok"}` |
| `GET /api/configuration` | mini-jeux, objets, plateau, réglages |
| `GET /api/partie` · `POST` · `DELETE` | lire, créer (`{"equipes": [{"nom", "joueurs"}]}`), archiver |
| `POST /api/mini-jeu` | `{"ordre": [id, ...]}` du premier au dernier |
| `POST /api/lancer` | lance les dés de l'équipe courante |
| `POST /api/decision` | `{"acheter": bool}` · `{"objet": id \| null}` · `{"cible": id, "quoi": "kwh" \| "billet"}` |
| `POST /api/tour-suivant` | tour suivant, ou bonus après le dernier |
| `POST /api/repartition/commencer` · `POST /api/repartition` | choix des positions `{"position": n}` |
| `POST /api/ajuster` · `POST /api/objet` · `POST /api/annuler` | corrections, objet utilisé, retour arrière |

## Tests

```
python -m pytest -q
```
