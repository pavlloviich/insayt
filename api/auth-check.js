import crypto from 'crypto';

function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;

  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHash('sha256')
    .update(botToken)
    .digest();

  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return hmac === hash;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body);

    const { initData } = body || {};
    if (!initData) {
      return res.status(400).json({ error: 'initData required' });
    }

    const ok = verifyTelegramInitData(initData, process.env.BOT_TOKEN);

    return res.status(200).json({ ok });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
