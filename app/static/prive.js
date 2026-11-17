/* =====================================================================================
   STL Party — page privée de l'animateur : ordre secret de la pige et objets attribués.
   Sans code_prive (STL_PARTY.toml), le serveur ne la sert qu'au poste qui fait tourner le jeu.
   ===================================================================================== */
"use strict";

const $ = (sel) => document.querySelector(sel);
const fr = (n) => Number(n).toLocaleString("fr-CA");
const pct = (x) => `${(x * 100).toLocaleString("fr-CA", { maximumFractionDigits: 1 })} %`;
const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pion = (id) => `<span class="pion eq-${id % 8}" aria-hidden="true">${Number(id) + 1}</span>`;

let donnees = null;
let code = "";
try { code = sessionStorage.getItem("stl-party.code-prive") || ""; } catch (_) { /* rien */ }

function alerte(message) {
  $("#alerte").textContent = message || "";
  $("#alerte").hidden = !message;
}

async function charger() {
  const r = await fetch("/api/pige", { headers: code ? { "X-Code-Prive": code } : {}, cache: "no-store" });
  const corps = await r.json().catch(() => ({}));
  if (r.status === 403 && /code/i.test(corps.erreur || "")) {
    $("#form-code").hidden = false;
    throw new Error(code ? "Code invalide." : "Entrez le code de la page privée.");
  }
  if (!r.ok) throw new Error(corps.erreur || `Erreur ${r.status}`);
  donnees = corps;
}

function objetsDe(equipe, joueur) {
  const e = donnees.equipes[equipe];
  return donnees.pige.objets
    .filter((a) => a.equipe === equipe && a.joueur === joueur)
    .map((a) => ({ ...a, objet: e.objets[a.indice], cfg: donnees.objets.find((o) => o.id === e.objets[a.indice].id) || { nom: "?" } }));
}

const htmlObjets = (liste) => liste.length ? liste.map((o) => `<label class="objet-ligne${o.objet.utilise ? " utilise" : ""}">
    <input type="checkbox" data-equipe="${o.equipe}" data-indice="${o.indice}" ${o.objet.utilise ? "checked" : ""}>
    <span class="objet-vignette">${ILLUSTRATIONS.objet(o.cfg.id)}</span>
    <span><strong>${echapper(o.cfg.nom)}</strong><small>${echapper(o.cfg.description || "")}</small></span></label>`).join("")
  : `<span class="note">—</span>`;

function afficher() {
  const p = donnees.pige;
  const nom = (id) => echapper(donnees.equipes[id].nom);
  const filtre = ($("#recherche").value || "").trim().toLowerCase();
  $("#resume").textContent = `${fr(p.lignes.length)} participants · tirée le ${new Date(p.tiree_le).toLocaleString("fr-CA", { dateStyle: "long", timeStyle: "short" })}` +
    (p.avantage === "dernier" ? " · le meilleur rang pige en dernier" : " · le meilleur rang pige en premier");
  $("#lignes").innerHTML = p.lignes
    .filter((l) => !filtre || l.joueur.toLowerCase().includes(filtre) || donnees.equipes[l.equipe].nom.toLowerCase().includes(filtre))
    .map((l) => `<tr><td class="ordre">${l.ordre}</td><td class="joueur">${echapper(l.joueur)}</td>
      <td><span class="equipe-cellule">${pion(l.equipe)} ${nom(l.equipe)}</span></td>
      <td>${htmlObjets(objetsDe(l.equipe, l.joueur))}</td></tr>`).join("");

  $("#objets-equipes").innerHTML = donnees.equipes.map((e) => {
    const attribues = p.objets.filter((a) => a.equipe === e.id);
    return `<div class="objets-equipe"><h3>${pion(e.id)} ${nom(e.id)}</h3>${attribues.length
      ? attribues.map((a) => `<p><strong>${echapper(a.joueur)}</strong> : ${echapper((donnees.objets.find((o) => o.id === e.objets[a.indice].id) || {}).nom || "?")}${e.objets[a.indice].utilise ? " (utilisé)" : ""}</p>`).join("")
      : `<p class="note">Aucun objet acheté.</p>`}</div>`;
  }).join("");

  const s = p.simulation;
  $("#simulation-note").textContent = `Estimé sur ${fr(s.simulations)} piges simulées`;
  $("#th-quart").textContent = `Chance d'un membre d'être dans les ${s.premier_quart} premiers rangs`;
  const poids = p.classement_equipes.map((id) => `${nom(id)} : ${fr(p.poids[id])}`).join(" · ");
  $("#methode").innerHTML = `Pige pondérée <strong>sans remise</strong> sur les ${fr(s.participants)} participants : on tire le
    1<sup>er</sup> rang parmi tous, chaque personne ayant le poids de son équipe (${poids}), puis le 2<sup>e</sup> rang parmi
    ceux qui restent, et ainsi de suite. Les meilleures équipes se classent mieux en moyenne, mais tout le monde garde
    une chance d'être en tête.`;
  const stats = Object.fromEntries(s.equipes.map((x) => [x.equipe, x]));
  $("#chances").innerHTML = p.classement_equipes.map((id, rang) => {
    const x = stats[id];
    return `<tr><td>${rang + 1}<sup>${rang ? "e" : "er"}</sup></td><td><span class="equipe-cellule">${pion(id)} ${nom(id)}</span></td>
      <td>${fr(x.poids)}</td><td>${x.rang_moyen.toLocaleString("fr-CA")}</td><td>${pct(x.chance_premier)}</td><td>${pct(x.chance_premier_quart)}</td></tr>`;
  }).join("");

  document.querySelectorAll("#contenu [data-indice]").forEach((c) => c.addEventListener("change", async () => {
    try {
      const r = await fetch("/api/objet", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipe: Number(c.dataset.equipe), indice: Number(c.dataset.indice) }) });
      if (!r.ok) throw new Error((await r.json()).erreur);
      await charger();
      afficher();
    } catch (e) { alerte(e.message); }
  }));
}

function majPublication() {
  const publiee = !!donnees.pige.publiee;
  $("#publication-titre").textContent = publiee ? "Ordre publié sur les cellulaires" : "Ordre non publié sur les cellulaires";
  $("#publication-texte").textContent = publiee
    ? "Les participants voient l'ordre de pige sur la page de suivi. Les objets attribués restent privés."
    : "Les participants voient « La pige est faite », sans l'ordre. Les objets attribués restent toujours privés.";
  $("#btn-publier").textContent = publiee ? "Retirer l'ordre des cellulaires" : "Publier l'ordre sur les cellulaires";
  $("#btn-publier").className = publiee ? "btn btn-secondaire" : "btn btn-principal";
  document.querySelector(".publication").classList.toggle("publiee", publiee);
}

$("#btn-publier").addEventListener("click", async () => {
  alerte("");
  try {
    const r = await fetch("/api/pige/publication", { method: "POST",
      headers: { "Content-Type": "application/json", ...(code ? { "X-Code-Prive": code } : {}) },
      body: JSON.stringify({ publiee: !donnees.pige.publiee }) });
    if (!r.ok) throw new Error((await r.json()).erreur);
    await charger();
    majPublication();
  } catch (e) { alerte(e.message); }
});

function montrer(visible) {
  $("#contenu").hidden = !visible;
  $("#garde").hidden = visible;
  ["#btn-masquer", "#btn-imprimer", "#btn-csv"].forEach((b) => { $(b).hidden = !visible; });
}

async function ouvrir() {
  alerte("");
  try {
    await charger();
    $("#form-code").hidden = true;
    $("#btn-csv").href = `/api/pige.csv${code ? `?code=${encodeURIComponent(code)}` : ""}`;
    afficher();
    majPublication();
    montrer(true);
  } catch (e) { alerte(e.message); }
}

$("#btn-afficher").addEventListener("click", ouvrir);
$("#btn-masquer").addEventListener("click", () => montrer(false));
$("#btn-imprimer").addEventListener("click", () => window.print());
$("#recherche").addEventListener("input", afficher);
$("#form-code").addEventListener("submit", (ev) => {
  ev.preventDefault();
  code = $("#code").value;
  try { sessionStorage.setItem("stl-party.code-prive", code); } catch (_) { /* rien */ }
  ouvrir();
});
