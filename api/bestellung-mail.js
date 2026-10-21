// Vercel Serverless Function: /api/bestellung-mail
//
// Nimmt eine abgeschickte Bestellung entgegen und verschickt sie per Resend.
// Zwei Empfaenger, zwei Tonlagen:
//
//   ziel = "lager"    Teams-Kanal des Lagers. Knapper Text, damit der
//                     Lagerist die Positionen im Kanal direkt lesen kann.
//                     Loest aus, sobald eine Mitarbeiterin absendet.
//   ziel = "webstar"  Lieferant der Unterhaltsreinigung. Richtige
//                     Geschaeftsmail mit Positionstabelle und Lagerauftrag
//                     als PDF. Loest erst die Freigabe im Adminbereich aus.
//
// Der Browser nennt nur das Schluesselwort, nie eine Adresse. So kann von
// aussen niemand eine Bestellung an eine fremde Adresse schicken lassen.
//
// Benoetigte Environment Variables in Vercel:
//   RESEND_API_KEY   z.B. re_xxxxxxxxxxxx           (Pflicht)
//   MAIL_TO          cee2eda3.clean-service.ch@emea.teams.ms
//   MAIL_WEBSTAR     info@webstar.ch
//   MAIL_FROM        materialbestellung@clean-service.ch
//                    (Domain muss bei Resend verifiziert sein)
//   MAIL_ANTWORT     materialbestellung@clean-service.ch   (Reply-To, optional)

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

const FIRMA = {
  name:    "Clean Service Scaramuzzo AG",
  strasse: "Industriestrasse 5",
  ort:     "8307 Effretikon",
  telefon: "0844 355 355",
  web:     "clean-service.ch",
  stelle:  "Materialdisposition",
};

const TUERKIS = "#1d8384";
const PETROL  = "#0e4344";
const HELL    = "#eaf6f6";
const LINIE   = "#d7e3e4";
const INK     = "#122a2d";
const GRAU    = "#5d7275";

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// 2026-09-25 -> 25.09.2026
const datum = (d) => {
  if (!d) return null;
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d);
};

const MONATE = ["Januar","Februar","März","April","Mai","Juni",
                "Juli","August","September","Oktober","November","Dezember"];
const datumLang = (d) => {
  const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return datum(d) || "";
  return `${Number(m[3])}. ${MONATE[Number(m[2]) - 1]} ${m[1]}`;
};

// Alle Positionen flach, mit Kundenblock als Zwischentitel
function flach(kunden, positionen) {
  if (Array.isArray(kunden) && kunden.length) {
    // Bei nur einem Objekt steht es schon im Kopf der Mail, dann spart sich
    // die Tabelle den Zwischentitel.
    if (kunden.length === 1) return kunden[0].positionen || [];
    return kunden.flatMap((k) => [
      { titel: `${k.name || "Kunde"}${k.objektnummer ? " · " + k.objektnummer : ""}` },
      ...(k.positionen || []),
    ]);
  }
  return Array.isArray(positionen) ? positionen : [];
}

// ---------------------------------------------------------------- Lagerkanal
function lagerText(d) {
  const zeilen = [
    `Bestellnummer: ${d.nummer}`,
    `Abteilung: ${d.abteilung || "–"}`,
    `Mitarbeiter/in: ${d.mitarbeiter || "–"} (Personalnr. ${d.personalnummer || "–"})`,
  ];
  if (d.fahrzeug) zeilen.push(`Fahrzeug: ${d.fahrzeug}`);
  if (d.lieferung) zeilen.push(`Lieferung: ${d.lieferung}`);
  if (datum(d.bestelldatum)) zeilen.push(`Bestellt am: ${datum(d.bestelldatum)}`);

  const pos = (liste) => (liste || []).map(
    (p) => `  ${String(p.menge ?? "").padStart(4)} ×  ${p.code ? p.code + "  " : ""}${p.name || ""}`);

  zeilen.push("", "Positionen");
  if (Array.isArray(d.kunden) && d.kunden.length) {
    d.kunden.forEach((k) => {
      zeilen.push("", `${k.name || "Kunde"}${k.objektnummer ? " · " + k.objektnummer : ""}`);
      zeilen.push(...pos(k.positionen));
    });
  } else if (Array.isArray(d.positionen) && d.positionen.length) {
    zeilen.push(...pos(d.positionen));
  } else {
    zeilen.push("  (keine Positionen übermittelt)");
  }

  zeilen.push("", d.pdf
    ? "Der vollständige Lagerauftrag liegt als PDF bei."
    : "Hinweis: Das PDF konnte auf dem Gerät der bestellenden Person nicht erzeugt werden. Der Lagerauftrag lässt sich im Adminbereich der App ausdrucken.");
  return zeilen.join("\n");
}

// ------------------------------------------------------------------- Webstar
function webstarText(d) {
  const objekt = (d.kunden && d.kunden[0]) || {};
  const z = [];
  z.push("Guten Tag");
  z.push("");
  z.push(`wir bestellen das nachstehende Material${objekt.name ? ` für unser Objekt ${objekt.name}` : ""}${objekt.objektnummer ? ` (Objekt-Nr. ${objekt.objektnummer})` : ""}.`);
  z.push("");
  z.push(`Bestellnummer:  ${d.nummer}`);
  if (datum(d.bestelldatum)) z.push(`Bestelldatum:   ${datum(d.bestelldatum)}`);
  if (d.lieferadresse)       z.push(`Lieferadresse:  ${d.lieferadresse}`);
  z.push("");
  z.push("Positionen");
  flach(d.kunden, d.positionen).forEach((p) => {
    if (p.titel) { z.push("", p.titel); return; }
    z.push(`  ${String(p.menge ?? "").padStart(4)} ×  ${(p.code || "—").padEnd(11)}${p.name || ""}`);
  });
  z.push("");
  z.push("Bitte liefern Sie direkt an die oben genannte Adresse und vermerken Sie");
  z.push("unsere Bestellnummer auf Lieferschein und Rechnung.");
  z.push("");
  z.push("Den Bestellschein finden Sie im beiliegenden PDF.");
  z.push("");
  z.push(`Für Rückfragen erreichen Sie uns unter T ${FIRMA.telefon}.`);
  z.push("");
  z.push("Freundliche Grüsse");
  z.push("");
  z.push(FIRMA.name);
  z.push(FIRMA.stelle);
  z.push(`${FIRMA.strasse}, ${FIRMA.ort} · T ${FIRMA.telefon} · ${FIRMA.web}`);
  return z.join("\n");
}

function webstarHtml(d) {
  const objekt = (d.kunden && d.kunden[0]) || {};
  const eck = [
    ["Bestellnummer", d.nummer],
    ["Bestelldatum", datum(d.bestelldatum)],
    ["Objekt-Nr.", objekt.objektnummer],
    ["Abteilung", d.abteilung],
  ].filter(([, w]) => w);

  const zeilen = flach(d.kunden, d.positionen).map((p) => {
    if (p.titel) {
      return `<tr><td colspan="3" style="padding:14px 10px 6px;font:600 12px/1.4 Verdana,Geneva,sans-serif;color:${PETROL}">${esc(p.titel)}</td></tr>`;
    }
    return `<tr>
      <td style="padding:7px 10px;border-top:1px solid ${LINIE};font:11px/1.4 'Courier New',monospace;color:${GRAU};white-space:nowrap">${esc(p.code || "—")}</td>
      <td style="padding:7px 10px;border-top:1px solid ${LINIE};font:12px/1.5 Verdana,Geneva,sans-serif;color:${INK}">${esc(p.name || "")}</td>
      <td style="padding:7px 10px;border-top:1px solid ${LINIE};font:600 12px/1.4 Verdana,Geneva,sans-serif;color:${INK};text-align:right;white-space:nowrap">${esc(p.menge)}</td>
    </tr>`;
  }).join("");

  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f3f8f8">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid ${LINIE};border-radius:10px">
  <tr><td style="padding:26px 28px 0">
    <div style="font:600 11px/1.4 Verdana,Geneva,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${TUERKIS}">${esc(FIRMA.name)}</div>
    <h1 style="margin:8px 0 0;font:700 21px/1.3 Verdana,Geneva,sans-serif;color:${PETROL}">Materialbestellung ${esc(d.nummer)}</h1>
    <div style="font:12px/1.5 Verdana,Geneva,sans-serif;color:${GRAU};margin-top:4px">${esc(FIRMA.ort.split(" ").slice(1).join(" ") || "Effretikon")}, ${esc(datumLang(d.bestelldatum))}</div>
  </td></tr>

  <tr><td style="padding:22px 28px 0;font:13px/1.65 Verdana,Geneva,sans-serif;color:${INK}">
    <p style="margin:0">Guten Tag</p>
    <p style="margin:12px 0 0">wir bestellen das nachstehende Material${objekt.name ? ` für unser Objekt <strong>${esc(objekt.name)}</strong>` : ""}. Bitte liefern Sie direkt an die unten genannte Adresse und vermerken Sie unsere Bestellnummer auf Lieferschein und Rechnung.</p>
  </td></tr>

  <tr><td style="padding:20px 28px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${HELL};border-top:2px solid ${TUERKIS}">
      <tr>${eck.map(([l]) => `<td style="padding:10px 12px 2px;font:600 9px/1.3 Verdana,Geneva,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${TUERKIS}">${esc(l)}</td>`).join("")}</tr>
      <tr>${eck.map(([, w]) => `<td style="padding:0 12px 11px;font:600 13px/1.3 Verdana,Geneva,sans-serif;color:${INK}">${esc(w)}</td>`).join("")}</tr>
    </table>
  </td></tr>

  <tr><td style="padding:24px 28px 0">
    <div style="font:600 13px/1.4 Verdana,Geneva,sans-serif;color:${PETROL};margin-bottom:8px">Bestellte Positionen</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <th align="left" style="padding:7px 10px;background:${TUERKIS};font:600 9px/1.3 Verdana,Geneva,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#ffffff">Artikelnummer</th>
        <th align="left" style="padding:7px 10px;background:${TUERKIS};font:600 9px/1.3 Verdana,Geneva,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#ffffff">Artikel</th>
        <th align="right" style="padding:7px 10px;background:${TUERKIS};font:600 9px/1.3 Verdana,Geneva,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#ffffff">Menge</th>
      </tr>
      ${zeilen || `<tr><td colspan="3" style="padding:10px;font:12px Verdana,Geneva,sans-serif;color:${GRAU}">Keine Positionen übermittelt</td></tr>`}
    </table>
  </td></tr>

  ${d.lieferadresse ? `<tr><td style="padding:22px 28px 0">
    <div style="font:600 9px/1.3 Verdana,Geneva,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${TUERKIS}">Lieferadresse</div>
    <div style="font:13px/1.6 Verdana,Geneva,sans-serif;color:${INK};margin-top:5px">${esc(d.lieferadresse)}</div>
  </td></tr>` : ""}

  <tr><td style="padding:22px 28px 0;font:13px/1.65 Verdana,Geneva,sans-serif;color:${INK}">
    <p style="margin:0">${d.pdf
      ? "Den vollständigen Lagerauftrag finden Sie im beiliegenden PDF."
      : "Den vollständigen Lagerauftrag senden wir auf Wunsch gerne nach."}</p>
    <p style="margin:12px 0 0">Für Rückfragen erreichen Sie uns unter T ${esc(FIRMA.telefon)}.</p>
    <p style="margin:18px 0 0">Freundliche Grüsse</p>
    <p style="margin:10px 0 0"><strong>${esc(FIRMA.name)}</strong><br>${esc(FIRMA.stelle)}</p>
  </td></tr>

  <tr><td style="padding:22px 28px 26px">
    <div style="border-top:1px solid ${LINIE};padding-top:12px;font:11px/1.6 Verdana,Geneva,sans-serif;color:${GRAU}">
      ${esc(FIRMA.name)} · ${esc(FIRMA.strasse)} · ${esc(FIRMA.ort)}<br>
      T ${esc(FIRMA.telefon)} · ${esc(FIRMA.web)}
    </div>
  </td></tr>
</table>
</body></html>`;
}

import { erstelleWebstarPdf, heuteLang } from "../lib/webstar-pdf.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ fehler: "Nur POST" });
  }

  const KEY  = process.env.RESEND_API_KEY;
  const FROM = process.env.MAIL_FROM || "materialbestellung@clean-service.ch";
  const ANTWORT = process.env.MAIL_ANTWORT || FROM;
  const EMPFAENGER = {
    lager:   process.env.MAIL_TO      || "cee2eda3.clean-service.ch@emea.teams.ms",
    webstar: process.env.MAIL_WEBSTAR || "info@webstar.ch",
  };
  // Die Bestellung an Webstar geht in Kopie an die Unterhaltsreinigung,
  // damit das Buero jede ausgeloeste Bestellung im Posteingang hat.
  const KOPIE_WEBSTAR = process.env.MAIL_WEBSTAR_CC || "unterhalt@clean-service.ch";

  if (!KEY) {
    return res.status(500).json({ fehler: "RESEND_API_KEY fehlt" });
  }

  try {
    const d = req.body || {};
    if (!d.nummer) {
      return res.status(400).json({ fehler: "nummer fehlt" });
    }

    const anWebstar = d.ziel === "webstar";
    const TO = EMPFAENGER[anWebstar ? "webstar" : "lager"];

    const nachricht = { from: FROM, to: [TO], reply_to: ANTWORT };
    if (anWebstar && KOPIE_WEBSTAR) nachricht.cc = [KOPIE_WEBSTAR];

    if (anWebstar) {
      nachricht.subject = `Materialbestellung ${d.nummer} · ${FIRMA.name}`;
      nachricht.text = webstarText(d);
      nachricht.html = webstarHtml(d);
    } else {
      // Betreff: Materialbestellung · SPEZ · Max Muster · 46481 · Fahrzeug 46
      const teile = ["Materialbestellung", d.abteilung || "", d.mitarbeiter || "", d.personalnummer || ""];
      if (d.fahrzeug) teile.push("Fahrzeug " + d.fahrzeug);
      nachricht.subject = teile.filter(Boolean).join(" · ");
      nachricht.text = lagerText(d);
    }

    if (anWebstar) {
      // Der Bestellschein wird hier erzeugt, im selben Aufbau wie der
      // Bestellschein der Hauswartung, damit Webstar von uns immer
      // dasselbe Dokument erhaelt.
      try {
        const objekt = (d.kunden && d.kunden[0]) || {};
        const adresse = String(d.lieferadresse || objekt.adresse || "");
        const teil = adresse.split(",");
        const pdf = await erstelleWebstarPdf({
          nr: d.nummer,
          lieferant: { name: "WEBSTAR (E. Weber & Cie AG)", email: TO },
          heute: heuteLang(),
          lieferdatum: /^\d{4}-\d{2}-\d{2}$/.test(String(d.bedarfsdatum || "")) ? d.bedarfsdatum : null,
          positionen: flach(d.kunden, d.positionen)
            .filter((p) => !p.titel)
            .map((p) => ({ nr: p.code || "", name: p.name || "", menge: p.menge })),
          objekt: {
            kunde: objekt.name || "",
            strasse: (teil[0] || "").trim(),
            ort: teil.slice(1).join(",").trim(),
            nr: objekt.objektnummer || "",
          },
          besteller: d.mitarbeiter || "",
        });
        nachricht.attachments = [
          { filename: `Bestellung_${d.nummer}.pdf`, content: pdf.toString("base64") },
        ];
      } catch (e) {
        console.warn("Bestellschein nicht erzeugbar:", e && e.message);
        if (d.pdf) nachricht.attachments = [{ filename: `Lagerauftrag_${d.nummer}.pdf`, content: d.pdf }];
      }
    } else if (d.pdf) {
      nachricht.attachments = [{ filename: `Lagerauftrag_${d.nummer}.pdf`, content: d.pdf }];
    }

    const antwort = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nachricht),
    });

    if (!antwort.ok) {
      const detail = await antwort.text();
      console.error("Resend-Fehler", antwort.status, detail);
      return res.status(502).json({ fehler: `Resend ${antwort.status}`, detail: detail.slice(0, 400) });
    }

    const daten = await antwort.json();
    console.log("Bestellmail versendet", d.nummer, daten.id,
                anWebstar ? "an Webstar" : "ans Lager", d.pdf ? "mit PDF" : "ohne PDF");
    return res.status(200).json({ ok: true, id: daten.id });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ fehler: String(e?.message || e) });
  }
}
