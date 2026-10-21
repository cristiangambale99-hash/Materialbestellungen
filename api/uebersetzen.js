// Vercel Serverless Function: übersetzt Texte ins Deutsche (DeepL, sonst Ersatzdienst).
// Test im Browser: /api/uebersetzen?test=Buongiorno
import { uebersetzeTexte } from '../lib/uebersetzung.js';

export default async function handler(req, res) {
  let texte;
  if (req.method === 'GET' && req.query && req.query.test) texte = [String(req.query.test)];
  else if (req.method === 'POST') {
    const origin = req.headers.origin || '', host = req.headers.host || '';
    if (origin && !origin.endsWith('//' + host)) return res.status(403).json({ error: 'Nicht erlaubt' });
    const body = req.body || {};
    texte = (Array.isArray(body.texte) ? body.texte : [body.text]).filter(t => typeof t === 'string' && t.trim()).map(t => t.trim());
  } else return res.status(405).json({ error: 'Nur POST erlaubt' });

  if (!texte.length) return res.status(400).json({ error: 'Text fehlt' });
  if (texte.length > 10 || texte.join('').length > 8000) return res.status(413).json({ error: 'Text zu lang' });
  try { const j = await uebersetzeTexte(texte); return res.status(200).json({ ...j, text_de: j.texte_de[0] }); }
  catch (e) { return res.status(502).json({ error: 'Übersetzung nicht erreichbar', details: e.details || [String(e.message || e)] }); }
}
