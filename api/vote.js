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

    const { data: insertedVote, error: voteError } = await db
      .from('votes')
      .insert({
        user_id,
        question_id,
        choice: vote
      })
      .select();

    if (voteError) {
      return res.status(500).json({ step: 'insert_vote', error: voteError.message });
    }

    const field = vote === 'yes' ? 'votes_yes' : 'votes_no';

    const { error: updateError } = await db.rpc('increment_vote', {
      q_id: question_id,
      field_name: field
    });

    if (updateError) {
      return res.status(500).json({ step: 'increment_vote', error: updateError.message });
    }

    const { data: questionAfter, error: questionError } = await db
      .from('questions')
      .select('id, votes_yes, votes_no')
      .eq('id', question_id)
      .single();

    if (questionError) {
      return res.status(500).json({ step: 'select_question_after', error: questionError.message });
    }

    return res.status(200).json({
      ok: true,
      inserted_vote: insertedVote,
      question_after: questionAfter
    });

  } catch (e) {
    return res.status(500).json({ step: 'catch', error: e.message });
  }
}
