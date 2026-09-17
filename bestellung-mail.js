// Vercel Serverless Function: /api/bestellung-mail
//
// Nimmt das im Browser erzeugte Lagerauftrag-PDF entgegen und sendet es per
// Resend an die hinterlegte Empfaengeradresse (Teams-Kanal).
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
    const { nummer, abteilung, mitarbeiter, personalnummer, fahrzeug, pdf } = req.body || {};

    if (!nummer || !pdf) {
      return res.status(400).json({ fehler: "nummer oder pdf fehlt" });
    }

    // Betreff: Materialbestellung SPEZ · Max Muster · 46481 · Fahrzeug 46
    const teile = ["Materialbestellung", abteilung || "", mitarbeiter || "", personalnummer || ""];
    if (fahrzeug) teile.push("Fahrzeug " + fahrzeug);
    const betreff = teile.filter(Boolean).join(" · ");

    const zeilen = [
      `Bestellnummer: ${nummer}`,
      `Abteilung: ${abteilung || "–"}`,
      `Mitarbeiter/in: ${mitarbeiter || "–"} (Personalnr. ${personalnummer || "–"})`,
    ];
    if (fahrzeug) zeilen.push(`Fahrzeug: ${fahrzeug}`);
    zeilen.push("", "Der vollständige Lagerauftrag liegt als PDF bei.");

    const antwort = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: betreff,
        text: zeilen.join("\n"),
        attachments: [
          { filename: `Lagerauftrag_${nummer}.pdf`, content: pdf },
        ],
      }),
    });

    if (!antwort.ok) {
      const detail = await antwort.text();
      console.error("Resend-Fehler", antwort.status, detail);
      return res.status(502).json({ fehler: `Resend ${antwort.status}`, detail: detail.slice(0, 400) });
    }

    const daten = await antwort.json();
    return res.status(200).json({ ok: true, id: daten.id });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ fehler: String(e?.message || e) });
  }
}
