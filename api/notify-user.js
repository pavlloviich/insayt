// api/notify-user.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  // Vercel иногда не парсит body автоматически
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }

  const { user_id, text } = body || {};
  if (!user_id || !text) return res.status(400).json({ error: 'user_id and text required' });

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN not set in env' });

  try {
    const r = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: user_id, text, parse_mode: 'HTML' })
    });
    const d = await r.json();
    if (d.ok) return res.status(200).json({ ok: true, sent: 1 });
    return res.status(200).json({ ok: false, sent: 0, error: d.description });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
