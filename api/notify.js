// api/notify.js
// Отправляет пуш всем проголосовавшим при закрытии вопроса
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const { question_id, result } = req.body || {};
  if (!question_id || !result) {
    return res.status(400).json({ ok: false, error: "question_id and result required" });
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) return res.status(500).json({ ok: false, error: "BOT_TOKEN not set" });

  // 1. Получаем вопрос
  const { data: question } = await supabase
    .from("questions")
    .select("id, text, option_yes, option_no, status")
    .eq("id", question_id)
    .single();

  if (!question) return res.status(404).json({ ok: false, error: "question not found" });

  // 2. Закрываем вопрос
  await supabase
    .from("questions")
    .update({ status: result })
    .eq("id", question_id);

  // 3. Получаем всех проголосовавших
  const { data: votes } = await supabase
    .from("votes")
    .select("user_id, choice")
    .eq("question_id", question_id);

  if (!votes || votes.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, total: 0 });
  }

  const isYes = result === "resolved_yes";
  const correctChoice = isYes ? "yes" : "no";
  const resultEmoji = isYes ? "✅" : "❌";
  const resultLabel = isYes ? question.option_yes : question.option_no;

  // 4. Формируем и шлём сообщения
  const appUrl = "https://t.me/insayt_app_bot";
  let sent = 0;
  let failed = 0;

  const sendPromises = votes.map(async (v) => {
    const isWinner = v.choice === correctChoice;
    const winEmoji = isWinner ? "🏆 Ты угадал!" : "😔 В этот раз нет";
    const points = isWinner ? "+50 очков" : "";

    const text =
      `${resultEmoji} <b>Итог вопроса</b>\n\n` +
      `<i>${question.text}</i>\n\n` +
      `Верный ответ: <b>${resultLabel}</b>\n\n` +
      `${winEmoji}${points ? " " + points : ""}\n\n` +
      `<a href="${appUrl}">Открыть ИНСАЙТ →</a>`;

    try {
      const r = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: v.user_id,
            text,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        }
      );
      const d = await r.json();
      if (d.ok) sent++;
      else failed++;
    } catch (e) {
      failed++;
    }
  });

  // Батчами по 25 чтобы не превысить rate limit Telegram
  const batchSize = 25;
  for (let i = 0; i < sendPromises.length; i += batchSize) {
    await Promise.all(sendPromises.slice(i, i + batchSize));
    if (i + batchSize < sendPromises.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return res.status(200).json({ ok: true, sent, failed, total: votes.length });
}
