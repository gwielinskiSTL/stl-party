/* =====================================================================================
   STL Party — interface. Le serveur applique les règles (app/jeu.py) ; cette page affiche
   l'état et rejoue les animations (dés, déplacement des pions, cartes d'événement).
   ===================================================================================== */
"use strict";

const $ = (sel) => document.querySelector(sel);
const PHASES = {
  mini_jeu: "Mini-jeu", deplacement: "Déplacements", fin_tour: "Fin du tour",
  bonus: "Bonus", repartition: "Choix des positions", terminee: "Échange",
};
const SYMBOLES = { T: "T", R: "+", B: "−", E: "?", I: "!", F: "◐", D: "⇄", M: "◆" };
const LIBELLES = { T: "Terminus", R: "Recharge", B: "Bouchon", E: "Événement", I: "Inspecteur", F: "Fantôme", D: "Détour", M: "Dépanneur" };
const FANTOME = `<path class="fantome" d="M-11 6v-12a11 11 0 0 1 22 0v12l-3.7-3.5-3.6 3.5-3.7-3.5-3.7 3.5-3.6-3.5z" transform="translate(0,-6)"></path>
  <circle class="oeil" cx="-4" cy="-10" r="2.2"></circle><circle class="oeil" cx="4" cy="-10" r="2.2"></circle>`;
const DECALAGES = [[-16, -16], [16, -16], [-16, 16], [16, 16], [0, 0], [0, -26], [0, 26], [-26, 0]];
const MOUVEMENT_REDUIT = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let cfg = null;            // configuration (pour l'écran de création)
let partie = null;         // vue renvoyée par le serveur : {etat, classement, mini_jeu, ...}
let positions = {};        // positions affichées des pions (diffèrent de l'état pendant une animation)
let occupe = false;        // une animation ou une requête est en cours
let ordreMiniJeu = [];     // classement du mini-jeu en cours de saisie
let bonusReveles = 0;
let derniereScene = null;  // ce que la scène affiche après une animation (dernière carte d'événement)

const attendre = (ms) => new Promise((r) => setTimeout(r, MOUVEMENT_REDUIT ? Math.min(ms, 60) : ms));
const fr = (n) => Number(n).toLocaleString("fr-CA");
const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const etat = () => partie && partie.etat;
const equipe = (id) => etat().equipes[Number(id)];
const pion = (id, classe = "pion") => `<span class="${classe} eq-${id % 8}" aria-hidden="true">${Number(id) + 1}</span>`;
const imageObjet = (o) => o.image
  ? `<img src="/static/images/${encodeURI(o.image)}" alt="${echapper(o.nom)}">`
  : ILLUSTRATIONS.objet(o.id);
const objetCfg = (id) => etat().reglages.objets.find((o) => o.id === id) || { nom: id, description: "" };

// ------------------------------------------------------------------------------ API
async function api(methode, url, corps) {
  const reponse = await fetch(url, {
    method: methode,
    headers: corps ? { "Content-Type": "application/json" } : {},
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let donnees = {};
  try { donnees = await reponse.json(); } catch (_) { /* réponse vide */ }
  if (!reponse.ok) throw new Error(donnees.erreur || `Erreur ${reponse.status}`);
  return donnees;
}

function alerte(message) {
  const a = $("#alerte");
  a.textContent = message || "";
  a.hidden = !message;
  if (message) window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Envoie une action, rejoue l'animation renvoyée, puis affiche le nouvel état. */
async function agir(methode, url, corps) {
  if (occupe) return;
  occupe = true;
  majBoutons();
  alerte("");
  try {
    const r = await api(methode, url, corps);
    await rejouer(r.animation, r.partie);
  } catch (e) {
    alerte(e.message);
  } finally {
    occupe = false;
    afficher();
  }
}

// ------------------------------------------------------------------------------ mode Noël
// Préférence propre à ce navigateur ; sinon, la valeur par défaut de STL_PARTY.toml ([application] mode_noel).
const CLE_NOEL = "stl-party.mode-noel";

function noelMemorise() {
  try { const v = localStorage.getItem(CLE_NOEL); return v === null ? null : v === "1"; } catch (_) { return null; }
}

function appliquerNoel(actif, memoriser) {
  document.body.classList.toggle("noel", actif);
  $("#btn-noel").setAttribute("aria-pressed", String(actif));
  if (actif) creerNeige();
  if (memoriser) { try { localStorage.setItem(CLE_NOEL, actif ? "1" : "0"); } catch (_) { /* stockage indisponible */ } }
}

function creerNeige() {
  const zone = $("#neige");
  if (!zone || zone.children.length || MOUVEMENT_REDUIT) return;
  zone.innerHTML = Array.from({ length: 45 }, () => {
    const taille = (3 + Math.random() * 5).toFixed(1);
    const duree = (9 + Math.random() * 12).toFixed(1);
    return `<i style="left:${(Math.random() * 100).toFixed(1)}%;width:${taille}px;height:${taille}px;opacity:${(0.55 + Math.random() * 0.4).toFixed(2)};` +
      `animation-duration:${duree}s;animation-delay:-${(Math.random() * duree).toFixed(1)}s;--derive:${Math.round(Math.random() * 80 - 40)}px"></i>`;
  }).join("");
}

$("#btn-noel").addEventListener("click", () => appliquerNoel(!document.body.classList.contains("noel"), true));
appliquerNoel(noelMemorise() ?? false, false);   // tout de suite, pour éviter un éclair aux couleurs normales

// ------------------------------------------------------------------------------ démarrage
async function demarrer() {
  try {
    [cfg, partie] = await Promise.all([api("GET", "/api/configuration"), api("GET", "/api/partie")]);
  } catch (e) {
    alerte(e.message);
    return;
  }
  if (noelMemorise() === null) appliquerNoel(!!cfg.mode_noel, false);
  synchroniserPositions();
  afficher();
}

function synchroniserPositions() {
  positions = {};
  if (etat()) etat().equipes.forEach((e) => { positions[e.id] = e.position; });
}

function afficher() {
  const e = etat();
  $("#vue-config").hidden = !!e;
  $("#vue-jeu").hidden = !e || !["mini_jeu", "deplacement", "fin_tour"].includes(e.phase);
  $("#vue-fin").hidden = !e || !["bonus", "repartition", "terminee"].includes(e.phase);
  $("#meta").hidden = !e;
  $("#btn-nouvelle").hidden = !e;
  $("#btn-journal").hidden = !e;
  $("#btn-annuler").hidden = !e;
  if (!e) { afficherConfig(); majBoutons(); return; }
  $("#meta-tour").textContent = `${Math.min(e.tour, e.nb_tours)} / ${e.nb_tours}`;
  $("#meta-phase").textContent = PHASES[e.phase] || e.phase;
  if (!$("#vue-jeu").hidden) {
    dessinerPlateau();
    afficherScene();
    afficherEquipes();
    afficherAction();
    if (e.attente && !occupe) ouvrirDecision();
  } else {
    afficherFin();
  }
  majBoutons();
}

function majBoutons() {
  $("#btn-annuler").disabled = occupe || !(partie && partie.peut_annuler);
  document.querySelectorAll("[data-action]").forEach((b) => { b.disabled = occupe || b.dataset.bloque === "1"; });
}

// ------------------------------------------------------------------------------ configuration
let equipesConfig = null;

function afficherConfig() {
  if (!cfg) return;
  if (!equipesConfig) {
    equipesConfig = Array.from({ length: 5 }, (_, i) => ({ nom: `Équipe ${i + 1}`, joueurs: "" }));
  }
  const grille = $("#config-equipes");
  grille.innerHTML = equipesConfig.map((eq, i) => `
    <div class="carte-config">
      <div class="carte-config-tete">${pion(i)}<input aria-label="Nom de l'équipe ${i + 1}" data-i="${i}" data-champ="nom" value="${echapper(eq.nom)}"></div>
      <label class="champ"><span>Joueurs</span>
        <textarea data-i="${i}" data-champ="joueurs" placeholder="Un nom par ligne">${echapper(eq.joueurs)}</textarea>
      </label>
    </div>`).join("");
  grille.querySelectorAll("[data-champ]").forEach((champ) => champ.addEventListener("input", () => {
    equipesConfig[champ.dataset.i][champ.dataset.champ] = champ.value;
    resumeConfig();
  }));
  $("#config-mini-jeux").innerHTML = cfg.mini_jeux.map((m) =>
    `<li><strong>${echapper(m.nom)}</strong>${m.toute_equipe ? " · toute l'équipe" : ""}<br><span class="note">${echapper(m.description)}</span></li>`).join("");
  $("#config-objets").innerHTML = cfg.objets.map((o) =>
    `<li class="objet-liste"><span class="objet-vignette">${imageObjet(o)}</span>
      <span><strong>${echapper(o.nom)}</strong> · ${fr(o.prix)} kWh<br><span class="note">${echapper(o.description)}</span></span></li>`).join("");
  resumeConfig();
}

function resumeConfig() {
  const joueurs = equipesConfig.reduce((s, e) => s + e.joueurs.split("\n").filter((j) => j.trim()).length, 0);
  $("#config-resume").textContent =
    `${equipesConfig.length} équipes · ${fr(joueurs)} joueurs · ${cfg.partie.nb_tours} tours · plateau de ${cfg.plateau.length} arrêts`;
}

$("#btn-plus-equipe").addEventListener("click", () => {
  if (equipesConfig.length >= 8) return;
  equipesConfig.push({ nom: `Équipe ${equipesConfig.length + 1}`, joueurs: "" });
  afficherConfig();
});
$("#btn-moins-equipe").addEventListener("click", () => {
  if (equipesConfig.length <= 2) return;
  equipesConfig.pop();
  afficherConfig();
});
$("#btn-commencer").addEventListener("click", async () => {
  const equipes = equipesConfig.map((e) => ({ nom: e.nom, joueurs: e.joueurs.split("\n") }));
  ordreMiniJeu = [];
  bonusReveles = 0;
  derniereScene = null;
  await agir("POST", "/api/partie", { equipes });
  synchroniserPositions();
  afficher();
});

// ------------------------------------------------------------------------------ plateau
function geometrie() {
  const n = etat().plateau.length;
  const x0 = 50, y0 = 50, x1 = 950, y1 = 570;
  const l = x1 - x0, h = y1 - y0, per = 2 * (l + h);
  return Array.from({ length: n }, (_, i) => {
    let d = (i * per) / n;
    if (d < l) return [x0 + d, y0];
    d -= l; if (d < h) return [x1, y0 + d];
    d -= h; if (d < l) return [x1 - d, y1];
    d -= l; return [x0, y1 - d];
  });
}

function dessinerPlateau() {
  const e = etat();
  const pts = geometrie();
  const r = e.reglages.cases;
  const valeurs = { R: `+${r.recharge}`, B: `−${r.bouchon}` };
  const cases = e.plateau.map((c, i) => {
    const [x, y] = pts[i];
    return `<g class="case c-${c}" transform="translate(${x},${y})"><title>${LIBELLES[c]}</title>
      <rect x="-32" y="-32" width="64" height="64"></rect>
      ${c === "E" ? '<rect class="ruban" x="-4" y="-32" width="8" height="64"></rect><rect class="ruban" x="-32" y="-4" width="64" height="8"></rect>' : ""}
      ${c === "F" ? FANTOME : `<text class="symbole" y="-6">${valeurs[c] || SYMBOLES[c]}</text>`}
      <text class="libelle" y="20">${LIBELLES[c]}</text></g>`;
  }).join("");
  const [bx, by] = pts[e.position_billet];
  const etoile = (cx, cy, R, r2) => Array.from({ length: 10 }, (_, k) => {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r2 : R;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  const route = pts.map(([x, y]) => `${x},${y}`).join(" ");
  $("#plateau-svg").innerHTML = `
    <defs><pattern id="hachures" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="8" height="8" fill="#f3f3f3"></rect><rect width="3" height="8" fill="#d9d9d9"></rect></pattern></defs>
    <polygon class="route" points="${route}"></polygon>
    <polygon class="route-pointillee" points="${route}"></polygon>
    ${cases}
    <g class="billet" transform="translate(${bx + 26},${by - 26})"><title>Billet d'or : ${fr(e.reglages.partie.prix_billet)} kWh</title>
      <circle class="halo" r="20"></circle>
      <polygon points="${etoile(0, 0, 20, 9)}"></polygon><circle r="5"></circle></g>
    <g class="pions-svg" id="pions"></g>`;
  dessinerPions();
}

function dessinerPions(actif) {
  const groupe = $("#pions");
  if (!groupe) return;
  const pts = geometrie();
  const e = etat();
  const courant = actif ?? (e.phase === "deplacement" ? e.courant : null);
  if (!groupe.children.length) {
    groupe.innerHTML = e.equipes.map((q) =>
      `<g class="p-${q.id % 8}" data-id="${q.id}"><title>${echapper(q.nom)}</title><circle r="14"></circle><text>${q.id + 1}</text></g>`).join("");
  }
  // le pion actif est dessiné en dernier, par-dessus les autres
  e.equipes.forEach((q) => {
    const g = groupe.querySelector(`[data-id="${q.id}"]`);
    const [x, y] = pts[positions[q.id] ?? q.position];
    const [dx, dy] = DECALAGES[q.id % 8];
    g.setAttribute("transform", `translate(${x + dx},${y + dy})`);
    g.classList.toggle("actif", q.id === courant);
  });
  const g = groupe.querySelector(`[data-id="${courant}"]`);
  if (g) groupe.appendChild(g);
}

// ------------------------------------------------------------------------------ scène centrale
function htmlDes(valeurs, nombre) {
  const POINTS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const liste = valeurs || Array.from({ length: nombre }, () => 0);
  return `<div class="des">${liste.map((v) => `<div class="de${valeurs ? "" : " vide"}" aria-label="${v ? `Dé : ${v}` : "Dé"}">${
    Array.from({ length: 9 }, (_, k) => `<i style="visibility:${(POINTS[v] || []).includes(k + 1) ? "visible" : "hidden"}"></i>`).join("")
  }</div>`).join("")}</div>`;
}

function afficherScene() {
  const e = etat();
  const scene = $("#scene");
  if (e.phase === "mini_jeu") {
    const m = partie.mini_jeu;
    scene.innerHTML = `<div class="scene-surtitre">Tour ${e.tour} sur ${e.nb_tours} · Mini-jeu</div>
      <div class="scene-titre">${echapper(m.nom)}</div>
      <p class="scene-texte">${echapper(m.description)}</p>
      <div class="scene-joueurs">${e.equipes.map((q) => `<span>${pion(q.id)}${echapper(m.joueurs[q.id])}</span>`).join("")}</div>`;
  } else if (e.phase === "deplacement") {
    const q = equipe(e.courant);
    const nb = e.des[String(q.id)] || 1;
    scene.innerHTML = `${derniereScene || ""}
      <div class="scene-surtitre">Tour ${e.tour} sur ${e.nb_tours}</div>
      <div class="scene-titre">${pion(q.id)} Au tour de ${echapper(q.nom)}</div>
      ${e.attente ? `<p class="scene-texte">Une décision est attendue…</p>` : htmlDes(null, nb) + `<p class="scene-texte">${nb} dé${nb > 1 ? "s" : ""} à lancer</p>`}`;
  } else if (e.phase === "fin_tour") {
    const dernier = e.tour >= e.nb_tours;
    const suivant = e.reglages.mini_jeux[e.tour % e.reglages.mini_jeux.length];
    scene.innerHTML = `${derniereScene || ""}
      <div class="scene-surtitre">Fin du tour ${e.tour} sur ${e.nb_tours}</div>
      <div class="scene-titre">${dernier ? "Place aux bonus !" : `Prochain mini-jeu : ${echapper(suivant.nom)}`}</div>`;
  }
}

function carteEvenement(ev, petite) {
  return `<div class="carte-ev ${ev.ton || ""}${petite ? " rappel" : ""}">
    <h3>${echapper(ev.titre)}</h3><p>${echapper(ev.texte)}</p>
    ${petite ? "" : '<small>Cliquer pour continuer</small>'}</div>`;
}

/** Affiche une carte au centre jusqu'au clic ou pendant quelques secondes. */
function montrerCarte(ev) {
  return new Promise((resoudre) => {
    $("#scene").innerHTML = carteEvenement(ev);
    const carte = $("#scene .carte-ev");
    const fin = () => { clearTimeout(minuterie); resoudre(); };
    const minuterie = setTimeout(fin, MOUVEMENT_REDUIT ? 2500 : 4200);
    carte.addEventListener("click", fin, { once: true });
  });
}

/** Plein écran pour une case Événement : grande illustration, attend « Continuer » (ou Entrée). */
function montrerGrandEcran(ev) {
  return new Promise((resoudre) => {
    const ecran = $("#ecran-geant");
    ecran.className = `ecran-geant ${ev.ton || ""}`;
    $("#geant-illustration").innerHTML = ILLUSTRATIONS.evenement(ev.code);
    $("#geant-titre").textContent = ev.titre;
    $("#geant-description").textContent = ev.texte;
    $("#geant-equipe").innerHTML = ev.equipe !== undefined
      ? `${pion(ev.equipe, "pion pion-grand")} <span>${echapper(equipe(ev.equipe).nom)} tombe sur une case Événement</span>` : "";
    if (ev.objet) {   // prime : on montre aussi l'objet gagné
      const o = etat().reglages.objets.find((x) => x.id === ev.objet);
      if (o) $("#geant-illustration").innerHTML = imageObjet(o);
    }
    ecran.hidden = false;
    const bouton = $("#geant-continuer");
    bouton.focus();
    bouton.addEventListener("click", () => { ecran.hidden = true; resoudre(); }, { once: true });
  });
}

// ------------------------------------------------------------------------------ animations
async function rejouer(anim, nouvelle) {
  const ancienne = partie;
  if (!anim || !ancienne || !ancienne.etat || !nouvelle.etat || !["deplacement", "tour", "mini_jeu"].includes(anim.type)) {
    partie = nouvelle;
    synchroniserPositions();
    return;
  }
  if (anim.type === "mini_jeu") {
    ordreMiniJeu = [];
    derniereScene = null;
  }
  if (anim.type === "deplacement") {
    derniereScene = null;
    const id = anim.equipe;
    if (anim.des && anim.des.length) {
      const scene = $("#scene");
      scene.innerHTML = `<div class="scene-titre">${pion(id)} ${echapper(equipe(id).nom)}</div><div id="des-anim"></div><div class="total" id="total"></div>`;
      const fin = Date.now() + (MOUVEMENT_REDUIT ? 0 : 1100);
      while (Date.now() < fin) {
        $("#des-anim").innerHTML = htmlDes(anim.des.map(() => 1 + Math.floor(Math.random() * 6)));
        document.querySelectorAll("#des-anim .de").forEach((d) => d.classList.add("roule"));
        await attendre(90);
      }
      $("#des-anim").innerHTML = htmlDes(anim.des);
      $("#total").textContent = anim.des.length > 1 ? `${anim.des.join(" + ")} = ${anim.total} arrêts` : `${anim.total} arrêt${anim.total > 1 ? "s" : ""}`;
      await attendre(1100);
    }
    for (const pos of anim.chemin) {
      positions[id] = pos;
      dessinerPions(id);
      await attendre(260);
    }
  }
  partie = nouvelle;
  for (const ev of anim.evenements || []) {
    await (ev.grand ? montrerGrandEcran(ev) : montrerCarte(ev));
    if (ev.saut !== undefined || ev.echange || ev.billet) {   // téléportations : on synchronise
      synchroniserPositions();
      dessinerPlateau();
    }
  }
  const evs = anim.evenements || [];
  derniereScene = evs.length ? carteEvenement(evs[evs.length - 1], true) : null;
  synchroniserPositions();
}

// ------------------------------------------------------------------------------ classement et actions
function afficherEquipes() {
  const e = etat();
  $("#equipes").innerHTML = partie.classement.map((id, rang) => {
    const q = equipe(id);
    const objets = q.objets.map((o) => objetCfg(o.id).nom).join(", ");
    const nbDes = e.des[String(id)];
    const actif = e.phase === "deplacement" && e.courant === id;
    return `<li class="equipe${actif ? " actif" : ""}" data-id="${id}" tabindex="0" role="button" aria-label="Corriger ${echapper(q.nom)}">
      <span class="equipe-rang">${rang + 1}</span>${pion(id)}
      <span><span class="equipe-nom">${echapper(q.nom)}</span>${nbDes ? `<span class="badge-des">${nbDes} dés</span>` : ""}
        <br><span class="equipe-objets">${objets ? echapper(objets) : "Aucun objet"}</span></span>
      <span class="equipe-scores">
        <span class="score"><b>${fr(q.billets)}</b><span>Billets</span></span>
        <span class="score"><b>${fr(q.kwh)}</b><span>kWh</span></span>
      </span></li>`;
  }).join("");
  document.querySelectorAll("#equipes .equipe").forEach((li) => {
    const ouvrir = () => ouvrirAjuster(Number(li.dataset.id));
    li.addEventListener("click", ouvrir);
    li.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ouvrir(); } });
  });
}

function afficherAction() {
  const e = etat();
  const zone = $("#action");
  if (e.phase === "mini_jeu") {
    const p = e.reglages.partie;
    const val = (liste, rang) => liste[Math.min(rang, liste.length - 1)];
    const restants = e.equipes.filter((q) => !ordreMiniJeu.includes(q.id));
    zone.innerHTML = `<div class="bloc-tete" style="margin:0"><h2>Résultat du mini-jeu</h2></div>
      <p class="note">Cliquez les équipes de la première à la dernière.</p>
      <div class="ordre-boutons">${restants.map((q) =>
        `<button class="btn btn-secondaire" data-ajout="${q.id}">${pion(q.id)} ${echapper(q.nom)}</button>`).join("")}</div>
      <ol class="ordre-liste">${ordreMiniJeu.map((id, rang) =>
        `<li><span class="rang">${rang + 1}<sup>${rang ? "e" : "er"}</sup></span>${pion(id)}<span>${echapper(equipe(id).nom)}</span>
         <span class="gain">${val(p.des_mini_jeu, rang)} dés · +${val(p.gains_mini_jeu, rang)} kWh</span></li>`).join("")}</ol>
      <div class="actions">
        <button class="btn btn-secondaire" id="btn-recommencer" ${ordreMiniJeu.length ? "" : "disabled"}>Recommencer</button>
        <button class="btn btn-principal" data-action id="btn-valider" ${restants.length ? 'data-bloque="1"' : ""}>Valider le classement</button>
      </div>`;
    zone.querySelectorAll("[data-ajout]").forEach((b) => b.addEventListener("click", () => {
      ordreMiniJeu.push(Number(b.dataset.ajout));
      // la dernière équipe se place toute seule
      const reste = e.equipes.filter((q) => !ordreMiniJeu.includes(q.id));
      if (reste.length === 1) ordreMiniJeu.push(reste[0].id);
      afficherAction();
      majBoutons();
    }));
    $("#btn-recommencer").addEventListener("click", () => { ordreMiniJeu = []; afficherAction(); majBoutons(); });
    $("#btn-valider").addEventListener("click", () => agir("POST", "/api/mini-jeu", { ordre: ordreMiniJeu }));
  } else if (e.phase === "deplacement") {
    const q = equipe(e.courant);
    const nb = e.des[String(q.id)] || 1;
    const restent = e.file.slice(e.file.indexOf(e.courant) + 1).map((id) => echapper(equipe(id).nom)).join(", ");
    zone.innerHTML = `<div class="au-tour">${pion(q.id)} ${echapper(q.nom)}</div>
      ${e.attente
        ? `<button class="btn btn-principal btn-geant" data-action id="btn-decision">Décision en attente…</button>`
        : `<button class="btn btn-principal btn-geant" data-action id="btn-lancer">Lancer ${nb} dé${nb > 1 ? "s" : ""}</button>`}
      <p class="note">${restent ? `Ensuite : ${restent}` : "Dernière équipe du tour."}</p>`;
    if (e.attente) $("#btn-decision").addEventListener("click", ouvrirDecision);
    else $("#btn-lancer").addEventListener("click", () => agir("POST", "/api/lancer"));
  } else if (e.phase === "fin_tour") {
    const dernier = e.tour >= e.nb_tours;
    zone.innerHTML = `<button class="btn btn-principal btn-geant" data-action id="btn-suivant">${dernier ? "Voir les bonus" : `Passer au tour ${e.tour + 1}`}</button>
      ${!dernier && e.tour + 1 === e.nb_tours ? `<p class="note">C'est le dernier tour : l'équipe dernière recevra un petit coup de pouce.</p>` : ""}`;
    $("#btn-suivant").addEventListener("click", () => agir("POST", "/api/tour-suivant"));
  }
}

// ------------------------------------------------------------------------------ décisions (Billet d'or, Dépanneur, Fantôme)
function ouvrirDialogue(id) {
  return new Promise((resoudre) => {
    const d = $(id);
    d.returnValue = "";
    d.addEventListener("close", () => resoudre(d.returnValue), { once: true });
    d.showModal();
  });
}

let decisionOuverte = false;
async function ouvrirDecision() {
  const att = etat() && etat().attente;
  if (!att || decisionOuverte || occupe) return;
  decisionOuverte = true;
  let decision = null;
  try {
    const q = equipe(att.equipe);
    if (att.type === "billet") {
      $("#billet-titre").innerHTML = `${pion(q.id)} Billet d'or !`;
      $("#billet-texte").textContent = `${q.nom} passe sur le Billet d'or. L'acheter pour ${fr(att.prix)} kWh ? (Il vous reste ${fr(q.kwh)} kWh.)`;
      const choix = await ouvrirDialogue("#dlg-billet");
      if (choix) decision = { acheter: choix === "oui" };
    } else if (att.type === "boutique") {
      const max = etat().reglages.partie.max_objets;
      $("#boutique-titre").innerHTML = `${pion(q.id, "pion pion-grand")} ${echapper(q.nom)}`;
      $("#boutique-kwh").textContent = fr(q.kwh);
      $("#boutique-nb").textContent = `${q.objets.length} sur ${max}`;
      let choisi = null;
      const acheter = $("#boutique-acheter");
      const majChoix = () => {
        document.querySelectorAll("#boutique-objets .objet-carte").forEach((c) => c.setAttribute("aria-checked", String(c.dataset.id === choisi)));
        const o = etat().reglages.objets.find((x) => x.id === choisi);
        acheter.disabled = !o;
        acheter.value = choisi || "";
        acheter.textContent = o ? `Acheter ${o.nom} · ${fr(o.prix)} kWh` : "Choisissez un objet";
      };
      $("#boutique-objets").innerHTML = etat().reglages.objets.map((o) => {
        const manque = o.prix - q.kwh;
        const possede = q.objets.filter((x) => x.id === o.id).length;
        return `<button type="button" class="objet-carte" role="radio" aria-checked="false" data-id="${o.id}" ${manque > 0 ? "disabled" : ""}>
          <span class="objet-image">${imageObjet(o)}</span>
          <span class="objet-entete"><strong>${echapper(o.nom)}</strong><span class="prix">${fr(o.prix)} kWh</span></span>
          <span class="objet-description">${echapper(o.description)}</span>
          ${o.explication ? `<span class="objet-exemple">${echapper(o.explication)}</span>` : ""}
          <span class="objet-etat">${manque > 0 ? `Il manque ${fr(manque)} kWh` : possede ? `Déjà ${possede} dans le sac` : "Disponible"}</span>
        </button>`;
      }).join("");
      document.querySelectorAll("#boutique-objets .objet-carte").forEach((c) => c.addEventListener("click", () => {
        choisi = c.dataset.id; majChoix();
      }));
      majChoix();
      const choix = await ouvrirDialogue("#dlg-boutique");
      if (choix === "rien") decision = { objet: null };
      else if (choix && choix !== "") decision = { objet: choix };
    } else if (att.type === "fantome") {
      let quoi = "kwh";
      let cible = null;
      $("#fantome-titre").innerHTML = `${pion(q.id)} Le fantôme du garage`;
      const btnBillet = $("#fantome-billet");
      btnBillet.textContent = `Un Billet d'or (coûte ${fr(att.prix_billet)} kWh)`;
      btnBillet.disabled = !att.peut_voler_billet;
      const majFantome = () => {
        document.querySelectorAll("#fantome-quoi button").forEach((b) => b.classList.toggle("choisi", b.dataset.quoi === quoi));
        $("#fantome-equipes").innerHTML = etat().equipes.filter((x) => x.id !== q.id).map((x) => {
          const impossible = quoi === "billet" && x.billets < 1;
          return `<button type="button" class="btn btn-secondaire${cible === x.id ? " choisi" : ""}" data-cible="${x.id}" ${impossible ? "disabled" : ""}>
            ${pion(x.id)} ${echapper(x.nom)} · ${fr(x.kwh)} kWh · ${fr(x.billets)} billet(s)</button>`;
        }).join("");
        document.querySelectorAll("#fantome-equipes [data-cible]").forEach((b) => b.addEventListener("click", () => {
          cible = Number(b.dataset.cible); majFantome();
        }));
        $("#fantome-ok").disabled = cible === null;
      };
      document.querySelectorAll("#fantome-quoi button").forEach((b) => { b.onclick = () => { quoi = b.dataset.quoi; cible = null; majFantome(); }; });
      majFantome();
      const choix = await ouvrirDialogue("#dlg-fantome");
      if (choix === "ok" && cible !== null) decision = { cible, quoi };
    }
  } finally {
    decisionOuverte = false;
  }
  // après la fermeture : la réponse peut demander une nouvelle décision (Billet d'or puis Dépanneur)
  if (decision) await agir("POST", "/api/decision", decision);
}

// ------------------------------------------------------------------------------ corrections et journal
let equipeAjustee = null;
function ouvrirAjuster(id) {
  equipeAjustee = id;
  majAjuster();
  $("#dlg-ajuster").showModal();
}
function majAjuster() {
  const q = equipe(equipeAjustee);
  $("#ajuster-titre").innerHTML = `${pion(q.id)} Corriger ${echapper(q.nom)}`;
  $("#ajuster-etat").textContent = `${q.nom} : ${fr(q.kwh)} kWh, ${fr(q.billets)} Billet(s) d'or.`;
}
document.querySelectorAll("#dlg-ajuster [data-delta]").forEach((b) => b.addEventListener("click", async () => {
  const champ = b.parentElement.dataset.champ;
  try {
    const r = await api("POST", "/api/ajuster", { equipe: equipeAjustee, [champ]: Number(b.dataset.delta) });
    partie = r.partie;
    majAjuster();
    afficher();
  } catch (e) { alerte(e.message); }
}));

$("#btn-journal").addEventListener("click", () => {
  $("#journal").innerHTML = etat().journal.map((l) => `<li><span class="tour">Tour ${l.tour}</span>${echapper(l.texte)}</li>`).join("");
  $("#dlg-journal").showModal();
});

async function confirmer(titre, texte) {
  $("#confirmer-titre").textContent = titre;
  $("#confirmer-texte").textContent = texte;
  return (await ouvrirDialogue("#dlg-confirmer")) === "oui";
}

$("#btn-annuler").addEventListener("click", async () => {
  ordreMiniJeu = [];
  derniereScene = null;
  await agir("POST", "/api/annuler");
});

$("#btn-nouvelle").addEventListener("click", async () => {
  if (!(await confirmer("Nouvelle partie ?", "La partie en cours sera archivée (dossier PARTIES/archives) puis remplacée."))) return;
  try {
    partie = await api("DELETE", "/api/partie");
    afficher();
  } catch (e) { alerte(e.message); }
});

// ------------------------------------------------------------------------------ fin de partie
function afficherFin() {
  const e = etat();
  const zone = $("#vue-fin");
  if (e.phase === "bonus") {
    const tous = bonusReveles >= e.bonus.length;
    zone.innerHTML = `<div class="bloc">
        <div class="bloc-tete"><h2>Étoiles bonus : +1 Billet d'or chacune</h2></div>
        <div class="bonus-liste">${e.bonus.map((b, i) => i < bonusReveles
          ? `<div class="bonus-carte"><h3>${echapper(b.titre)}</h3><p class="note">${echapper(b.critere)}</p>
              <div class="gagnants">${b.equipes.length ? b.equipes.map((id) => `<span>${pion(id)}${echapper(equipe(id).nom)}</span>`).join("") : "Personne"}</div>
              ${b.equipes.length ? `<p class="note">${fr(b.valeur)}</p>` : ""}</div>`
          : `<div class="bonus-carte cache"><h3>?</h3></div>`).join("")}</div>
        <div class="actions" style="margin-top:16px">${tous ? "" : `<button class="btn btn-principal" id="btn-reveler">Révéler le bonus suivant</button>`}</div>
      </div>
      ${tous ? `<div class="bloc"><div class="bloc-tete"><h2>Classement final</h2><span class="note">Billets d'or, puis kWh</span></div>
        <ol class="podium">${partie.classement.map((id, rang) => {
          const q = equipe(id);
          return `<li><span class="rang">${rang + 1}<sup>${rang ? "e" : "er"}</sup></span>${pion(id)}<span class="nom">${echapper(q.nom)}</span>
            <span class="score"><b>${fr(q.billets)}</b><span>Billets</span></span><span class="score"><b>${fr(q.kwh)}</b><span>kWh</span></span></li>`;
        }).join("")}</ol>
        <div class="actions" style="margin-top:16px"><button class="btn btn-principal btn-geant" style="width:auto" data-action id="btn-repartition">Choisir les positions de l'échange</button></div>
      </div>` : ""}`;
    if (!tous) $("#btn-reveler").addEventListener("click", () => { bonusReveles += 1; afficherFin(); });
    else $("#btn-repartition").addEventListener("click", () => agir("POST", "/api/repartition/commencer"));
  } else if (e.phase === "repartition") {
    const rep = e.repartition;
    const id = rep.tours[rep.indice];
    zone.innerHTML = `<div class="bloc">
        <div class="bloc-tete"><div class="au-tour">${pion(id)} ${echapper(equipe(id).nom)} choisit une position</div>
          <span class="note">Choix ${rep.indice + 1} sur ${rep.tours.length}</span></div>
        <p class="info" style="margin-bottom:16px">Rappel : dans un échange où l'on peut voler, choisir <strong>en dernier</strong>
          est souvent un avantage. Le premier ouvre un cadeau à l'aveugle !</p>
        <div class="positions">${rep.positions.map((occupant, i) => occupant === null
          ? `<button class="position" data-position="${i + 1}" data-action><b>${i + 1}</b><small>Libre</small></button>`
          : `<button class="position prise" disabled><b>${i + 1}</b>${pion(occupant)}<small>${echapper(equipe(occupant).nom)}</small></button>`).join("")}</div>
      </div>`;
    zone.querySelectorAll("[data-position]").forEach((b) =>
      b.addEventListener("click", () => agir("POST", "/api/repartition", { position: Number(b.dataset.position) })));
  } else if (e.phase === "terminee") {
    const rep = e.repartition;
    zone.innerHTML = `<div class="bloc">
        <div class="bloc-tete"><h2>Ordre de l'échange</h2>
          <button class="btn btn-secondaire btn-petit pas-imprimer" id="btn-imprimer">Imprimer</button></div>
        <p class="note" style="margin-bottom:12px">Chaque équipe répartit elle-même ses positions entre ses membres.</p>
        <ol class="ordre-final">${rep.positions.map((id, i) =>
          `<li><span class="rang">${i + 1}</span>${pion(id)}<span>${echapper(equipe(id).nom)}</span></li>`).join("")}</ol>
      </div>
      <div class="bloc">
        <div class="bloc-tete"><h2>Objets à utiliser pendant l'échange</h2><span class="note">Cocher un objet quand il est utilisé</span></div>
        <div class="objets-equipes">${e.equipes.map((q) => `<div class="objets-equipe">
          <h3>${pion(q.id)} ${echapper(q.nom)}</h3>
          ${q.objets.length ? q.objets.map((o, k) => `<label class="objet-ligne${o.utilise ? " utilise" : ""}">
            <input type="checkbox" data-equipe="${q.id}" data-indice="${k}" ${o.utilise ? "checked" : ""}>
            <span class="objet-vignette">${imageObjet(objetCfg(o.id))}</span>
            <span><strong>${echapper(objetCfg(o.id).nom)}</strong><small>${echapper(objetCfg(o.id).description)}</small></span></label>`).join("")
            : `<p class="note">Aucun objet.</p>`}</div>`).join("")}</div>
      </div>`;
    $("#btn-imprimer").addEventListener("click", () => window.print());
    zone.querySelectorAll("[data-indice]").forEach((c) => c.addEventListener("change", () =>
      agir("POST", "/api/objet", { equipe: Number(c.dataset.equipe), indice: Number(c.dataset.indice) })));
  }
}

demarrer();
