// Schweizer Fachbegriffe nach der maschinellen Übersetzung korrigieren
// (z. B. «picchetto» wird sonst oft falsch zu «Streikdienst»).
const ERSETZUNGEN = [
  [/\bStreik(?:posten)?dienst(e[sn]?)?\b/g, 'Pikettdienst$1'],
  [/\bStreikposten\b/g, 'Pikett'],
  [/\bBereitschaftsdienst(e[sn]?)?\b/g, 'Pikettdienst$1'],
  [/\bRufbereitschaft\b/g, 'Pikettdienst'],
  [/\bHausmeister(in|innen|s|n)?\b/g, (_, e) => 'Hauswart' + ({ in: 'in', innen: 'innen', s: 's', n: 'e' }[e] || '')],
  [/\bHausverwaltung\b/g, 'Verwaltung'],
  [/\bErdgeschoss\b/g, 'EG'],
  [/ß/g, 'ss']
];
export function fachbegriffe(text) {
  let t = String(text || '');
  for (const [muster, ersatz] of ERSETZUNGEN) t = t.replace(muster, ersatz);
  return t;
}
