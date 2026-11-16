# Charte graphique STL — interface de stl-temps-normes

Référence de formatage pour toute l'interface de l'outil (pages HTML, tableaux, graphiques, messages).
Elle applique le **Guide de marque STL (juin 2025)**, tel que déjà mis en œuvre dans PATTE, Mathéo et IRIS Live.
Toute personne qui contribue au dépôt, ou toute session Claude qui y travaille, suit ce document.

L'interface est **entièrement en français** (libellés, messages, infobulles, noms d'API exposés à l'usager).

---

## 1. Architecture de l'interface (modèle PATTE)

On reprend la structure de `gwielinskiSTL/patte` : un petit serveur **FastAPI** local qui sert une page
**HTML/CSS/JS sans cadriciel** et une API JSON.

```
stl-temps-normes/
├── app/
│   ├── main.py              ← FastAPI : routes /api/..., sert static/ ; erreurs toujours en JSON {"erreur": "..."}
│   ├── ...                  ← un module Python par domaine (calculs, données, exports)
│   └── static/
│       ├── index.html       ← une seule page : en-tête + barre latérale + contenu
│       ├── style.css        ← SEUL endroit où sont déclarés les jetons de couleur et les styles
│       ├── app.js           ← logique d'affichage (fetch vers /api/..., gabarits <template>)
│       ├── aide.html        ← guide des usagères et usagers, ouvert par le bouton « Aide »
│       └── logo-stl.svg     ← logo officiel renversé (blanc), fourni, jamais redessiné
├── docs/                    ← ce document, notes de mise à jour datées (AAAA-MM-JJ_sujet.txt)
├── tests/
├── environment.yml          ← environnement Conda (python 3.11, fastapi, uvicorn, pytest, httpx)
└── lancer.bat               ← démarrage par double-clic (Windows), ouvre http://127.0.0.1:<port>
```

Principes repris de PATTE :

- **Une erreur n'arrête jamais le serveur** : gestionnaires d'exceptions qui renvoient `{"erreur": "..."}` ;
  l'interface affiche le message dans le bandeau d'alerte.
- **Pas de dépendance web externe** : aucune police, bibliothèque ou CDN chargés depuis Internet
  (l'outil doit fonctionner hors ligne sur le réseau STL).
- Données internes **jamais dans git** (voir `.gitignore`) ; seul un `LISEZMOI.md` décrit le dossier de données.
- Chaque changement visible est décrit dans `docs/mises_a_jour/AAAA-MM-JJ_sujet.txt`.

## 2. Couleurs

Déclarées **une seule fois**, dans `:root` de `style.css`. Ne jamais écrire un hexadécimal ailleurs
que dans ce bloc (sauf les quatre teintes de la flèche, section 5).

```css
:root {
  --marine: #151f6d; --cyan: #00a9e0; --rouge: #d22630; --vert: #82c341;
  --bleu-pale: #d4edfc; --gris-pale: #f3f3f3; --gris: #767676; --blanc: #ffffff;
  --marine-doux: #8a8fb6; --cyan-doux: #80d4f0; --bordure: #c9cde0; --hachure: #d9d9d9;
  --texte: var(--marine);
  --police: "Sofia Pro", Arial, sans-serif;
  --mono: "Cascadia Mono", Consolas, "SFMono-Regular", Menlo, monospace;
  --largeur: 1440px;
}
```

| Jeton | Hex | Rôle |
|---|---|---|
| `--marine` | `#151f6d` | Texte principal, en-tête, élément choisi ou actif, série principale |
| `--cyan` | `#00a9e0` | Accent, données mesurées, focus clavier, élément en cours |
| `--bleu-pale` | `#d4edfc` | Survol, fonds légers, avis d'information, aire sous la courbe |
| `--vert` | `#82c341` | « En marche » : actif, réussi, en ligne |
| `--rouge` | `#d22630` | **Alertes seulement** : échec, seuil dépassé, irréalisable. Jamais décoratif |
| `--gris-pale` | `#f3f3f3` | Fond de page, grille des graphiques |
| `--gris` | `#767676` | Texte secondaire, notes, axes, valeur inconnue |
| `--bordure` | `#c9cde0` | Bordures des champs et boutons secondaires, ligne du zéro |
| `--hachure` | `#d9d9d9` | Hachures « sans données » |

Règles de contraste (non négociables) :

- Texte sur cyan : **marine**, jamais blanc.
- Vert et cyan ne sont **jamais** une couleur de texte sur fond blanc : seulement pastilles, traits, barres, icônes.
- Un état n'est **jamais** codé par la couleur seule : toujours un libellé, une icône ou une infobulle.

## 3. Typographie et formats

- Police : `var(--police)` (Sofia Pro si installée, sinon Arial). Aucune autre police web.
- `font-variant-numeric: tabular-nums` sur `body`.

| Élément | Taille | Graisse |
|---|---|---|
| Nom de l'outil (en-tête) | 40 px, `letter-spacing: -0.02em` | gras |
| Sous-titre de l'en-tête | 14 px, opacité 0,85 | normal |
| Titre de page (`h1`) | 26 px | gras |
| Titre de bloc (`h2`) | 18 px | gras |
| Texte courant | 15 px, interligne 1,45 | normal |
| Notes, légendes, axes | 12–13 px, gris | normal |
| Chiffres clés | 30–56 px, `letter-spacing: -0.02em`, unité plus petite non grasse | gras |

Formats **fr-CA** partout (affichage, exports CSV destinés aux usagers, infobulles) :

- Nombres : `n.toLocaleString("fr-CA")` → virgule décimale, espace insécable pour les milliers (`1 234,5`).
- Unités séparées par une espace : `72,0 %`, `−5,4 °C`, `12 min`.
- Heures : `16h38` ; durées : `1 h 05 min` ou `65 min` selon le contexte, jamais `1:05`.
- Dates : `2026-10-28` dans les tableaux, `mer. 28 oct.` dans les libellés.

## 4. Logo

- Logo officiel STL, version renversée (blanche), fichier `app/static/logo-stl.svg`, à droite de l'en-tête, 40 px de haut.
- Ne **jamais** le redessiner, le recolorer, le déformer ni le recréer en code.
- S'il manque, il est masqué sans erreur :
  `<img class="logo" src="/static/logo-stl.svg" alt="STL" height="40" onerror="this.remove()">`

## 5. Flèche pointillée (élément de marque)

À gauche du nom de l'outil dans l'en-tête : 9 points de 9 px en flèche, dégradé vert → cyan.

```html
<span class="fleche" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
```

```css
.fleche { display: grid; grid-template-columns: repeat(5, 9px); grid-template-rows: repeat(5, 9px); gap: 3px; flex: none; }
.fleche i { width: 9px; height: 9px; border-radius: 50%; background: var(--vert); }
.fleche i:nth-child(1) { grid-area: 3 / 1; } .fleche i:nth-child(2) { grid-area: 3 / 2; }
.fleche i:nth-child(3) { grid-area: 3 / 3; background: #5fb88a; } .fleche i:nth-child(4) { grid-area: 3 / 4; background: #3aafb4; }
.fleche i:nth-child(5) { grid-area: 3 / 5; background: var(--cyan); }
.fleche i:nth-child(6) { grid-area: 2 / 4; background: #3aafb4; } .fleche i:nth-child(7) { grid-area: 1 / 3; background: #5fb88a; }
.fleche i:nth-child(8) { grid-area: 4 / 4; background: #3aafb4; } .fleche i:nth-child(9) { grid-area: 5 / 3; background: #5fb88a; }
```

Hachures à 45° pour « inconnu », « irréalisable » ou « sans données » :
`background: repeating-linear-gradient(45deg, var(--gris-pale) 0 6px, var(--hachure) 6px 8px);`

## 6. Mise en page

### 6.1 Squelette de la page (repris de PATTE)

```html
<header class="entete-stl">
  <div class="entete-stl-int">
    <div class="marque">
      <span class="fleche" aria-hidden="true">…</span>
      <div>
        <div class="marque-nom">Temps normés</div>
        <div class="marque-sous">Sous-titre court de l'outil</div>
      </div>
    </div>
    <div class="entete-stl-droite">
      <dl class="entete-stl-meta">
        <div><dt>Libellé</dt><dd>Valeur</dd></div>
      </dl>
      <a class="btn-entete" href="/static/aide.html" target="_blank" rel="noopener">Aide</a>
      <button class="btn-entete">Action principale</button>
      <img class="logo" src="/static/logo-stl.svg" alt="STL" height="40" onerror="this.remove()">
    </div>
  </div>
</header>

<div class="page">
  <aside class="barre bloc">…liste de sélection…</aside>
  <main class="contenu">
    <div class="alerte" role="alert" hidden></div>
    <div class="info" role="status" hidden></div>
    <section class="bloc">
      <div class="bloc-tete"><h2>Titre du bloc</h2><span class="note">Note à droite</span></div>
      …
    </section>
  </main>
</div>
```

### 6.2 Règles

- **En-tête** : pleine largeur, fond marine, texte blanc ; contenu centré, largeur max 1440 px, marges 22 px × 32 px.
  À gauche : flèche + nom (40 px) + sous-titre. À droite : métadonnées (`dl`, libellé à 75 % d'opacité, valeur en gras),
  boutons, logo.
- **Boutons de l'en-tête** (`.btn-entete`) : fond transparent, bordure blanche à 50 %, 12 px, hauteur 28 px,
  icône au trait SVG de 14 px ; survol `rgba(255,255,255,.12)`.
- **Page** : fond gris pâle, largeur max 1440 px, marges 24 px 32 px 56 px.
  Grille `280px | 1fr` (barre latérale collante + contenu), 20 px d'écart. Sans barre latérale : une colonne.
- **Blocs** (`.bloc`) : fond blanc, padding 22 px 24 px, **sans ombre ni coins arrondis**.
  En-tête de bloc : titre 18 px gras à gauche, note grise 13 px à droite.
- **Liste latérale** : survol bleu pâle ; élément choisi fond marine, texte blanc, gras ; pastille d'état de 8 px.

## 7. Composants

Classes à réutiliser telles quelles (mêmes noms que PATTE) :

| Classe | Apparence | Usage |
|---|---|---|
| `.btn.btn-principal` | fond marine, texte blanc ; survol `#222e8c` | une seule action principale par zone |
| `.btn.btn-secondaire` | fond blanc, bordure `--bordure` ; survol bleu pâle | actions courantes, « Annuler » |
| `.btn.btn-danger-contour` | texte rouge, bordure `--bordure` ; survol bordure rouge | suppression (toujours confirmée) |
| `.btn.btn-lien` | souligné marine ; survol bleu pâle | actions secondaires dans un bloc |
| `.btn-petit` | 13 px, hauteur 28 px | à combiner avec les précédentes |

- Tous les boutons et champs ont des **coins droits** (`border-radius: 0`), hauteur min. 34 px.
- **Champs** (`.champ`) : libellé gras 14 px au-dessus, aide grise 12,5 px dessous, bordure `--bordure` 1 px ;
  champ invalide : bordure rouge ; champ modifié : bordure marine 2 px + fond bleu pâle.
- **Interrupteurs** : piste `--bordure`, marine quand activés. **Sélecteur segmenté** : bordure marine, segment choisi marine.
- **Focus clavier** : `:focus-visible { outline: 3px solid var(--cyan); outline-offset: 2px; }`
- **Dialogues** (`<dialog class="dialogue">`) : bordure supérieure marine 6 px, sans coins arrondis,
  fond d'arrière-plan `rgba(21,31,109,.45)`, titre 22 px, boutons alignés à droite (« Annuler » puis action).
- **Messages** :
  - information (`.info`) : fond bleu pâle, bordure gauche cyan 4 px, texte marine ;
  - alerte (`.alerte`, `.erreur`) : fond rouge, texte blanc gras ;
  - avertissement bêta : fond cyan, texte marine.
- **Indicateurs d'état** : pastille ronde 8 px (verte = actif/réussi, cyan = en cours, grise = arrêté/inconnu,
  rouge = échec), **toujours** suivie d'un libellé en marine (ou rouge pour un échec).
- **Code et chemins** : `var(--mono)`, 12,5 px, fond gris pâle.
- **Journaux** : fond marine, texte blanc, `var(--mono)` 12 px, hauteur max 360 px avec défilement.

### Tableaux

- Police 13 px, `border-collapse: collapse`, largeur 100 %, conteneur avec défilement (`max-height` + `overflow: auto`).
- En-têtes collants (`position: sticky`), fond gris pâle, gras, bordure basse `--bordure`.
- Lignes séparées par une bordure gris pâle ; **nombres alignés à droite** (`td.num`), au format fr-CA.
- États dans une cellule : réussi = pastille verte + texte gras ; à surveiller = fond bleu pâle ; échec = fond rouge, texte blanc.

## 8. Graphiques

- Ordre des séries : marine `#151f6d`, cyan `#00a9e0`, `#8a8fb6`, vert `#82c341`.
  Modèle ou norme = marine ; mesure réelle = cyan ; référence = vert.
- Traits 2–3 px (4 px pour la mesure réelle), jonctions arrondies ; prolongement d'une prévision en tirets.
- Aire sous la courbe principale : bleu pâle à 60 % d'opacité.
- Grille horizontale gris pâle, ligne du zéro `--bordure`, pas de cadre ; axes 12 px gris, unité sur les étiquettes.
- Seuil ou minimum : rouge pointillé (`6 5`). « Maintenant » : gris pointillé (`3 3`) avec le mot « maintenant ».
- Données manquantes : zone hachurée, jamais une ligne tracée à travers le trou.
- Légende en ligne sous ou au-dessus du graphique, 12–13 px gris.
- Graphiques d'un même écran : même axe du temps et mêmes marges.
- Rouge jamais comme couleur de série.

Si Plotly est utilisé, enregistrer une seule fois le gabarit `stl` (`colorway` ci-dessus, police `var(--police)`,
`separators=", "`) et l'utiliser par défaut.

## 9. Petits écrans et accessibilité

- `@media (max-width: 900px)` : marges latérales 16 px, nom de l'outil 32 px, grille sur une colonne,
  barre latérale non collante, tableaux et graphiques défilent dans leur bloc ; **jamais** de défilement horizontal de la page.
- Animations courtes (pulsation d'un élément en cours seulement) et désactivées sous `prefers-reduced-motion: reduce`.
- Icônes décoratives en `aria-hidden="true"` ; messages dynamiques dans `role="alert"` ou `role="status"`.
- Tout bouton sans texte a un `title` ou `aria-label` en français.

## 10. Vérification avant une PR qui touche l'interface

- [ ] Rendu vérifié à 1440 px et à 390 px de large, sans défilement horizontal de la page.
- [ ] Aucun texte blanc sur cyan ou sur vert ; aucun texte vert ou cyan sur blanc.
- [ ] Rouge utilisé uniquement pour des alertes ou des échecs.
- [ ] Chaque état coloré a aussi un libellé.
- [ ] Logo officiel non redessiné, masqué proprement s'il manque.
- [ ] Nombres, heures et unités au format fr-CA.
- [ ] Aucun hexadécimal en dehors de `:root` (sauf la flèche).
- [ ] Note de mise à jour ajoutée dans `docs/mises_a_jour/` si le changement est visible pour les usagers.
