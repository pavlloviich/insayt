import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return calculatedHash === hash;
}

function getTelegramUserFromInitData(initData) {
  const params = new URLSearchParams(initData);
  const userRaw = params.get('user');
  if (!userRaw) return null;

  try {
    return JSON.parse(userRaw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      body = JSON.parse(body);
    }

    const { initData, question_id, vote } = body || {};

    if (!initData || !question_id || !vote) {
      return res.status(400).json({ error: 'Missing params' });
    }

    if (!['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'Invalid vote value' });
    }

    const isValid = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid Telegram auth' });
    }

    const telegramUser = getTelegramUserFromInitData(initData);
    if (!telegramUser?.id) {
      return res.status(400).json({ error: 'Telegram user not found in initData' });
    }

    const user_id = telegramUser.id;

    const { data: insertedVote, error: voteError } = await db
      .from('votes')
      .insert({
        user_id,
        question_id,
        choice: vote
      })
      .select();

    if (voteError) {
      if (voteError.message.includes('duplicate key')) {
        return res.status(200).json({ ok: true, duplicate: true });
      }

      return res.status(500).json({
        step: 'insert_vote',
        error: voteError.message
      });
    }

    const field = vote === 'yes' ? 'votes_yes' : 'votes_no';

    const { error: updateError } = await db.rpc('increment_vote', {
      q_id: question_id,
      field_name: field
    });

    if (updateError) {
      return res.status(500).json({
        step: 'increment_vote',
        error: updateError.message
      });
    }

    const { data: questionAfter, error: questionError } = await db
      .from('questions')
      .select('id, votes_yes, votes_no')
      .eq('id', question_id)
      .single();

    if (questionError) {
      return res.status(500).json({
        step: 'select_question_after',
        error: questionError.message
      });
    }

    return res.status(200).json({
      ok: true,
      inserted_vote: insertedVote,
      question_after: questionAfter
    });

  } catch (e) {
    return res.status(500).json({
      step: 'catch',
      error: e.message
    });
  }
}
