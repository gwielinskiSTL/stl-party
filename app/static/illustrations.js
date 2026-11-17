/* =====================================================================================
   STL Party — illustrations dessinées en SVG (aucune image externe), couleurs de la charte.
   ILLUSTRATIONS.evenement(code) et ILLUSTRATIONS.objet(id) renvoient un <svg> carré 200 × 200.
   Pour remplacer une illustration d'objet par une image : champ « image » dans STL_PARTY.toml
   (fichier déposé dans app/static/images/).
   ===================================================================================== */
"use strict";

const ILLUSTRATIONS = (() => {
  const plein = (c) => `style="fill:var(--${c})"`;
  const trait = (c, l, extra = "") => `style="fill:none;stroke:var(--${c});stroke-width:${l};stroke-linecap:round;stroke-linejoin:round;${extra}"`;
  const svg = (contenu, titre) =>
    `<svg viewBox="0 0 200 200" role="img" aria-label="${titre}" xmlns="http://www.w3.org/2000/svg">${contenu}</svg>`;
  const fond = (c) => `<circle cx="100" cy="100" r="92" ${plein(c)}></circle>`;

  // ------------------------------------------------------------------ éléments réutilisables
  const bus = (x, y, s = 1, c = "marine") => `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="0" y="0" width="120" height="56" rx="10" ${plein(c)}></rect>
      <rect x="0" y="38" width="120" height="6" ${plein("cyan")}></rect>
      ${[9, 36, 63].map((wx) => `<rect x="${wx}" y="9" width="22" height="20" rx="3" ${plein("bleu-pale")}></rect>`).join("")}
      <path d="M92 9h18a4 4 0 0 1 4 4v16h-22z" ${plein("bleu-pale")}></path>
      <circle cx="115" cy="48" r="3" ${plein("vert")}></circle>
      <circle cx="28" cy="58" r="11" style="fill:var(--marine);stroke:var(--blanc);stroke-width:4"></circle>
      <circle cx="92" cy="58" r="11" style="fill:var(--marine);stroke:var(--blanc);stroke-width:4"></circle>
      <path d="M50 -4h28" ${trait("marine", 4)}></path></g>`;

  const cadeau = (x, y, t, boite = "cyan", ruban = "marine") => {
    const h = t * 0.72, couv = t * 0.24;
    return `<g transform="translate(${x} ${y})">
      <rect x="${-t / 2 + 4}" y="${-h / 2 + couv / 2}" width="${t - 8}" height="${h}" ${plein(boite)}></rect>
      <rect x="${-t / 2}" y="${-h / 2 - couv / 2}" width="${t}" height="${couv}" style="fill:var(--${boite});stroke:var(--marine);stroke-width:3"></rect>
      <rect x="${-t * 0.08}" y="${-h / 2 - couv / 2}" width="${t * 0.16}" height="${h + couv}" ${plein(ruban)}></rect>
      <path d="M0 ${-h / 2 - couv / 2} c-${t * 0.3} -${t * 0.32} -${t * 0.38} ${t * 0.02} 0 0 c${t * 0.38} ${t * 0.02} ${t * 0.3} -${t * 0.32} 0 0z" ${trait(ruban, 5)}></path>
      <rect x="${-t / 2 + 4}" y="${-h / 2 + couv / 2}" width="${t - 8}" height="${h}" ${trait("marine", 3)}></rect></g>`;
  };

  const eclair = (x, y, s = 1, c = "vert") =>
    `<path transform="translate(${x} ${y}) scale(${s})" d="M14 -40 L-14 6 H4 L-6 40 L22 -8 H4 Z" style="fill:var(--${c});stroke:var(--marine);stroke-width:3;stroke-linejoin:round"></path>`;

  const flocon = (x, y, r, c = "cyan", l = 4) => `<g transform="translate(${x} ${y})" ${trait(c, l)}>
      ${[0, 60, 120].map((a) => `<g transform="rotate(${a})"><path d="M0 ${-r}V${r}"></path>
        <path d="M0 ${-r * 0.6}l${-r * 0.25} ${-r * 0.25}M0 ${-r * 0.6}l${r * 0.25} ${-r * 0.25}M0 ${r * 0.6}l${-r * 0.25} ${r * 0.25}M0 ${r * 0.6}l${r * 0.25} ${r * 0.25}"></path></g>`).join("")}</g>`;

  const personne = (x, y, c = "marine", bras = false) => `<g transform="translate(${x} ${y})">
      <circle cx="0" cy="-34" r="13" ${plein(c)}></circle>
      <path d="M-20 22 v-22 a20 20 0 0 1 40 0 v22z" ${plein(c)}></path>
      ${bras ? `<path d="M-18 -6 l-16 -22 M18 -6 l16 -22" ${trait(c, 8)}></path>` : ""}</g>`;

  const route = `<rect x="8" y="138" width="184" height="40" ${plein("gris")}></rect>
      <path d="M14 158h172" ${trait("blanc", 4, "stroke-dasharray:14 12")}></path>`;

  const vitesse = (x, y) => `<path d="M${x} ${y}h-26M${x - 6} ${y + 16}h-34M${x} ${y + 32}h-22" ${trait("cyan", 5)}></path>`;

  const etoile = (x, y, R, c = "vert") => {
    const pts = Array.from({ length: 10 }, (_, k) => {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? R * 0.45 : R;
      return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
    return `<polygon points="${pts}" style="fill:var(--${c});stroke:var(--marine);stroke-width:3;stroke-linejoin:round"></polygon>`;
  };

  const etincelles = (pts, c = "cyan") => pts.map(([x, y, r]) =>
    `<path d="M${x} ${y - r}V${y + r}M${x - r} ${y}H${x + r}" ${trait(c, 3)}></path>`).join("");

  // ------------------------------------------------------------------ cases Événement
  const EVENEMENTS = {
    voie_reservee: () => svg(`${fond("bleu-pale")}${route}
      <path d="M150 140l14 18-14 18-14-18z" ${trait("blanc", 4)}></path>
      ${bus(48, 70, 0.95)}${vitesse(40, 78)}`, "Autobus dans la voie réservée"),

    freinage: () => svg(`${fond("bleu-pale")}${route}${bus(10, 76, 0.85)}
      <rect x="138" y="44" width="46" height="78" rx="6" style="fill:var(--blanc);stroke:var(--marine);stroke-width:4"></rect>
      <rect x="152" y="36" width="18" height="9" rx="2" ${plein("marine")}></rect>
      ${[0, 1, 2].map((k) => `<rect x="146" y="${98 - k * 22}" width="30" height="16" ${plein("vert")}></rect>`).join("")}
      <path d="M64 134 C 70 170, 140 170, 160 130" ${trait("vert", 5)}></path>
      <path d="M150 132l10 -4 3 11" ${trait("vert", 5)}></path>`, "Freinage qui recharge la batterie"),

    borne_panne: () => svg(`${fond("gris-pale")}
      <rect x="62" y="34" width="62" height="132" rx="8" ${plein("marine")}></rect>
      <rect x="74" y="50" width="38" height="30" rx="3" ${plein("bleu-pale")}></rect>
      <path d="M83 57l20 16M103 57l-20 16" ${trait("marine", 5)}></path>
      <path d="M124 110 C 160 110, 160 150, 140 160" ${trait("marine", 7)}></path>
      <rect x="128" y="154" width="24" height="16" rx="3" ${plein("gris")}></rect>
      <circle cx="146" cy="44" r="12" ${plein("gris")}></circle><circle cx="160" cy="32" r="9" ${plein("gris")}></circle>
      <circle cx="170" cy="20" r="6" ${plein("hachure")}></circle>
      <path d="M90 92l-6 14 10 4-8 16" ${trait("bleu-pale", 4)}></path>`, "Borne de recharge en panne"),

    correspondance_ratee: () => svg(`${fond("gris-pale")}${route}${bus(84, 82, 0.85)}
      <circle cx="74" cy="132" r="7" ${plein("hachure")}></circle><circle cx="62" cy="140" r="5" ${plein("hachure")}></circle>
      ${personne(38, 112, "marine", true)}
      <circle cx="38" cy="38" r="20" style="fill:var(--blanc);stroke:var(--marine);stroke-width:4"></circle>
      <path d="M38 26v12l8 6" ${trait("marine", 4)}></path>`, "Une personne voit son autobus partir"),

    express: () => svg(`${fond("bleu-pale")}${route}${bus(22, 76, 0.9)}${vitesse(20, 84)}
      ${[0, 1, 2].map((k) => `<path d="M${136 + k * 18} 86l14 16-14 16" ${trait("vert", 8)}></path>`).join("")}
      ${eclair(158, 44, 0.75)}`, "Autobus en service express"),

    prime: () => svg(`${fond("bleu-pale")}${cadeau(100, 122, 92, "cyan", "marine")}${etoile(100, 36, 22)}
      ${etincelles([[42, 58, 8], [160, 66, 9], [36, 120, 6], [168, 128, 7]])}`, "Cadeau et étoile de la prime"),

    covoiturage: () => svg(`${fond("bleu-pale")}
      ${personne(52, 130, "cyan")}${personne(148, 130, "vert")}${personne(100, 120, "marine")}
      <path d="M100 52c-8-14-30-6-22 10l22 18 22-18c8-16-14-24-22-10z" style="fill:var(--vert);stroke:var(--marine);stroke-width:3"></path>
      <rect x="30" y="152" width="140" height="12" ${plein("marine")}></rect>`, "Trois personnes qui partagent la route"),

    tempete: () => svg(`${fond("gris-pale")}
      <circle cx="74" cy="62" r="24" ${plein("bleu-pale")}></circle><circle cx="106" cy="52" r="30" ${plein("bleu-pale")}></circle>
      <circle cx="138" cy="66" r="22" ${plein("bleu-pale")}></circle><rect x="56" y="62" width="100" height="26" rx="13" ${plein("bleu-pale")}></rect>
      <path d="M58 86h96" ${trait("marine", 3)}></path>
      ${flocon(66, 124, 14)}${flocon(104, 150, 18, "marine", 4)}${flocon(144, 118, 12)}
      <rect x="160" y="96" width="14" height="60" rx="7" style="fill:var(--blanc);stroke:var(--marine);stroke-width:3"></rect>
      <circle cx="167" cy="160" r="11" ${plein("cyan")}></circle><rect x="164" y="132" width="6" height="26" ${plein("cyan")}></rect>`,
      "Tempête de neige"),
  };

  // ------------------------------------------------------------------ cases du plateau
  const fantomeForme = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M-34 34 V-6 a34 34 0 0 1 68 0 V34 l-11.3 -10 -11.3 10 -11.4 -10 -11.3 10 -11.4 -10 z"
        style="fill:var(--blanc);stroke:var(--marine);stroke-width:4;stroke-linejoin:round"></path>
      <ellipse cx="-12" cy="-8" rx="6" ry="9" ${plein("marine")}></ellipse><ellipse cx="12" cy="-8" rx="6" ry="9" ${plein("marine")}></ellipse>
      <ellipse cx="0" cy="12" rx="7" ry="5" ${plein("marine")}></ellipse></g>`;

  const ticket = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M-62 -36 H62 V-12 a12 12 0 0 0 0 24 V36 H-62 V12 a12 12 0 0 0 0 -24 Z"
        style="fill:var(--billet);stroke:var(--marine);stroke-width:4;stroke-linejoin:round"></path>
      <path d="M-30 -36 V36" ${trait("marine", 3, "stroke-dasharray:6 6")}></path>
      ${etoile(-40, 0, 10, "blanc")}
      <text x="16" y="-4" text-anchor="middle" style="fill:var(--marine);font:700 15px Arial, sans-serif">BILLET</text>
      <text x="16" y="15" text-anchor="middle" style="fill:var(--marine);font:700 15px Arial, sans-serif">D'OR</text></g>`;

  const CASES = {
    terminus: () => svg(`${fond("bleu-pale")}
      <path d="M22 82 L100 34 L178 82 Z" ${plein("marine")}></path>
      <rect x="34" y="80" width="132" height="94" ${plein("marine")}></rect>
      <rect x="52" y="98" width="96" height="76" ${plein("bleu-pale")}></rect>
      ${bus(58, 124, 0.68)}
      <circle cx="100" cy="62" r="13" ${plein("blanc")}></circle>
      <text x="100" y="68" text-anchor="middle" style="fill:var(--marine);font:700 17px Arial, sans-serif">T</text>
      ${eclair(170, 120, 0.55)}`, "Garage du Terminus"),

    recharge: () => svg(`${fond("bleu-pale")}${route}${bus(8, 90, 0.8)}
      <rect x="138" y="54" width="42" height="104" rx="6" ${plein("marine")}></rect>
      <rect x="146" y="64" width="26" height="24" rx="3" ${plein("bleu-pale")}></rect>
      ${eclair(159, 76, 0.32)}
      <path d="M138 120 C 118 120, 112 70, 80 82" ${trait("marine", 6)}></path>
      ${etincelles([[30, 52, 8], [104, 46, 7]], "vert")}`, "Autobus branché à une borne"),

    bouchon: () => svg(`${fond("gris-pale")}${route}
      ${[["cyan", 112], ["marine-doux", 150]].map(([c, x]) => `<g><rect x="${x}" y="114" width="36" height="24" rx="8" ${plein(c)}></rect>
        <rect x="${x + 6}" y="104" width="22" height="14" rx="5" ${plein(c)}></rect>
        <circle cx="${x + 9}" cy="140" r="6" ${plein("marine")}></circle><circle cx="${x + 27}" cy="140" r="6" ${plein("marine")}></circle></g>`).join("")}
      ${bus(8, 92, 0.8)}
      <path d="M112 48 h66 a8 8 0 0 1 8 8 v20 a8 8 0 0 1 -8 8 h-50 l-12 12 v-12 h-4 a8 8 0 0 1 -8 -8 v-20 a8 8 0 0 1 8 -8z" style="fill:var(--blanc);stroke:var(--marine);stroke-width:3;stroke-linejoin:round"></path>
      ${[128, 146, 164].map((x) => `<circle cx="${x}" cy="66" r="5" ${plein("marine")}></circle>`).join("")}`, "Autobus coincé dans un bouchon"),

    inspecteur: () => svg(`${fond("bleu-pale")}
      ${personne(78, 140, "marine")}
      <rect x="52" y="86" width="52" height="12" rx="4" ${plein("marine")}></rect>
      <path d="M58 88 a20 14 0 0 1 40 0z" ${plein("marine")}></path><circle cx="78" cy="84" r="4" ${plein("cyan")}></circle>
      <g transform="rotate(-10 140 110)"><rect x="112" y="80" width="56" height="70" style="fill:var(--blanc);stroke:var(--marine);stroke-width:4"></rect>
        <path d="M122 96h36M122 110h36M122 124h22" ${trait("gris", 4)}></path>
        <path d="M150 128 l8 10 l12 -18" ${trait("marine", 4)}></path></g>
      <circle cx="152" cy="52" r="22" ${plein("marine")}></circle>
      <path d="M152 40v14M152 62v1" ${trait("blanc", 6)}></path>`, "Inspecteur qui remet une contravention"),

    fantome: () => svg(`${fond("marine-doux")}
      <path d="M36 172 V96 L100 60 L164 96 V172" style="fill:none;stroke:var(--marine);stroke-width:5;stroke-linejoin:round"></path>
      ${fantomeForme(100, 106, 1.25)}
      <path d="M40 66 q10 -14 22 -4 M150 50 q12 -12 22 0" ${trait("blanc", 4)}></path>`, "Fantôme du garage"),

    fantome_resultat: () => svg(`${fond("marine-doux")}${fantomeForme(80, 100, 1.1)}
      ${eclair(150, 92, 0.85)}
      <path d="M46 160 q54 22 112 -10" ${trait("blanc", 5)}></path><path d="M146 142l12 8-8 12" ${trait("blanc", 5)}></path>`,
      "Fantôme qui emporte un butin"),

    detour: () => svg(`${fond("bleu-pale")}
      <path d="M100 26 L164 90 L100 154 L36 90 Z" style="fill:var(--cyan);stroke:var(--marine);stroke-width:5;stroke-linejoin:round"></path>
      <path d="M78 118 V96 a18 18 0 0 1 18 -18 h24" ${trait("marine", 9)}></path><path d="M112 64l14 14-14 14" ${trait("marine", 9)}></path>
      <rect x="30" y="160" width="140" height="18" ${plein("blanc")}></rect>
      ${[0, 1, 2, 3, 4].map((k) => `<path d="M${36 + k * 28} 178 l14 -18 h10 l-14 18z" ${plein("marine")}></path>`).join("")}
      <path d="M40 178v12M160 178v12" ${trait("marine", 5)}></path>`, "Panneau de détour"),

    billet: () => svg(`${fond("bleu-pale")}${ticket(100, 104, 1.2)}
      ${etincelles([[34, 46, 8], [168, 52, 9], [40, 170, 6], [166, 164, 7]], "marine")}`, "Billet d'or"),

    dernier_arret: () => svg(`${fond("bleu-pale")}${route}${bus(12, 92, 0.8)}
      <path d="M150 170 V40" ${trait("marine", 5)}></path>
      ${Array.from({ length: 12 }, (_, k) => `<rect x="${152 + (k % 4) * 10}" y="${42 + Math.floor(k / 4) * 10}" width="10" height="10" ${plein((k + Math.floor(k / 4)) % 2 ? "blanc" : "marine")}></rect>`).join("")}
      <rect x="152" y="42" width="40" height="30" ${trait("marine", 2)}></rect>
      ${etincelles([[40, 50, 8], [110, 40, 9]], "vert")}`, "Drapeau du dernier tour"),
  };
  CASES.billet_trop_cher = CASES.billet;
  CASES.billet_achete = CASES.billet;
  CASES.depanneur_passe = () => depanneur();

  // ------------------------------------------------------------------ objets du dépanneur
  const OBJETS = {
    bouclier: () => svg(`${fond("bleu-pale")}
      <path d="M100 22 L160 44 V96 C160 136 132 162 100 178 C68 162 40 136 40 96 V44 Z" style="fill:var(--marine);stroke:var(--blanc);stroke-width:5"></path>
      <path d="M100 36 L148 54 V96 C148 128 126 150 100 164" ${trait("cyan", 4)}></path>
      ${cadeau(100, 106, 58, "cyan", "blanc")}`, "Bouclier qui protège un cadeau"),

    vol_express: () => svg(`${fond("bleu-pale")}${cadeau(84, 118, 84, "vert", "marine")}${eclair(150, 70, 1.1, "cyan")}
      <path d="M22 96h22M14 118h30M22 140h22" ${trait("cyan", 5)}></path>
      ${flocon(150, 150, 12, "gris", 3)}<path d="M138 138l24 24" ${trait("marine", 4)}></path>`, "Vol express : un éclair qui saisit un cadeau"),

    correspondance: () => svg(`${fond("bleu-pale")}${cadeau(54, 112, 62, "cyan", "marine")}${cadeau(146, 112, 62, "vert", "marine")}
      <path d="M58 62 C 76 30, 124 30, 142 62" ${trait("marine", 5)}></path><path d="M130 58l12 4 3-13" ${trait("marine", 5)}></path>
      <path d="M142 162 C 124 190, 76 190, 58 162" ${trait("marine", 5)}></path><path d="M70 166l-12-4-3 13" ${trait("marine", 5)}></path>`,
      "Deux cadeaux qui s'échangent"),

    retard: () => svg(`${fond("bleu-pale")}
      <circle cx="86" cy="100" r="58" style="fill:var(--blanc);stroke:var(--marine);stroke-width:6"></circle>
      ${Array.from({ length: 12 }, (_, k) => `<path transform="rotate(${k * 30} 86 100)" d="M86 50v8" ${trait("marine", 4)}></path>`).join("")}
      <path d="M86 100V66M86 100l26 14" ${trait("marine", 6)}></path><circle cx="86" cy="100" r="5" ${plein("cyan")}></circle>
      <path d="M150 100h34M172 86l14 14-14 14" ${trait("vert", 7)}></path>
      <path d="M156 64v-30h22l-6 8 6 8h-22" style="fill:var(--vert);stroke:var(--marine);stroke-width:3;stroke-linejoin:round"></path>`,
      "Horloge et flèche vers la fin de la file"),

    gel: () => svg(`${fond("bleu-pale")}
      <rect x="40" y="46" width="120" height="120" rx="18" style="fill:var(--blanc);stroke:var(--cyan);stroke-width:6"></rect>
      ${personne(100, 138, "marine")}
      <rect x="40" y="46" width="120" height="120" rx="18" style="fill:var(--cyan);opacity:.18"></rect>
      <path d="M56 74l18-18M56 92l34-34M134 154l12-12" ${trait("blanc", 6)}></path>
      ${flocon(152, 50, 22, "marine", 5)}`, "Joueur pris dans un glaçon"),
  };

  // ------------------------------------------------------------------ page de garde du dépanneur
  const depanneur = () => svg(`${fond("bleu-pale")}
      <rect x="30" y="58" width="140" height="116" style="fill:var(--blanc);stroke:var(--marine);stroke-width:4"></rect>
      <rect x="22" y="34" width="156" height="26" ${plein("marine")}></rect>
      <text x="100" y="52" text-anchor="middle" style="fill:var(--blanc);font:700 15px Arial, sans-serif;letter-spacing:2px">DÉPANNEUR</text>
      ${Array.from({ length: 7 }, (_, k) => `<path d="M${22 + k * 22.3} 60h22.3v10a11.15 11.15 0 0 1 -22.3 0z" style="fill:var(--${k % 2 ? "blanc" : "cyan"});stroke:var(--marine);stroke-width:2"></path>`).join("")}
      <rect x="42" y="94" width="66" height="54" style="fill:var(--bleu-pale);stroke:var(--marine);stroke-width:3"></rect>
      ${cadeau(60, 128, 26, "vert", "marine")}${cadeau(90, 130, 22, "cyan", "marine")}
      <path d="M86 106l14-10M94 108l8-6" ${trait("blanc", 3)}></path>
      <rect x="116" y="94" width="46" height="80" style="fill:var(--marine)"></rect>
      <circle cx="154" cy="136" r="3" ${plein("blanc")}></circle>
      <rect x="120" y="100" width="38" height="18" ${plein("vert")}></rect>
      <text x="139" y="113" text-anchor="middle" style="fill:var(--marine);font:700 8.5px Arial, sans-serif">OUVERT</text>
      <path d="M14 174h172" ${trait("marine", 4)}></path>
      ${etincelles([[180, 96, 7], [16, 120, 6]])}`, "Devanture du dépanneur");

  const generique = (titre) => svg(`${fond("bleu-pale")}${cadeau(100, 112, 96)}`, titre);

  return {
    evenement: (code) => (EVENEMENTS[code] || CASES[code] || (() => generique("Événement")))(),
    billet: () => CASES.billet(),
    objet: (id) => (OBJETS[id] || (() => generique("Objet")))(),
    depanneur,
    pige: () => svg(`${fond("bleu-pale")}${cadeau(62, 132, 70, "vert", "marine")}${cadeau(138, 136, 62, "cyan", "marine")}
      ${cadeau(100, 74, 64, "blanc", "cyan")}${etincelles([[30, 60, 8], [172, 54, 9], [178, 120, 6]], "marine")}`, "Pile de cadeaux"),
  };
})();
