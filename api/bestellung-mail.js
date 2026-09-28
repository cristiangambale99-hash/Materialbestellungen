// Vercel Serverless Function: /api/bestellung-mail
//
// Nimmt eine abgeschickte Bestellung entgegen und sendet sie per Resend an den
// Teams-Kanal des Lagers. Ausgeloest wird das ausschliesslich in dem Moment,
// in dem eine Mitarbeiterin die Bestellung absendet -- nicht beim Statuswechsel
// im Adminbereich. Die Beekeeper-Nachricht an die bestellende Person loest
// davon unabhaengig die Datenbank aus, sobald das Lager auf "erledigt" setzt.
//
// Das PDF liegt bei, wenn der Browser es erzeugen konnte. Gelingt das nicht,
// geht die Mail trotzdem raus -- dann steht die vollstaendige Positionsliste
// im Text, damit das Lager in jedem Fall arbeiten kann.
//
// Benoetigte Environment Variables in Vercel:
//   RESEND_API_KEY   z.B. re_xxxxxxxxxxxx           (Pflicht)
//   MAIL_TO          cee2eda3.clean-service.ch@emea.teams.ms
//   MAIL_FROM        materialbestellung@clean-service.ch
//                    (Domain muss bei Resend verifiziert sein)
//
// Der Schluessel bleibt serverseitig und gelangt nie in den Browser.

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ fehler: "Nur POST" });
  }

  const KEY  = process.env.RESEND_API_KEY;
  const TO   = process.env.MAIL_TO   || "cee2eda3.clean-service.ch@emea.teams.ms";
  const FROM = process.env.MAIL_FROM || "materialbestellung@clean-service.ch";

  if (!KEY) {
    return res.status(500).json({ fehler: "RESEND_API_KEY fehlt" });
  }

  try {
    const { nummer, abteilung, mitarbeiter, personalnummer, fahrzeug, lieferung,
            bestelldatum, bedarfsdatum, kunden, positionen, pdf } = req.body || {};

    // 2026-09-25 -> 25.09.2026
    const datum = (d) => {
      if (!d) return null;
      const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[3]}.${m[2]}.${m[1]}` : String(d);
    };

    // Die Bestellnummer genuegt; das PDF ist ausdruecklich optional.
    if (!nummer) {
      return res.status(400).json({ fehler: "nummer fehlt" });
    }

    // Betreff: Materialbestellung · SPEZ · Max Muster · 46481 · Fahrzeug 46
    const teile = ["Materialbestellung", abteilung || "", mitarbeiter || "", personalnummer || ""];
    if (fahrzeug) teile.push("Fahrzeug " + fahrzeug);
    const betreff = teile.filter(Boolean).join(" · ");

    const zeilen = [
      `Bestellnummer: ${nummer}`,
      `Abteilung: ${abteilung || "–"}`,
      `Mitarbeiter/in: ${mitarbeiter || "–"} (Personalnr. ${personalnummer || "–"})`,
    ];
    if (fahrzeug) zeilen.push(`Fahrzeug: ${fahrzeug}`);
    if (lieferung) zeilen.push(`Lieferung: ${lieferung}`);
    if (datum(bestelldatum)) zeilen.push(`Bestellt am: ${datum(bestelldatum)}`);
    if (datum(bedarfsdatum)) zeilen.push(`Benötigt bis: ${datum(bedarfsdatum)}`);

    // Positionsliste im Text: Der Lagerist sieht die Bestellung damit auch,
    // wenn kein PDF beiliegt oder der Anhang in Teams nicht aufgeht.
    const pos = (liste) => (liste || []).map(
      (p) => `  ${String(p.menge ?? "").padStart(4)} ×  ${p.code ? p.code + "  " : ""}${p.name || ""}`
    );

    zeilen.push("", "Positionen");
    if (Array.isArray(kunden) && kunden.length) {
      kunden.forEach((k) => {
        zeilen.push("", `${k.name || "Kunde"}${k.objektnummer ? " · " + k.objektnummer : ""}`);
        zeilen.push(...pos(k.positionen));
      });
    } else if (Array.isArray(positionen) && positionen.length) {
      zeilen.push(...pos(positionen));
    } else {
      zeilen.push("  (keine Positionen übermittelt)");
    }

    zeilen.push("", pdf
      ? "Der vollständige Lagerauftrag liegt als PDF bei."
      : "Hinweis: Das PDF konnte auf dem Gerät der bestellenden Person nicht erzeugt werden. Der Lagerauftrag lässt sich im Adminbereich der App ausdrucken.");

    const nachricht = {
      from: FROM,
      to: [TO],
      subject: betreff,
      text: zeilen.join("\n"),
    };
    if (pdf) {
      nachricht.attachments = [{ filename: `Lagerauftrag_${nummer}.pdf`, content: pdf }];
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
    console.log("Bestellmail versendet", nummer, daten.id, pdf ? "mit PDF" : "ohne PDF");
    return res.status(200).json({ ok: true, id: daten.id });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ fehler: String(e?.message || e) });
  }
}
