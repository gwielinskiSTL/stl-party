/* =====================================================================================
   STL Party — interface. Le serveur applique les règles (app/jeu.py) ; cette page affiche
   l'état et rejoue les animations (dés, déplacement des pions, cartes d'événement).
   ===================================================================================== */
"use strict";

const $ = (sel) => document.querySelector(sel);
const PHASES = {
  mini_jeu: "Mini-jeu", deplacement: "Déplacements", fin_tour: "Fin du tour",
  bonus: "Bonus", terminee: "Pige",
};
const SYMBOLES = { T: "T", R: "+", B: "−", E: "?", I: "!", F: "◐", D: "⇄", M: "◆" };
const LIBELLES = { T: "Terminus", R: "Recharge", B: "Bouchon", E: "Événement", I: "Inspecteur", F: "Fantôme", D: "Détour", M: "Dépanneur" };
const FANTOME = `<path class="fantome" d="M-11 6v-12a11 11 0 0 1 22 0v12l-3.7-3.5-3.6 3.5-3.7-3.5-3.7 3.5-3.6-3.5z" transform="translate(0,-6)"></path>
  <circle class="oeil" cx="-4" cy="-10" r="2.2"></circle><circle class="oeil" cx="4" cy="-10" r="2.2"></circle>`;
const DECALAGES = [[-16, -16], [16, -16], [-16, 16], [16, 16], [0, 0], [0, -26], [0, 26], [-26, 0]];
// Animations : actives par défaut (c'est un jeu projeté). Avec [application] animations = "systeme",
// on suit le réglage du poste (« Afficher les animations dans Windows » désactivé → animations réduites).
const REDUIT_PAR_LE_SYSTEME = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let MOUVEMENT_REDUIT = false;
function reglerAnimations(mode) {
  MOUVEMENT_REDUIT = mode === "systeme" && REDUIT_PAR_LE_SYSTEME;
  document.body.classList.toggle("mouvement-reduit", MOUVEMENT_REDUIT);
  console.info(`STL Party — animations ${MOUVEMENT_REDUIT ? "réduites (réglage du poste)" : "actives"}` +
    (REDUIT_PAR_LE_SYSTEME ? " · le poste demande de réduire les animations" : ""));
}

let cfg = null;            // configuration (pour l'écran de création)
let partie = null;         // vue renvoyée par le serveur : {etat, classement, mini_jeu, ...}
let positions = {};        // positions affichées des pions (diffèrent de l'état pendant une animation)
let occupe = false;        // une animation ou une requête est en cours
let ordreMiniJeu = [];     // classement du mini-jeu en cours de saisie
let bonusReveles = 0;
let placesRevelees = 0;    // places du classement final déjà dévoilées, en partant de la dernière
// une partie rechargée déjà tirée n'a pas à rejouer le suspense
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

$("#btn-son").setAttribute("aria-pressed", String(SONS.actif));
$("#btn-son").addEventListener("click", () => $("#btn-son").setAttribute("aria-pressed", String(SONS.basculer())));
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
  reglerAnimations(cfg.animations);
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
  $("#vue-fin").hidden = !e || !["bonus", "terminee"].includes(e.phase);
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

// ---- équipes au hasard
const personnesSaisies = () => $("#hasard-personnes").value.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
$("#hasard-personnes").addEventListener("input", () => {
  const n = personnesSaisies().length;
  $("#hasard-compte").textContent = `${fr(n)} participant${n > 1 ? "s" : ""}`;
});
$("#btn-hasard").addEventListener("click", async () => {
  alerte("");
  const nb = Number($("#hasard-nb").value) || 5;
  try {
    const r = await api("POST", "/api/equipes/aleatoires", { personnes: personnesSaisies(), nb_equipes: nb });
    equipesConfig = r.equipes.map((joueurs, i) => ({
      nom: (equipesConfig && equipesConfig[i] && equipesConfig[i].nom) || `Équipe ${i + 1}`,
      joueurs: joueurs.join("\n"),
    }));
    afficherConfig();
    $("#config-equipes").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) { alerte(e.message); }
});

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
  placesRevelees = 0;
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
    return `<g class="case c-${c}" data-i="${i}" transform="translate(${x},${y})"><title>${LIBELLES[c]}</title>
      <rect class="halo-case" x="-32" y="-32" width="64" height="64"></rect>
      <g class="case-corps">
      <rect x="-32" y="-32" width="64" height="64"></rect>
      ${c === "E" ? '<rect class="ruban" x="-4" y="-32" width="8" height="64"></rect><rect class="ruban" x="-32" y="-4" width="64" height="8"></rect>' : ""}
      ${c === "F" ? FANTOME : `<text class="symbole" y="-6">${valeurs[c] || SYMBOLES[c]}</text>`}
      <text class="libelle" y="20">${LIBELLES[c]}</text></g></g>`;
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
      `<g class="p-${q.id % 8}" data-id="${q.id}"><title>${echapper(q.nom)}</title><g class="saut"><circle r="14"></circle><text>${q.id + 1}</text></g></g>`).join("");
  }
  // le pion actif est dessiné en dernier, par-dessus les autres
  e.equipes.forEach((q) => {
    const g = groupe.querySelector(`[data-id="${q.id}"]`);
    const [x, y] = pts[positions[q.id] ?? q.position];
    const [dx, dy] = DECALAGES[q.id % 8];
    g.style.transform = `translate(${x + dx}px, ${y + dy}px)`;   // en CSS pour profiter de la transition
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

// Page de garde de chaque événement : surtitre et phrase sous le titre, selon le code envoyé par le serveur
const GARDES = {
  terminus: ["Terminus", "passe au Terminus"],
  billet_trop_cher: ["Billet d'or", "passe sur le Billet d'or"],
  billet_achete: ["Billet d'or", "achète un Billet d'or"],
  depanneur_passe: ["Dépanneur", "passe devant le dépanneur"],
  achat: ["Dépanneur", "repart avec un objet"],
  recharge: ["Case Recharge", "se branche"],
  bouchon: ["Case Bouchon", "est coincé dans le trafic"],
  inspecteur: ["Case Inspecteur", "se fait contrôler"],
  fantome: ["Case Fantôme", "réveille le fantôme"],
  fantome_resultat: ["Fantôme du garage", "envoie le fantôme"],
  detour: ["Case Détour", "échangent"],
  dernier_arret: ["Dernier tour", "reçoit un coup de pouce"],
};

/** Page de garde plein écran : grande illustration, attend « Continuer » (ou Entrée). */
async function montrerGrandEcran(ev, origine) {
    const ecran = $("#ecran-geant");
    ecran.className = `ecran-geant ${ev.ton || ""}${ev.classe ? ` ${ev.classe}` : ""}`;
    $("#geant-illustration").innerHTML = ev.illustration || ILLUSTRATIONS.evenement(ev.code);
    const [surtitre, phrase] = GARDES[ev.code] || ["Case Événement", "tombe sur une case Événement"];
    $("#geant-surtitre").textContent = ev.surtitre || surtitre;
    $("#geant-titre").textContent = ev.titre;
    $("#geant-description").textContent = ev.texte;
    if (ev.code === "detour" && ev.equipes) {
      $("#geant-equipe").innerHTML = ev.equipes.map((id) => `${pion(id, "pion pion-grand")} <span>${echapper(equipe(id).nom)}</span>`).join(" <span>⇄</span> ");
    } else if (ev.equipe !== undefined) {
      $("#geant-equipe").innerHTML = `${pion(ev.equipe, "pion pion-grand")} <span>${echapper(equipe(ev.equipe).nom)} ${echapper(ev.phrase_equipe || phrase)}</span>`;
    } else {
      $("#geant-equipe").innerHTML = "";
    }
    if (ev.objet) {   // prime ou achat : on montre l'objet obtenu
      const o = etat().reglages.objets.find((x) => x.id === ev.objet);
      if (o) $("#geant-illustration").innerHTML = imageObjet(o);
    }
    // ouverture en cercle depuis la case (ou le centre de l'écran)
    const x = origine ? origine.x : innerWidth / 2;
    const y = origine ? origine.y : innerHeight / 2;
    const rayon = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const cercle = (r) => `circle(${r}px at ${x}px ${y}px)`;
    ecran.style.setProperty("--x", `${x}px`);
    ecran.style.setProperty("--y", `${y}px`);
    ecran.hidden = false;
    ecran.classList.add("entree");
    if (!MOUVEMENT_REDUIT && ecran.animate) {
      await ecran.animate([{ clipPath: cercle(0) }, { clipPath: cercle(rayon) }],
        { duration: 800, easing: "cubic-bezier(.65,0,.35,1)" }).finished;
    }
    const bouton = $("#geant-continuer");
    bouton.focus();
    await new Promise((ok) => bouton.addEventListener("click", ok, { once: true }));
    // fermeture : le cercle se referme sur la case
    ecran.classList.remove("entree");
    if (!MOUVEMENT_REDUIT && ecran.animate) {
      await ecran.animate([{ clipPath: cercle(rayon) }, { clipPath: cercle(0) }],
        { duration: 550, easing: "cubic-bezier(.65,0,.35,1)" }).finished;
    }
    ecran.hidden = true;
}

// ------------------------------------------------------------------------------ animations
const PAS_MS = 430;   // durée d'un arrêt : le pion avance posément

function sauter(id) {
  const g = document.querySelector(`#pions [data-id="${id}"] .saut`);
  if (!g || MOUVEMENT_REDUIT) return;
  g.classList.remove("bondit");
  void g.getBoundingClientRect();   // relance l'animation CSS
  g.classList.add("bondit");
}

function allumerPassage(i) {
  const c = document.querySelector(`#plateau-svg .case[data-i="${i}"]`);
  if (!c) return;
  c.classList.remove("passage");
  void c.getBoundingClientRect();
  c.classList.add("passage");
}

/** Coup de projecteur : le plateau s'assombrit, la case grossit et brille. */
async function illuminer(i) {
  const svgEl = $("#plateau-svg");
  const c = svgEl && document.querySelector(`#plateau-svg .case[data-i="${i}"]`);
  if (!c || $("#vue-jeu").hidden) return;
  c.parentNode.insertBefore(c, $("#pions"));   // au-dessus des autres cases, sous les pions
  svgEl.classList.add("projecteur");
  c.classList.add("illuminee");
  await attendre(1300);
}

function eteindre() {
  const svgEl = $("#plateau-svg");
  if (svgEl) svgEl.classList.remove("projecteur");
  document.querySelectorAll("#plateau-svg .case.illuminee").forEach((c) => c.classList.remove("illuminee"));
}

function centreCase(i) {
  const c = document.querySelector(`#plateau-svg .case[data-i="${i}"] .case-corps`);
  if (!c || $("#vue-jeu").hidden) return null;
  const r = c.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Montre les événements survenus après « etape » cases (tous si etape est null). */
async function annoncer(anim, etape) {
  const fin = (anim.chemin || []).length;
  for (const ev of anim.evenements || []) {
    if (etape !== null && (ev.etape ?? fin) !== etape) continue;
    // la case de l'événement s'illumine, puis la page de garde s'ouvre en cercle depuis cette case
    const i = ev.code === "terminus" ? 0 : positions[ev.equipe ?? anim.equipe];
    await illuminer(i);
    await montrerGrandEcran(ev, centreCase(i));
    eteindre();
    if (ev.billet) dessinerPlateau();   // le Billet d'or change de place ; les pions restent où ils sont
    if (ev.saut !== undefined || ev.echange) { synchroniserPositions(); dessinerPlateau(); }   // téléportations
  }
}

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
    if (!(anim.des && anim.des.length) && anim.chemin.length) {   // après un achat : on reprend la route
      $("#scene").innerHTML = `<div class="scene-titre">${pion(id)} ${echapper(equipe(id).nom)}</div>
        <div class="total" id="total">On reprend la route : ${anim.chemin.length} arrêt${anim.chemin.length > 1 ? "s" : ""}</div>`;
    }
    partie = nouvelle;   // positions affichées : la table « positions », mise à jour arrêt par arrêt
    await annoncer(anim, 0);   // ce qui arrive avant de bouger (ex. achat juste confirmé)
    for (const [k, pos] of anim.chemin.entries()) {
      const reste = anim.chemin.length - k - 1;
      positions[id] = pos;
      dessinerPions(id);
      sauter(id);
      allumerPassage(pos);
      if ($("#total")) $("#total").textContent = reste ? `Encore ${reste} arrêt${reste > 1 ? "s" : ""}…` : "Arrivé !";
      await attendre(PAS_MS);
      await annoncer(anim, k + 1);   // le pion s'arrête le temps de l'événement survenu sur cette case
    }
  } else {
    partie = nouvelle;
    await annoncer(anim, null);
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
let gardeDepanneur = null;   // arrêt (dépanneur ou Billet d'or) dont la page de garde a déjà été montrée
async function ouvrirDecision() {
  const att = etat() && etat().attente;
  if (!att || decisionOuverte || occupe) return;
  decisionOuverte = true;
  let decision = null;
  try {
    const q = equipe(att.equipe);
    if (att.type === "billet") {
      const cle = `billet-${etat().tour}-${q.id}-${q.position}-${att.reste}`;
      if (gardeDepanneur !== cle) {
        gardeDepanneur = cle;
        await illuminer(q.position);
        await montrerGrandEcran({
          code: "billet", titre: "Billet d'or", surtitre: `Arrêt ${q.position + 1}`, equipe: q.id,
          phrase_equipe: "passe sur le Billet d'or", illustration: ILLUSTRATIONS.billet(),
          texte: `À vendre pour ${fr(att.prix)} kWh. ${q.nom} en a ${fr(q.kwh)}. On l'achète ?`,
        }, centreCase(q.position));
        eteindre();
      }
      $("#billet-titre").innerHTML = `${pion(q.id)} Billet d'or !`;
      $("#billet-texte").textContent = `${q.nom} passe sur le Billet d'or. L'acheter pour ${fr(att.prix)} kWh ? (Il vous reste ${fr(q.kwh)} kWh.)`;
      const choix = await ouvrirDialogue("#dlg-billet");
      if (choix) decision = { acheter: choix === "oui" };
    } else if (att.type === "boutique") {
      const max = etat().reglages.partie.max_objets;
      // page de garde, une seule fois par arrêt (pas de nouveau si on rouvre la décision)
      const cle = `${etat().tour}-${q.id}-${q.position}-${att.reste}`;
      if (gardeDepanneur !== cle) {
        gardeDepanneur = cle;
        await illuminer(q.position);
        await montrerGrandEcran({
          classe: "garde-depanneur", surtitre: `Arrêt ${q.position + 1}`, titre: "Dépanneur",
          texte: `${fr(q.kwh)} kWh en poche, ${q.objets.length} objet${q.objets.length > 1 ? "s" : ""} sur ${max} dans le sac. On entre magasiner ?`,
          equipe: q.id, phrase_equipe: "s'arrête au dépanneur", illustration: ILLUSTRATIONS.depanneur(),
        }, centreCase(q.position));
        eteindre();
      }
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

// ------------------------------------------------------------------------------ fin de partie : suspense
// Étoiles bonus une à une (roulette qui ralentit), puis classement de la dernière place vers la première,
// et grande finale en duel pour les deux premières places. Tout est rejoué côté navigateur : le serveur a déjà
// calculé bonus et classement.

const confettis = () => {
  const zone = $("#confettis");
  if (MOUVEMENT_REDUIT || !zone) return;
  zone.innerHTML = Array.from({ length: 160 }, (_, k) => {
    const d = (2.6 + Math.random() * 2.4).toFixed(2);
    return `<i class="cf-${k % 4}" style="left:${(Math.random() * 100).toFixed(1)}%;animation-duration:${d}s;` +
      `animation-delay:${(Math.random() * 0.8).toFixed(2)}s;--tour:${Math.round(360 + Math.random() * 720)}deg;` +
      `--derive:${Math.round(Math.random() * 160 - 80)}px;width:${6 + Math.round(Math.random() * 6)}px"></i>`;
  }).join("");
  setTimeout(() => { zone.innerHTML = ""; }, 6500);
};

/** Ouvre le rideau plein écran, attend « Continuer », le referme. */
async function rideau(contenu, deroulement) {
  const r = $("#revelation");
  r.innerHTML = `<div class="revelation-int">${contenu}</div>
    <button class="btn geant-continuer revelation-continuer" id="revelation-continuer" hidden>Continuer</button>`;
  r.hidden = false;
  if (!MOUVEMENT_REDUIT && r.animate) {
    await r.animate([{ clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(75% at 50% 50%)" }],
      { duration: 700, easing: "cubic-bezier(.65,0,.35,1)" }).finished;
  }
  await deroulement(r);
  const bouton = $("#revelation-continuer");
  bouton.hidden = false;
  bouton.focus();
  await new Promise((ok) => bouton.addEventListener("click", ok, { once: true }));
  if (!MOUVEMENT_REDUIT && r.animate) {
    await r.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(1.04)" }], { duration: 350 }).finished;
  }
  r.hidden = true;
  r.innerHTML = "";
}

/** Étoile bonus : les équipes défilent de plus en plus lentement, puis s'arrêtent sur la gagnante. */
async function revelerBonus(b, rang, total) {
  const equipes = etat().equipes;
  await rideau(`
    <p class="surtitre">Étoile bonus ${rang} sur ${total}</p>
    <h2 class="revelation-titre">${echapper(b.titre)}</h2>
    <p class="revelation-texte">Pour l'équipe avec ${echapper(b.critere)}</p>
    <div class="roulette">${equipes.map((q) =>
      `<div class="roulette-case" data-id="${q.id}">${pion(q.id, "pion pion-grand")}<span>${echapper(q.nom)}</span></div>`).join("")}</div>
    <div class="revelation-resultat" id="bonus-resultat"></div>`, async () => {
    const cases = [...document.querySelectorAll(".roulette-case")];
    const gagnants = b.equipes;
    // trajet : ~3 tours complets, puis arrêt sur le premier gagnant (ou nulle part s'il n'y en a pas)
    const cible = gagnants.length ? equipes.findIndex((q) => q.id === gagnants[0]) : -1;
    const pas = 3 * cases.length + (cible >= 0 ? cible : Math.floor(Math.random() * cases.length));
    let delai = 55;
    for (let k = 0; k <= pas; k++) {
      cases.forEach((c, i) => c.classList.toggle("vise", i === k % cases.length));
      SONS.tic(1 + (k % 2) * 0.12);
      await attendre(delai);
      if (k > pas - 9) delai *= 1.32;      // les derniers crans ralentissent : suspense
      else delai = Math.min(delai * 1.03, 120);
    }
    await attendre(450);
    cases.forEach((c) => c.classList.remove("vise"));
    const res = $("#bonus-resultat");
    if (!gagnants.length) {
      SONS.egalite();
      res.innerHTML = `<p class="revelation-texte">Personne ! Aucune équipe ne remporte cette étoile.</p>`;
      return;
    }
    gagnants.forEach((id) => document.querySelector(`.roulette-case[data-id="${id}"]`).classList.add("gagnante"));
    SONS.ding();
    res.innerHTML = `<div class="billet-gagne">${ILLUSTRATIONS.billet()}</div>
      <p class="revelation-texte"><strong>${gagnants.map((id) => echapper(equipe(id).nom)).join(" et ")}</strong>
      ${gagnants.length > 1 ? "remportent" : "remporte"} +1 Billet d'or <span class="note-claire">(${fr(b.valeur)})</span></p>`;
  });
}

const attendreCompteur = async (el, cible, duree) => {
  const debut = performance.now();
  return new Promise((ok) => {
    const pas = (t) => {
      const p = Math.min(1, (t - debut) / Math.max(1, duree));
      el.textContent = fr(Math.round(cible * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(pas); else ok();
    };
    if (MOUVEMENT_REDUIT) { el.textContent = fr(cible); ok(); } else requestAnimationFrame(pas);
  });
};

/** Une place du classement (de la dernière à la 3e) : roulement de tambour, puis la carte se retourne. */
async function revelerPlace(rang) {
  const li = document.querySelector(`.podium li[data-rang="${rang}"]`);
  if (!li) return;
  li.scrollIntoView({ block: "center", behavior: MOUVEMENT_REDUIT ? "auto" : "smooth" });
  li.classList.add("suspense");
  SONS.tambour(1.8);
  await attendre(1900);
  li.classList.remove("suspense");
  li.classList.add("revelee");
  SONS.coup();
  const q = equipe(partie.classement[rang - 1]);
  li.innerHTML = htmlPlace(rang, q);
  await Promise.all([
    attendreCompteur(li.querySelector("[data-compteur=billets]"), q.billets, 700),
    attendreCompteur(li.querySelector("[data-compteur=kwh]"), q.kwh, 900),
  ]);
}

const htmlPlace = (rang, q) => `<span class="rang">${rang}<sup>${rang > 1 ? "e" : "er"}</sup></span>${pion(q.id)}
  <span class="nom">${echapper(q.nom)}</span>
  <span class="score"><b data-compteur="billets">${fr(q.billets)}</b><span>Billets</span></span>
  <span class="score"><b data-compteur="kwh">${fr(q.kwh)}</b><span>kWh</span></span>`;

/** Grande finale : les deux premières équipes, compteurs côte à côte, départage s'il le faut. */
async function grandeFinale() {
  const [id1, id2] = partie.classement;
  const a = equipe(id1), b = equipe(id2);
  // affichées dans un ordre neutre (par numéro d'équipe) pour ne rien trahir
  const [g, d] = a.id < b.id ? [a, b] : [b, a];
  const colonne = (q) => `<div class="finaliste" data-id="${q.id}">
      ${pion(q.id, "pion pion-geant")}<h3>${echapper(q.nom)}</h3>
      <div class="finaliste-score"><b data-billets>0</b><span>Billets d'or</span></div>
      <div class="finaliste-score petit"><b data-kwh>?</b><span>kWh</span></div>
      <div class="finaliste-rang" data-rang></div></div>`;
  await rideau(`
    <p class="surtitre">Pour la première place</p>
    <h2 class="revelation-titre">Grande finale</h2>
    <div class="duel">${colonne(g)}<div class="duel-vs">contre</div>${colonne(d)}</div>
    <p class="revelation-texte" id="duel-message">Comptons les Billets d'or…</p>`, async () => {
    const el = (q, sel) => document.querySelector(`.finaliste[data-id="${q.id}"] ${sel}`);
    await attendre(1200);
    // billets : un à la fois, de plus en plus lentement ; une équipe qui s'arrête s'éteint
    const max = Math.max(g.billets, d.billets);
    let delai = 700;
    for (let n = 1; n <= max; n++) {
      SONS.tambour(delai / 1000 * 0.8);
      await attendre(delai);
      for (const q of [g, d]) {
        if (q.billets >= n) { el(q, "[data-billets]").textContent = fr(n); el(q, "[data-billets]").classList.remove("pulse-chiffre"); void el(q, "[data-billets]").offsetWidth; el(q, "[data-billets]").classList.add("pulse-chiffre"); SONS.tic(1.3); }
        else document.querySelector(`.finaliste[data-id="${q.id}"]`).classList.add("arretee");
      }
      delai = Math.min(1400, delai * 1.15);
    }
    await attendre(800);
    const message = $("#duel-message");
    if (a.billets === b.billets) {
      document.querySelectorAll(".finaliste").forEach((f) => f.classList.remove("arretee"));
      message.textContent = "Égalité de Billets d'or ! Départage aux kWh…";
      message.classList.add("alerte-jeu");
      SONS.egalite();
      await attendre(1600);
      SONS.tambour(2.6);
      await Promise.all([
        attendreCompteur(el(g, "[data-kwh]"), g.kwh, 2800),
        attendreCompteur(el(d, "[data-kwh]"), d.kwh, 2800),
      ]);
      if (a.kwh === b.kwh) {
        message.textContent = "Encore égalité ! Départage aux résultats des mini-jeux…";
        SONS.egalite();
        await attendre(2000);
      }
    } else {
      el(g, "[data-kwh]").textContent = fr(g.kwh);
      el(d, "[data-kwh]").textContent = fr(d.kwh);
    }
    message.classList.remove("alerte-jeu");
    SONS.tambour(1.6);
    await attendre(1700);
    const vainqueur = document.querySelector(`.finaliste[data-id="${a.id}"]`);
    const second = document.querySelector(`.finaliste[data-id="${b.id}"]`);
    vainqueur.classList.add("vainqueur");
    second.classList.add("arretee");
    vainqueur.querySelector("[data-rang]").innerHTML = "1<sup>er</sup>";
    second.querySelector("[data-rang]").innerHTML = "2<sup>e</sup>";
    message.innerHTML = `<strong>${echapper(a.nom)}</strong> remporte STL Party : meilleures chances à la pige !`;
    SONS.tada();
    confettis();
  });
}

function afficherBonusEtClassement(zone) {
  const e = etat();
  const n = partie.classement.length;
  const bonusFinis = bonusReveles >= e.bonus.length;
  const prochainBonus = e.bonus[bonusReveles];
  const prochaineplace = n - placesRevelees;          // rang à dévoiler
  const finale = prochaineplace <= 2;
  const tout = placesRevelees >= n;
  zone.innerHTML = `<div class="bloc">
      <div class="bloc-tete"><h2>Étoiles bonus : +1 Billet d'or chacune</h2></div>
      <div class="bonus-liste">${e.bonus.map((b, i) => i < bonusReveles
        ? `<div class="bonus-carte"><h3>${echapper(b.titre)}</h3><p class="note">${echapper(b.critere)}</p>
            <div class="gagnants">${b.equipes.length ? b.equipes.map((id) => `<span>${pion(id)}${echapper(equipe(id).nom)}</span>`).join("") : "Personne"}</div>
            ${b.equipes.length ? `<p class="note">${fr(b.valeur)}</p>` : ""}</div>`
        : `<div class="bonus-carte cache"><h3>?</h3></div>`).join("")}</div>
      ${bonusFinis ? "" : `<div class="actions" style="margin-top:16px"><button class="btn btn-principal btn-geant" style="width:auto" id="btn-reveler">
        Révéler l'étoile « ${echapper(prochainBonus.titre)} »</button></div>`}
    </div>
    ${bonusFinis ? `<div class="bloc">
      <div class="bloc-tete"><h2>Classement final</h2><span class="note">Billets d'or, puis kWh</span></div>
      <ol class="podium">${partie.classement.map((id, i) => {
        const rang = i + 1;
        return rang > n - placesRevelees
          ? `<li class="revelee-fixe" data-rang="${rang}">${htmlPlace(rang, equipe(id))}</li>`
          : `<li class="cachee" data-rang="${rang}"><span class="rang">${rang}<sup>${rang > 1 ? "e" : "er"}</sup></span>
              <span class="pion pion-mystere" aria-hidden="true">?</span><span class="nom">???</span></li>`;
      }).join("")}</ol>
      <div class="actions" style="margin-top:16px">${tout
        ? `<button class="btn btn-principal btn-geant" style="width:auto" data-action id="btn-pige">Tirer la pige des cadeaux</button>`
        : `<button class="btn btn-principal btn-geant" style="width:auto" id="btn-place">${finale ? "Grande finale : 1re et 2e places" : `Révéler la ${prochaineplace}e place`}</button>`}</div>
    </div>` : ""}`;
  if (!bonusFinis) {
    $("#btn-reveler").addEventListener("click", async (ev) => {
      ev.currentTarget.disabled = true;
      await revelerBonus(prochainBonus, bonusReveles + 1, e.bonus.length);
      bonusReveles += 1;
      afficherFin();
    });
  } else if (!tout) {
    $("#btn-place").addEventListener("click", async (ev) => {
      ev.currentTarget.disabled = true;
      if (finale) {
        await grandeFinale();
        placesRevelees = n;
      } else {
        await revelerPlace(prochaineplace);
        placesRevelees += 1;
      }
      afficherFin();
    });
  } else {
    $("#btn-pige").addEventListener("click", tirerPige);
  }
}

// ------------------------------------------------------------------------------ fin de partie
function afficherFin() {
  const e = etat();
  const zone = $("#vue-fin");
  if (e.phase === "bonus") {
    afficherBonusEtClassement(zone);
  } else if (e.phase === "terminee") {
    // Écran public : la pige est faite, mais son détail reste sur la page privée de l'animateur.
    const p = e.pige || {};
    zone.innerHTML = `<div class="bloc pige-publique">
        <div class="pige-illustration">${ILLUSTRATIONS.pige()}</div>
        <div class="pige-texte">
          <p class="surtitre">Échange de cadeaux</p>
          <h2>La pige est faite !</h2>
          <p class="pige-description">${fr(p.participants || 0)} participants ont été classés au hasard, avec plus de chances
            pour les meilleures équipes. ${p.objets ? `Les ${fr(p.objets)} objets achetés ont été distribués en secret aux membres des équipes.` : ""}</p>
          <p class="info">Le classement est <strong>privé</strong> : l'animateur l'ouvre sur son poste (pas sur l'écran projeté)
            et appelle les participants dans l'ordre.</p>
          <div class="actions" style="justify-content:flex-start">
            <a class="btn btn-principal btn-geant" style="width:auto" href="/prive" target="_blank" rel="noopener">Ouvrir le classement privé</a>
          </div>
        </div>
      </div>
      <div class="bloc">
        <div class="bloc-tete"><h2>Classement final du jeu</h2><span class="note">Plus le rang est bon, plus les membres avaient de chances à la pige</span></div>
        <ol class="podium">${partie.classement.map((id, i) => `<li class="revelee-fixe">${htmlPlace(i + 1, equipe(id))}</li>`).join("")}</ol>
      </div>`;
  }
}

/** Tirage de la pige : confirmation, roulement de tambour, puis le serveur tire et garde le résultat. */
async function tirerPige() {
  if (!(await confirmer("Tirer la pige des cadeaux ?",
    "Le classement de tous les participants sera tiré au hasard, pondéré par le classement final, et les objets seront distribués aux joueurs. Le résultat ne s'affichera que sur la page privée de l'animateur."))) return;
  SONS.tambour(1.6);
  await attendre(1700);
  await agir("POST", "/api/pige");
  if (etat() && etat().phase === "terminee") { SONS.tada(); confettis(); }
}

demarrer();
