// api/snapshot.js — обновляет снапшот голосов раз в сутки (вызывается cron)
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Защита — только GET с секретом или Vercel cron
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}` && req.headers['x-vercel-cron'] !== '1') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Берём все активные вопросы
  const { data: questions, error } = await db
    .from('questions')
    .select('id, votes_yes, votes_no')
    .eq('status', 'active');

  if (error) return res.status(500).json({ error: error.message });
  if (!questions?.length) return res.status(200).json({ updated: 0 });

  // Обновляем снапшот для каждого
  const updates = questions.map(q => ({
    id: q.id,
    votes_yes_snapshot: q.votes_yes,
    votes_no_snapshot: q.votes_no,
    snapshot_at: new Date().toISOString()
  }));

  const { error: upErr } = await db.from('questions').upsert(updates, { onConflict: 'id' });
  if (upErr) return res.status(500).json({ error: upErr.message });

  return res.status(200).json({ updated: updates.length, at: new Date().toISOString() });
}
