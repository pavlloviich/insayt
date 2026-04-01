import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    let body = req.body;

    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const { user_id, question_id, vote } = body;

    if (!user_id || !question_id || !vote) {
      return res.status(400).json({ error: 'Missing params' });
    }

    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'Invalid vote value' });
    }

    // 1. записываем голос
    const { error: voteError } = await db
      .from('votes')
      .insert({
        user_id,
        question_id,
        choice: vote
      });

    if (voteError) {
      return res.status(500).json({ error: voteError.message });
    }

    // 2. обновляем счётчики
    const field = vote === 'yes' ? 'votes_yes' : 'votes_no';

    const { error: updateError } = await db.rpc('increment_vote', {
      q_id: question_id,
      field_name: field
    });

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
