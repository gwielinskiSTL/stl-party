/* =====================================================================================
   STL Party — sons synthétisés par le navigateur (Web Audio), aucun fichier audio.
   Coupables avec le bouton « Son » de l'en-tête (choix retenu par le navigateur).
   ===================================================================================== */
"use strict";

const SONS = (() => {
  const CLE = "stl-party.son";
  let ctx = null;
  let actif = true;
  try { actif = localStorage.getItem(CLE) !== "0"; } catch (_) { /* stockage indisponible */ }

  const audio = () => {
    if (!ctx) {
      const Classe = window.AudioContext || window.webkitAudioContext;
      if (!Classe) return null;
      ctx = new Classe();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };

  function note(freq, duree = 0.12, { type = "triangle", volume = 0.12, dans = 0 } = {}) {
    if (!actif) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime + dans;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + duree + 0.05);
  }

  function bruit(duree = 0.05, { volume = 0.18, dans = 0, filtre = 900 } = {}) {
    if (!actif) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime + dans;
    const tampon = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * duree)), a.sampleRate);
    const donnees = tampon.getChannelData(0);
    for (let i = 0; i < donnees.length; i++) donnees[i] = (Math.random() * 2 - 1) * (1 - i / donnees.length);
    const source = a.createBufferSource();
    source.buffer = tampon;
    const passe = a.createBiquadFilter();
    passe.type = "bandpass";
    passe.frequency.value = filtre;
    const g = a.createGain();
    g.gain.value = volume;
    source.connect(passe).connect(g).connect(a.destination);
    source.start(t);
  }

  return {
    get actif() { return actif; },
    basculer() {
      actif = !actif;
      try { localStorage.setItem(CLE, actif ? "1" : "0"); } catch (_) { /* rien */ }
      if (actif) note(880, 0.1);
      return actif;
    },
    /** Petit clic de roulette. */
    tic(hauteur = 1) { note(900 * hauteur, 0.05, { type: "square", volume: 0.05 }); },
    /** Roulement de tambour qui s'accélère pendant « duree » secondes. */
    tambour(duree = 2) {
      let t = 0, pas = 0.11;
      while (t < duree) { bruit(0.06, { dans: t, volume: 0.1 + 0.15 * (t / duree), filtre: 700 }); t += pas; pas = Math.max(0.035, pas * 0.93); }
    },
    /** Coup sec : une place est révélée. */
    coup() { bruit(0.18, { volume: 0.35, filtre: 180 }); note(110, 0.25, { type: "sine", volume: 0.2 }); },
    /** Deux notes qui hésitent : égalité. */
    egalite() { note(440, 0.18, { dans: 0 }); note(415, 0.18, { dans: 0.2 }); note(440, 0.18, { dans: 0.4 }); note(415, 0.3, { dans: 0.6 }); },
    /** Fanfare de victoire. */
    tada() {
      [523, 659, 784].forEach((f, i) => note(f, 0.16, { dans: i * 0.11, volume: 0.14 }));
      [523, 659, 784, 1047].forEach((f) => note(f, 0.9, { dans: 0.36, volume: 0.09 }));
      bruit(0.6, { dans: 0.36, volume: 0.12, filtre: 5000 });
    },
    /** Petit « ding » du Billet d'or. */
    ding() { note(1319, 0.25, { volume: 0.1 }); note(1760, 0.4, { dans: 0.08, volume: 0.08 }); },
  };
})();
