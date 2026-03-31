const { createClient } = require('@supabase/supabase-js');

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const BOT_TOKEN = process.env.BOT_TOKEN;

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    })
  });
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question_id, result } = req.body;
  if (!question_id || !result) return res.status(400).json({ error: 'Missing params' });

  // Закрываем вопрос
  const { error: resolveError } = await db.rpc('resolve_question', {
    q_id: question_id,
    result: result
  });
  if (resolveError) return res.status(500).json({ error: resolveError.message });

  // Получаем вопрос
  const { data: question } = await db
    .from('questions')
    .select('text, option_yes, option_no')
    .eq('id', question_id)
    .single();

  const resolvedYes = result === 'resolved_yes';
  const correctAnswer = resolvedYes ? question.option_yes : question.option_no;
  const wrongAnswer = resolvedYes ? question.option_no : question.option_yes;

  // Находим всех кто голосовал
  const { data: votes } = await db
    .from('votes')
    .select('user_id, choice')
    .eq('question_id', question_id);

  if (!votes || votes.length === 0) return res.status(200).json({ sent: 0 });

  // Получаем Telegram ID пользователей
  const userIds = votes.map(v => v.user_id);
  const { data: users } = await db
    .from('users')
    .select('id, name')
    .in('id', userIds);

  const usersMap = {};
  users.forEach(u => usersMap[u.id] = u);

  // Отправляем уведомления
  let sent = 0;
  for (const vote of votes) {
    const user = usersMap[vote.user_id];
    if (!user) continue;

    const guessedRight = (vote.choice === 'yes' && resolvedYes) || (vote.choice === 'no' && !resolvedYes);

    const text = guessedRight
      ? `🎯 <b>Ты угадал!</b>\n\n<i>${question.text}</i>\n\nПравильный ответ: <b>${correctAnswer}</b>\n\n+50 очков начислено 🏆`
      : `😔 <b>В этот раз не угадал</b>\n\n<i>${question.text}</i>\n\nПравильный ответ: <b>${correctAnswer}</b>\n\nНе расстраивайся — следующий прогноз будет лучше 💪`;

    try {
      await sendMessage(user.id, text);
      sent++;
    } catch (e) {
      console.error('Failed to send to', user.id, e);
    }
  }

  return res.status(200).json({ success: true, sent, total: votes.length });
};
