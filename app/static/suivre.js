/* =====================================================================================
   STL Party — suivi sur cellulaire, lecture seule. Interroge /api/suivi toutes les 3 s.
   Le serveur ne renvoie que ce que l'écran projeté a déjà montré ; les points sont cachés pendant le
   dévoilement final et l'ordre de pige n'apparaît que si l'animateur le publie.
   ===================================================================================== */
"use strict";

const $ = (sel) => document.querySelector(sel);
const fr = (n) => Number(n).toLocaleString("fr-CA");
const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pion = (id) => `<span class="pion eq-${id % 8}" aria-hidden="true">${Number(id) + 1}</span>`;
const INTERVALLE_MS = 3000;

let dernier = "";          // dernière réponse, pour ne redessiner que si quelque chose change
let derniereReussite = 0;
let recherche = "";

// ------------------------------------------------------------------ onglets (seule « interaction » : naviguer)
document.querySelectorAll(".suivi-onglets [data-onglet]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".suivi-onglets [data-onglet]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  document.querySelectorAll(".suivi-panneau").forEach((p) => { p.hidden = p.id !== `panneau-${b.dataset.onglet}`; });
  try { sessionStorage.setItem("stl-party.onglet", b.dataset.onglet); } catch (_) { /* rien */ }
}));
try {
  const o = sessionStorage.getItem("stl-party.onglet");
  if (o) document.querySelector(`[data-onglet="${o}"]`)?.click();
} catch (_) { /* rien */ }

// ------------------------------------------------------------------ rendu
function rendre(v) {
  document.body.classList.toggle("noel", !!v.noel);
  if (!v.partie) {
    $("#statut").innerHTML = `<p class="surtitre">En attente</p><h1>La partie n'est pas commencée</h1>
      <p class="note">Cette page se mettra à jour toute seule.</p>`;
    ["equipes", "inventaire", "pige"].forEach((p) => { $(`#panneau-${p}`).innerHTML = ""; });
    return;
  }
  const nom = (id) => echapper(v.equipes.find((e) => e.id === id)?.nom ?? "");

  // statut
  let detail = "";
  if (v.phase === "mini_jeu" && v.mini_jeu) detail = `<p class="suivi-detail"><strong>${echapper(v.mini_jeu.nom)}</strong> · ${echapper(v.mini_jeu.description)}</p>`;
  else if (v.phase === "deplacement" && v.courant !== null) detail = `<p class="suivi-detail">${pion(v.courant_id)} Au tour de <strong>${echapper(v.courant)}</strong></p>`;
  else if (v.resultats_caches) detail = `<p class="suivi-detail">Les résultats sont dévoilés en ce moment sur l'écran de la salle… Regardez l'écran !</p>`;
  else if (v.phase === "terminee") detail = `<p class="suivi-detail">${v.pige.publiee ? "L'ordre de la pige est publié : voir l'onglet Pige." : "La pige est faite. L'animateur dévoilera l'ordre."}</p>`;
  $("#statut").innerHTML = `<p class="surtitre">${v.phase === "terminee" || v.phase === "bonus" ? "Fin de partie" : `Tour ${Math.min(v.tour, v.nb_tours)} sur ${v.nb_tours}`}</p>
    <h1>${echapper(v.etape)}</h1>${detail}`;

  // équipes
  $("#panneau-equipes").innerHTML = `<ol class="suivi-equipes">${v.equipes.map((e) => `
      <li class="suivi-equipe${e.id === v.courant_id && v.phase === "deplacement" ? " actif" : ""}">
        <div class="suivi-equipe-tete">
          ${e.rang ? `<span class="suivi-rang">${e.rang}<sup>${e.rang > 1 ? "e" : "er"}</sup></span>` : ""}
          ${pion(e.id)}<span class="suivi-equipe-nom">${echapper(e.nom)}</span>
          ${e.des ? `<span class="badge-des">${e.des} dés</span>` : ""}
        </div>
        <div class="suivi-scores">
          <span class="score"><b>${e.billets ?? "?"}</b><span>Billets d'or</span></span>
          <span class="score"><b>${e.kwh === null ? "?" : fr(e.kwh)}</b><span>kWh</span></span>
          <span class="score"><b>${e.arret}</b><span>Arrêt</span></span>
          <span class="score"><b>${e.objets.length}</b><span>Objets</span></span>
        </div>
        <details><summary>${e.joueurs.length} joueurs</summary><p>${e.joueurs.map(echapper).join(" · ")}</p></details>
      </li>`).join("")}</ol>
    ${v.journal.length ? `<h2 class="suivi-titre">Derniers événements</h2>
      <ul class="suivi-journal">${v.journal.map((t) => `<li>${echapper(t)}</li>`).join("")}</ul>` : ""}`;

  // inventaire
  $("#panneau-inventaire").innerHTML = `<p class="note suivi-intro">Objets achetés au dépanneur : ceux « sur le plateau » servent pendant la partie, les autres pendant l'échange de cadeaux.
      ${v.pige.faite ? "Ils ont été remis en secret à des membres de chaque équipe." : ""}</p>
    ${v.equipes.map((e) => `<div class="suivi-inventaire">
      <h2>${pion(e.id)} ${echapper(e.nom)}</h2>
      ${e.objets.length ? e.objets.map((o) => `<div class="objet-ligne${o.utilise ? " utilise" : ""}">
          <span class="objet-vignette">${ILLUSTRATIONS.objet(o.id)}</span>
          <span><strong>${echapper(o.nom)}</strong>${o.utilise ? " · utilisé" : ""}
            <span class="etiquette-usage ${o.usage === "jeu" ? "jeu" : ""}">${o.usage === "jeu" ? "Sur le plateau" : "Pendant l'échange"}</span>
            <small>${echapper(o.description)}</small></span></div>`).join("")
        : `<p class="note">Aucun objet pour l'instant.</p>`}</div>`).join("")}`;

  // pige
  const p = v.pige;
  if (!p.faite) {
    $("#panneau-pige").innerHTML = `<div class="suivi-vide">${ILLUSTRATIONS.pige()}<p>La pige des cadeaux se fera à la fin de la partie.
      Les meilleures équipes auront plus de chances de bien se classer.</p></div>`;
  } else if (!p.publiee) {
    $("#panneau-pige").innerHTML = `<div class="suivi-vide">${ILLUSTRATIONS.pige()}<p><strong>La pige est faite !</strong>
      L'animateur dévoilera l'ordre dans un instant.</p></div>`;
  } else {
    const filtre = recherche.trim().toLowerCase();
    $("#panneau-pige").innerHTML = `<input type="search" class="suivi-recherche" id="recherche" placeholder="Trouver mon nom"
        value="${echapper(recherche)}" aria-label="Trouver mon nom">
      <ol class="suivi-pige">${p.ordre.filter((l) => !filtre || l.joueur.toLowerCase().includes(filtre)).map((l) =>
        `<li><span class="suivi-ordre">${l.ordre}</span><span class="suivi-joueur">${echapper(l.joueur)}</span>
          <span class="suivi-equipe-mini">${pion(l.equipe)}<span>${nom(l.equipe)}</span></span></li>`).join("")}</ol>`;
    const champ = $("#recherche");
    champ.addEventListener("input", () => {
      recherche = champ.value;
      const pos = champ.selectionStart;
      rendre(v);
      const nouveau = $("#recherche");
      nouveau.focus();
      nouveau.setSelectionRange(pos, pos);
    });
  }
}

// ------------------------------------------------------------------ interrogation périodique
function majDirect() {
  const age = Math.round((Date.now() - derniereReussite) / 1000);
  const ok = derniereReussite && age < 15;
  $("#direct").classList.toggle("hors-ligne", !ok);
  $("#direct-texte").textContent = ok ? "En direct" : derniereReussite ? "Connexion perdue, nouvel essai…" : "Connexion…";
}

async function interroger() {
  if (document.hidden) return;
  try {
    const r = await fetch("/api/suivi", { cache: "no-store" });
    if (!r.ok) throw new Error();
    const texte = await r.text();
    derniereReussite = Date.now();
    if (texte !== dernier && !(document.activeElement && document.activeElement.id === "recherche")) {
      dernier = texte;
      rendre(JSON.parse(texte));
    }
  } catch (_) { /* on réessaie au prochain cycle */ }
  majDirect();
}

interroger();
setInterval(interroger, INTERVALLE_MS);
setInterval(majDirect, 1000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) interroger(); });
