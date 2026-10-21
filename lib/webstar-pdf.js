// Bestellschein für Webstar als PDF auf dem Clean-Service-Briefpapier (A4).
//
// Aufbau und Masse identisch zum Bestellschein der Hauswartung (MeldungenHW),
// damit Webstar von uns immer dasselbe Dokument erhält: Text links 25 mm,
// Breite 140 mm, oben 50 mm, Vorlage CSS_AG_Brief.dotm.
//
// Unterschied zur Hauswartung: hier stehen mehrere Positionen in der Tabelle.
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { FONT_REGULAR, FONT_BOLD, BRIEFPAPIER_PNG } from './ressourcen.js';

const MM = 72 / 25.4;
const A4 = [210 * MM, 297 * MM];
const LINKS = 25 * MM, BREITE = 140 * MM, OBEN = 50 * MM, UNTEN = 265 * MM;
const SCHWARZ = rgb(0.06, 0.12, 0.12), GRAU = rgb(0.37, 0.45, 0.45), LINIE = rgb(0.85, 0.89, 0.89);
const TUERKIS = rgb(0.169, 0.714, 0.718), HELL = rgb(0.918, 0.965, 0.965);
const GROESSE = 9.5, ZEILE = GROESSE * 1.42;
const DATUM_Y = 80 * MM, BETREFF_Y = 92 * MM;
const b64 = s => Uint8Array.from(Buffer.from(s, 'base64'));

const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONAT = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
               'September', 'Oktober', 'November', 'Dezember'];

export function datumLang(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  const [j, m, t] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t));
  return `${WOCHENTAG[d.getUTCDay()]}, ${t}. ${MONAT[m - 1]} ${j}`;
}

export function heuteLang(d = new Date()) {
  return `${d.getDate()}. ${MONAT[d.getMonth()]} ${d.getFullYear()}`;
}

// b: { nr, lieferant:{name,email}, heute, lieferdatum?,
//      positionen:[{nr,name,menge,einheit?}], objekt:{kunde,strasse,ort,nr}, besteller }
export async function erstelleWebstarPdf(b) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const f = await pdf.embedFont(b64(FONT_REGULAR), { subset: true });
  const fb = await pdf.embedFont(b64(FONT_BOLD), { subset: true });
  const hintergrund = await pdf.embedPng(b64(BRIEFPAPIER_PNG));
  const titel = `Bestellung Nr. ${b.nr}`;
  pdf.setTitle(titel);
  pdf.setAuthor('Clean Service Scaramuzzo AG');
  pdf.setSubject('Materialbestellung Unterhaltsreinigung');

  let seite = pdf.addPage(A4);
  seite.drawImage(hintergrund, { x: 0, y: 0, width: A4[0], height: A4[1] });
  let y = OBEN;

  const text = (t, x, yy, { font = f, size = GROESSE, color = SCHWARZ } = {}) =>
    seite.drawText(String(t), { x, y: A4[1] - yy - size * 0.8, size, font, color });
  const rechts = (t, xEnde, yy, { font = f, size = GROESSE, color = SCHWARZ } = {}) =>
    text(t, xEnde - font.widthOfTextAtSize(String(t), size), yy, { font, size, color });
  const linie = (x1, x2, yy, { dicke = 0.5, color = LINIE } = {}) =>
    seite.drawLine({ start: { x: x1, y: A4[1] - yy }, end: { x: x2, y: A4[1] - yy }, thickness: dicke, color });
  const umbrechen = (t, font, size, breite) => {
    const zeilen = [];
    for (const abs of String(t || '').split(/\r?\n/)) {
      let z = '';
      for (const w of abs.split(/\s+/).filter(Boolean)) {
        const p = z ? z + ' ' + w : w;
        if (font.widthOfTextAtSize(p, size) <= breite) z = p; else { if (z) zeilen.push(z); z = w; }
      }
      zeilen.push(z);
    }
    return zeilen;
  };

  /* ---- Briefkopf ---- */
  const absender = 'Clean Service Scaramuzzo AG, Industriestrasse 5, 8307 Effretikon';
  text(absender, LINKS, y, { size: 6.5 });
  linie(LINKS, LINKS + f.widthOfTextAtSize(absender, 6.5), y + 9, { dicke: 0.6, color: SCHWARZ });
  text(b.lieferant.name, LINKS, 55 * MM, { font: fb });
  if (b.lieferant.email) text(b.lieferant.email, LINKS, 55 * MM + 13.5);
  text(`Effretikon, ${b.heute}`, LINKS, DATUM_Y);
  text(titel, LINKS, BETREFF_Y, { font: fb, size: 12 });
  y = BETREFF_Y + 11 * MM;

  /* ---- Anrede und Einleitung ---- */
  text('Sehr geehrte Damen und Herren', LINKS, y); y += ZEILE + 2.5 * MM;
  const einleitung = b.lieferdatum
    ? 'Gerne bestellen wir bei Ihnen die folgende Ware. Wir bitten Sie um Lieferung am unten aufgeführten Datum.'
    : 'Gerne bestellen wir bei Ihnen die folgende Ware. Wir bitten Sie um Lieferung zum nächstmöglichen Termin.';
  umbrechen(einleitung, f, GROESSE, BREITE).forEach(z => { text(z, LINKS, y); y += ZEILE; });
  y += 4 * MM;

  /* ---- Gewünschtes Lieferdatum: gut sichtbar ---- */
  if (b.lieferdatum) {
    const h = 15 * MM;
    seite.drawRectangle({ x: LINKS, y: A4[1] - y - h, width: BREITE, height: h, color: HELL });
    seite.drawRectangle({ x: LINKS, y: A4[1] - y - h, width: 1.4 * MM, height: h, color: TUERKIS });
    text('GEWÜNSCHTES LIEFERDATUM', LINKS + 5 * MM, y + 4 * MM, { size: 7.5, color: GRAU });
    text(datumLang(b.lieferdatum), LINKS + 5 * MM, y + 7.6 * MM, { font: fb, size: 12 });
    y += h + 6 * MM;
  }

  /* ---- Positionstabelle ---- */
  const X_POS = LINKS, X_NR = LINKS + 12 * MM, X_TEXT = LINKS + 36 * MM, X_ENDE = LINKS + BREITE;
  const TEXT_B = 88 * MM;

  const kopfzeile = () => {
    text('POS.', X_POS, y, { size: 7.5, color: GRAU });
    text('ARTIKEL-NR.', X_NR, y, { size: 7.5, color: GRAU });
    text('BEZEICHNUNG', X_TEXT, y, { size: 7.5, color: GRAU });
    rechts('MENGE', X_ENDE, y, { size: 7.5, color: GRAU });
    y += 12; linie(LINKS, X_ENDE, y, { dicke: 0.8, color: TUERKIS }); y += 5 * MM;
  };
  const neueSeite = () => {
    seite = pdf.addPage(A4);
    seite.drawImage(hintergrund, { x: 0, y: 0, width: A4[0], height: A4[1] });
    y = OBEN;
    text(`${titel} · Fortsetzung`, LINKS, y, { font: fb, size: 10 });
    y += 8 * MM;
    kopfzeile();
  };

  kopfzeile();

  const positionen = Array.isArray(b.positionen) ? b.positionen : [];
  positionen.forEach((p, i) => {
    const bezeichnung = umbrechen(p.name, f, GROESSE, TEXT_B);
    const hoehe = bezeichnung.length * ZEILE + (p.einheit ? ZEILE : 0) + 3.5 * MM;
    if (y + hoehe > UNTEN) neueSeite();
    text(String(i + 1), X_POS, y);
    if (p.nr) text(p.nr, X_NR, y, { font: fb });
    bezeichnung.forEach((z, k) => text(z, X_TEXT, y + k * ZEILE));
    if (p.einheit) text(p.einheit, X_TEXT, y + bezeichnung.length * ZEILE, { size: 8, color: GRAU });
    rechts(String(p.menge), X_ENDE, y, { font: fb, size: 11 });
    y += hoehe;
    linie(LINKS, X_ENDE, y - 1.5 * MM);
  });

  y += 3 * MM;
  rechts(`${positionen.length} ${positionen.length === 1 ? 'Position' : 'Positionen'}`,
         X_ENDE, y, { size: 8.5, color: GRAU });
  y += 9 * MM;

  /* ---- Lieferadresse und Besteller ---- */
  if (y + 30 * MM > UNTEN) neueSeite();
  const block = (titelText, zeilen, x) => {
    text(titelText, x, y, { size: 7.5, color: GRAU });
    zeilen.filter(Boolean).forEach((z, i) => text(z, x, y + 12 + i * ZEILE, { font: i === 0 ? fb : f }));
  };
  const spalte = BREITE / 2;
  block('LIEFERADRESSE',
        [b.objekt.kunde, b.objekt.strasse, b.objekt.ort, `Objekt ${b.objekt.nr}`], LINKS);
  block('BESTELLT DURCH',
        ['Clean Service Scaramuzzo AG', 'Unterhaltsreinigung · ' + (b.besteller || ''), '0844 355 355'],
        LINKS + spalte);
  y += 12 + 4 * ZEILE + 7 * MM;

  umbrechen('Rückfragen zu dieser Bestellung bitte an unterhalt@clean-service.ch oder 0844 355 355. '
          + 'Bitte geben Sie auf dem Lieferschein die Bestellnummer an.', f, 8.5, BREITE)
    .forEach(z => { text(z, LINKS, y, { size: 8.5, color: GRAU }); y += 8.5 * 1.42; });
  y += 7 * MM;

  /* ---- Gruss ---- */
  text('Freundliche Grüsse', LINKS, y); y += ZEILE * 2.4;
  text('Clean Service Scaramuzzo AG', LINKS, y, { font: fb }); y += ZEILE;
  text('Unterhaltsreinigung', LINKS, y, { size: 8.5, color: GRAU });

  return Buffer.from(await pdf.save());
}
