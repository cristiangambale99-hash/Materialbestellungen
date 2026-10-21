// Übersetzung ins Deutsche.
// Reihenfolge: 1. DeepL (DEEPL_API_KEY, beste Qualität) · 2. Google-Ersatzdienst · 3. MyMemory als zweiter Ersatz.
// Jeder Dienst wird mehrfach mit wachsender Wartezeit versucht, damit eine kurze Sperre (HTTP 429)
// nicht dazu führt, dass eine Meldung unübersetzt bei der Hauswartung landet.
import { fachbegriffe } from './glossar.js';

const warte = ms => new Promise(r => setTimeout(r, ms));
const WARTEN = [600, 2500, 7000];          // Wartezeiten zwischen den Versuchen

async function deepl(texte, key) {
  const base = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const r = await fetch(base + '/v2/translate', {
    method: 'POST',
    headers: { Authorization: 'DeepL-Auth-Key ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: texte, target_lang: 'DE', preserve_formatting: true })
  });
  if (!r.ok) throw new Error('DeepL ' + r.status);
  const tr = (await r.json()).translations || [];
  if (tr.length !== texte.length) throw new Error('DeepL unvollständig');
  return { texte_de: tr.map(t => fachbegriffe(t.text)), sprache: String((tr[0] && tr[0].detected_source_language) || '').toUpperCase(), dienst: 'DeepL' };
}

// Lange Texte stückweise übersetzen (Abschnitte bleiben erhalten)
const stuecke = (t, max = 1200) => {
  const teile = [];
  let rest = String(t);
  while (rest.length > max) {
    let schnitt = rest.lastIndexOf('\n', max);
    if (schnitt < max * 0.4) schnitt = rest.lastIndexOf('. ', max);
    if (schnitt < max * 0.4) schnitt = rest.lastIndexOf(' ', max);
    if (schnitt < 1) schnitt = max;
    teile.push(rest.slice(0, schnitt));
    rest = rest.slice(schnitt);
  }
  teile.push(rest);
  return teile;
};

async function google(texte) {
  const texte_de = []; let sprache = '';
  for (const t of texte) {
    let ganz = '';
    for (const teil of stuecke(t)) {
      const r = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=de&dt=t&q=' + encodeURIComponent(teil));
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      ganz += (j[0] || []).map(x => x[0]).join('');
      if (!sprache) sprache = String(j[2] || '').toUpperCase();
    }
    if (!ganz.trim()) throw new Error('Google leer');
    texte_de.push(fachbegriffe(ganz));
  }
  return { texte_de, sprache, dienst: 'Google' };
}

async function mymemory(texte) {
  const texte_de = []; let sprache = '';
  for (const t of texte) {
    let ganz = '';
    for (const teil of stuecke(t, 480)) {
      const r = await fetch('https://api.mymemory.translated.net/get?langpair=autodetect|de&q=' + encodeURIComponent(teil));
      if (!r.ok) throw new Error('MyMemory ' + r.status);
      const j = await r.json();
      const s = (j.responseData && j.responseData.translatedText) || '';
      if (!s || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(s)) throw new Error('MyMemory abgewiesen');
      ganz += s;
    }
    texte_de.push(fachbegriffe(ganz));
    if (!sprache) sprache = '?';
  }
  return { texte_de, sprache, dienst: 'MyMemory' };
}

export async function uebersetzeTexte(texte) {
  const fehler = [];
  const key = process.env.DEEPL_API_KEY;
  const wege = [];
  if (key) wege.push(['DeepL', () => deepl(texte, key)]);
  wege.push(['Google', () => google(texte)], ['MyMemory', () => mymemory(texte)]);

  for (let runde = 0; runde < WARTEN.length; runde++) {
    for (const [name, weg] of wege) {
      try {
        const j = await weg();
        if (!Array.isArray(j.texte_de) || j.texte_de.length !== texte.length || j.texte_de.some(x => !String(x || '').trim())) throw new Error(name + ' unvollständig');
        return j;
      } catch (e) { fehler.push(String(e.message || e)); }
    }
    await warte(WARTEN[runde]);
  }
  const e = new Error('Übersetzung nicht erreichbar: ' + [...new Set(fehler)].join(' · '));
  e.details = fehler; throw e;
}
