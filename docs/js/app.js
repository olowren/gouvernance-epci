// sondage av calculs en navigateur

const etat = { perim: 'tous', par: '', mode: 'pct', base: 'concernes', region: null, local: {}, recherche: '' };
let D, M;

const $ = (s, r = document) => r.querySelector(s);
const nf = new Intl.NumberFormat('fr-FR');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sansAccent = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const OUI = '#1f6f82', NON = '#9cc3cf', GRIS = '#d9d5ca';
const RAMPE = ['#8fbac7', '#4f93a6', '#1f6f82', '#0d3b4a'];

function melange(a, b, t) {
  const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const [x, y] = [h(a), h(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function degrade(t) {
  const p = Math.min(Math.max(t, 0), 1) * (RAMPE.length - 1);
  const i = Math.min(Math.floor(p), RAMPE.length - 2);
  return melange(RAMPE[i], RAMPE[i + 1], p - i);
}

// répondants
function lignes(avecRegion = true) {
  return D.rows.filter(r =>
    (etat.perim === 'tous' || r.t === 0 || r.t === 1) &&
    (!avecRegion || !etat.region || r.r === etat.region));
}

function groupes(rows) {
  if (etat.par === 'type')
    return D.types.map((nom, i) => ({ nom, rows: rows.filter(r => r.t === i) })).filter(g => g.rows.length);
  if (etat.par === 'taille')
    return D.tailles.map((nom, i) => ({ nom, rows: rows.filter(r => r.s === i) })).filter(g => g.rows.length);
  if (etat.par === 'region') {
    const codes = Object.keys(D.regions)
      .map(c => ({ nom: D.regions[c], rows: rows.filter(r => r.r === c) }))
      .filter(g => g.rows.length);
    return codes.sort((a, b) => b.rows.length - a.rows.length);
  }
  return [{ nom: 'Ensemble', rows }];
}

// stats
function tranche(q, v) {
  const b = q.bornes;
  for (let k = b.length - 2; k > 0; k--) if (v >= b[k]) return k;
  return 0;
}

function compter(q, rows) {
  const i = q.i;
  const pose = rows.filter(r => r.a[i] !== null);
  let c;
  if (q.kind === 'multi') c = q.cats.map((_, k) => pose.reduce((s, r) => s + r.a[i][k], 0));
  else if (q.kind === 'yesno') c = [pose.filter(r => r.a[i] === 1).length, pose.filter(r => r.a[i] === 0).length];
  else {
    c = q.cats.map(() => 0);
    pose.forEach(r => { c[q.kind === 'number' ? tranche(q, r.a[i]) : r.a[i]]++; });
  }
  return { n: pose.length, N: rows.length, c, vals: q.kind === 'number' ? pose.map(r => r.a[i]) : null };
}

function mediane(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// affichage
function texte(v, den) {
  if (!den) return '–';
  const p = Math.round(100 * v / den);
  return etat.mode === 'pct' ? `${p} %<small>${v}</small>` : `${v}<small>${p} %</small>`;
}

function legende(noms, couleurs) {
  return `<div class="leg">${noms.map((n, i) => `<span><i style="background:${couleurs[i]}"></i>${esc(n)}</span>`).join('')}</div>`;
}

function barres(rows, nbGroupes) {
  // rows : [{lab, barres:[{v, den, col}]}]
  const val = b => etat.mode === 'pct' ? (b.den ? 100 * b.v / b.den : 0) : b.v;
  const max = Math.max(1, ...rows.flatMap(r => r.barres.map(val)));
  const axe = etat.mode === 'pct' ? Math.min(100, Math.max(10, Math.ceil((max + 2) / 10) * 10)) : max;
  const html = rows.map(r => `<div class="lg"><div class="lb">${esc(r.lab)}</div><div class="br">${r.barres.map(b => {
    const w = Math.max(0, val(b) / axe * 100);
    return `<div class="b"><span class="rem" style="width:${w}%;background:${b.col}"></span>` +
           `<span class="tx" style="left:calc(${w}% + 5px)">${texte(b.v, b.den)}</span></div>`;
  }).join('')}</div></div>`).join('');
  const note = etat.mode === 'pct' && axe < 100 ? `<p class="meta">Échelle : 0 à ${axe} %</p>` : '';
  return html + note;
}

function piles(res, base, nomsGroupes) {
  const segs = r => {
    const s = [{ v: r.c[0], col: OUI, f: false }, { v: r.c[1], col: NON, f: true }];
    if (base === 'tous' && r.N > r.n) s.push({ v: r.N - r.n, col: GRIS, f: true });
    return s;
  };
  return res.map((r, i) => {
    const den = base === 'tous' ? r.N : r.n;
    const html = segs(r).map(s => {
      const w = den ? 100 * s.v / den : 0;
      const t = w >= 9 ? (etat.mode === 'pct' ? Math.round(w) + ' %' : s.v) : '';
      return `<span class="seg ${s.f ? 'clair' : ''}" style="width:${w}%;background:${s.col}" title="${s.v} sur ${den}">${t}</span>`;
    }).join('');
    const lab = nomsGroupes ? `${esc(r.nom)} <small>(${den})</small>` : '';
    return `<div class="lg ${nomsGroupes ? 'empile' : 'pleine'}">${lab ? `<div class="lb">${lab}</div>` : ''}<div class="br"><div class="pile">${html}</div></div></div>`;
  }).join('');
}

function ordre(q, res) {
  const idx = q.cats.map((_, i) => i);
  if (q.kind === 'multi' || (q.kind === 'single' && !q.ordre)) {
    const tot = i => res.reduce((s, r) => s + r.c[i], 0);
    const fin = i => /^(autre|aucun)/i.test(q.cats[i]) ? 1 : 0;
    idx.sort((a, b) => fin(a) - fin(b) || tot(b) - tot(a));
  }
  return idx;
}

function carteQuestion(q, G, numero) {
  const res = G.map(g => ({ nom: g.nom, ...compter(q, g.rows) }));
  const n = res.reduce((s, r) => s + r.n, 0), N = res.reduce((s, r) => s + r.N, 0);
  const tete = `<article class="q" id="${q.id}"><h3><span class="no">Q${numero}</span>${esc(q.titre)}</h3>`;
  if (!n) return tete + '<p class="vide">Aucune réponse pour ce filtre.</p></article>';

  const partiel = n < N;
  const base = partiel ? (etat.local[q.id] || etat.base) : 'concernes';
  const multi = res.length > 1;
  let corps = '';

  if (partiel) {
    corps += `<div class="base"><span>Question posée à ${n} répondants sur ${N}</span>` +
      `<button data-q="${q.id}" data-b="concernes" class="${base === 'concernes' ? 'on' : ''}">Concernés</button>` +
      `<button data-q="${q.id}" data-b="tous" class="${base === 'tous' ? 'on' : ''}">Tous</button></div>`;
  } else if (!multi) {
    corps += `<p class="meta">${n} réponses${q.kind === 'multi' ? ' · plusieurs réponses possibles' : ''}</p>`;
  } else if (q.kind === 'multi') {
    corps += '<p class="meta">Plusieurs réponses possibles</p>';
  }

  const den = r => base === 'tous' ? r.N : r.n;
  if (q.kind === 'yesno') {
    const noms = ['Oui', 'Non'].concat(base === 'tous' && partiel ? ['Non concerné'] : []);
    corps += legende(noms, [OUI, NON, GRIS]) + piles(res, base, multi);
  } else {
    const coul = multi ? res.map((_, i) => degrade(i / (res.length - 1))) : [OUI];
    if (multi) corps += legende(res.map(r => `${r.nom} (${den(r)})`), coul);
    const rows = ordre(q, res).map(k => ({ lab: q.cats[k], barres: res.map((r, g) => ({ v: r.c[k], den: den(r), col: coul[g] })) }));
    if (base === 'tous' && partiel) {
      rows.push({ lab: q.kind === 'multi' ? 'Question sans réponse' : 'Non concerné', barres: res.map(r => ({ v: r.N - r.n, den: r.N, col: GRIS })) });
    }
    corps += barres(rows, res.length);
    if (q.kind === 'number') {
      corps += '<p class="meta">' + res.map(r => {
        const m = mediane(r.vals), moy = r.vals.length ? r.vals.reduce((a, b) => a + b, 0) / r.vals.length : null;
        return `${multi ? esc(r.nom) + ' : ' : ''}médiane ${m === null ? '–' : nf.format(Math.round(m))}, moyenne ${moy === null ? '–' : nf.format(Math.round(moy))}`;
      }).join('<br>') + '</p>';
    }
  }
  if (q.id === 'Poste_occupe' && D.postes.length) {
    corps += `<details><summary>Intitulés déclarés</summary><ul>${D.postes.map(p => `<li>${esc(p.titre)} (${p.n})</li>`).join('')}</ul></details>`;
  }
  return tete + corps + '</article>';
}

// appercu carte
function apercu() {
  const rows = lignes(false);
  const compte = {};
  rows.forEach(r => { if (r.r) compte[r.r] = (compte[r.r] || 0) + 1; });
  const plein = {};
  D.rows.forEach(r => { if (r.r) plein[r.r] = (plein[r.r] || 0) + 1; });
  const maxPlein = Math.max(1, ...Object.values(plein));
  const kr = 0.085 * M.largeur / Math.sqrt(maxPlein);

  const fond = M.regions.map(r => `<path class="reg" d="${r.d}"/>`).join('');
  const ronds = M.regions.filter(r => compte[r.code]).sort((a, b) => compte[b.code] - compte[a.code]).map(r => {
    const n = compte[r.code], rayon = Math.max(6, kr * Math.sqrt(n));
    const col = degrade(n / maxPlein);
    const lisible = rayon >= 10 ? `<text x="${r.cx}" y="${r.cy + 4}">${n}</text>` : '';
    return `<g class="pt ${etat.region === r.code ? 'sel' : ''}" data-reg="${r.code}"><title>${esc(r.nom)} : ${n}</title>` +
           `<circle cx="${r.cx}" cy="${r.cy}" r="${rayon.toFixed(1)}" style="fill:${col}"/>${lisible}</g>`;
  }).join('');

  const liste = Object.keys(compte).sort((a, b) => compte[b] - compte[a]).map(c =>
    `<li class="${etat.region === c ? 'sel' : ''}"><button data-reg="${c}">${esc(D.regions[c])}</button><b>${compte[c]}</b></li>`).join('');
  const sans = rows.filter(r => !r.r).length;

  return `<section class="apercu" id="apercu"><div class="carte ${etat.region ? 'filtre' : ''}">` +
    `<svg viewBox="0 0 ${M.largeur} ${M.hauteur}" role="img" aria-label="Nombre de répondants par région">${fond}${ronds}</svg>` +
    `<p class="carte-note">Surface des cercles proportionnelle au nombre de répondants. Cliquer sur une région filtre toutes les questions.</p></div>` +
    `<div><h3 class="mini">Répondants par région</h3><ul class="liste-reg">${liste}</ul>` +
    (sans ? `<p class="meta">${sans} répondant${sans > 1 ? 's' : ''} sans région renseignée.</p>` : '') +
    classement() + '</div></section>';
}

function classement() {
  const G = groupes(lignes());
  const qs = D.questions.filter(q => q.kind === 'yesno');
  const data = qs.map(q => {
    const res = G.map(g => ({ nom: g.nom, ...compter(q, g.rows) }));
    const den = r => etat.base === 'tous' ? r.N : r.n;
    const part = res.reduce((s, r) => s + r.c[0], 0) / Math.max(1, res.reduce((s, r) => s + den(r), 0));
    return { q, res, den, part };
  }).filter(d => d.res.some(r => r.n)).sort((a, b) => b.part - a.part);
  if (!data.length) return '';
  const multi = G.length > 1;
  const coul = multi ? G.map((_, i) => degrade(i / (G.length - 1))) : [OUI];
  const rows = data.map(d => ({ lab: d.q.titre, barres: d.res.map((r, i) => ({ v: r.c[0], den: d.den(r), col: coul[i] })) }));
  return `<h3 class="mini" style="margin-top:26px">Part de « oui » aux questions fermées</h3>` +
    (multi ? legende(G.map(g => g.nom), coul) : '') + barres(rows, G.length);
}

// rubriques
function rubriques() {
  const G = groupes(lignes());
  const mot = sansAccent(etat.recherche);
  let numero = 0;
  return D.sections.map((s, si) => {
    const cartes = D.questions.filter(q => q.sec === si).map(q => {
      numero++;
      if (mot && !sansAccent(q.titre + ' ' + q.cats.join(' ')).includes(mot)) return '';
      return carteQuestion(q, G, numero);
    }).join('');
    if (!cartes) return '';
    return `<section class="rubrique" id="sec${si}"><h2>${s.cle === 'Profil' ? '' : `<span class="sec">${esc(s.cle)}</span>`}${esc(s.nom)}</h2><div class="grille">${cartes}</div></section>`;
  }).join('');
}

function rendre() {
  const rows = lignes();
  const regions = new Set(rows.map(r => r.r).filter(Boolean));
  $('#chapo').textContent = ` ` +
    `` +
    '';

  document.querySelectorAll('.ctl button[data-ctl]').forEach(b => b.classList.toggle('on', etat[b.dataset.ctl] === b.dataset.val));
  const cr = $('#ctl-region');
  cr.hidden = !etat.region;
  if (etat.region) cr.innerHTML = `<span class="et">Région</span><b>${esc(D.regions[etat.region])}</b><button class="lien" data-reg="${etat.region}">retirer</button>`;

  $('#principal').innerHTML = (etat.recherche ? '' : apercu()) + (rubriques() || '<p class="vide">Aucune question ne correspond.</p>');
  sommaire();
  suivre();
}

function sommaire() {
  const ouvert = new Set([...document.querySelectorAll('.rubrique')].map(e => e.id));
  $('#sommaire').innerHTML = (etat.recherche ? '' : '<li><a href="#apercu">Vue d\u2019ensemble</a></li>') +
    D.sections.map((s, i) => ouvert.has('sec' + i)
      ? `<li><a href="#sec${i}" data-sec="sec${i}">${esc(s.nom)}<small>${D.questions.filter(q => q.sec === i).length}</small></a></li>` : '').join('');
}

function suivre() {
  const liens = [...document.querySelectorAll('#sommaire a')];
  const blocs = liens.map(a => document.getElementById(a.getAttribute('href').slice(1)));
  let actif = 0;
  blocs.forEach((b, i) => { if (b && b.getBoundingClientRect().top < 140) actif = i; });
  liens.forEach((a, i) => a.classList.toggle('on', i === actif));
}

function pied() {
  const v = D.vides.length ? `<p>Question${D.vides.length > 1 ? 's' : ''} sans aucune réponse dans cette extraction : ${D.vides.map(esc).join(' ; ')}.</p>` : '';
  $('#pied').innerHTML = v +
    `<p>Données retravaillées et anonymisation des résultats brutes pour diffusion.</p>` +
    '<p>Fond de plan : Contours des régions simplifiés, d\u2019après les données de l\u2019IGN (licence ouverte Etalab).</p>';
}

// event
document.addEventListener('click', e => {
  const c = e.target.closest('[data-ctl]');
  if (c) {
    etat[c.dataset.ctl] = c.dataset.val;
    if (c.dataset.ctl === 'base') etat.local = {};
    return rendre();
  }
  const q = e.target.closest('[data-q]');
  if (q) { etat.local[q.dataset.q] = q.dataset.b; return rendre(); }
  const r = e.target.closest('[data-reg]');
  if (r) { etat.region = etat.region === r.dataset.reg ? null : r.dataset.reg; return rendre(); }
});
$('#recherche').addEventListener('input', e => { etat.recherche = e.target.value.trim(); rendre(); });
window.addEventListener('scroll', () => requestAnimationFrame(suivre), { passive: true });

Promise.all([fetch('data/survey.json').then(r => r.json()), fetch('data/map.json').then(r => r.json())]).then(([d, m]) => {
  D = d; M = m;
  D.questions.forEach((q, i) => { q.i = i; });
  if (!D.types.length || D.rows.every(r => r.t === null)) $('#ctl-perim').hidden = true;
  pied();
  rendre();
}).catch(err => {
  $('#principal').innerHTML = '<p class="vide">Impossible de charger les données </p>';
  console.error(err);
});
