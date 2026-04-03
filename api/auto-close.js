// api/auto-close.js
// Cron: каждый час проверяет истёкшие вопросы и ставит статус "awaiting"
// Запускается через vercel.json schedule
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Защита — только Vercel cron или секрет
  const auth = req.headers["authorization"];
  const isCron = req.headers["x-vercel-cron"] === "1";
  if (!isCron && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Находим активные вопросы с истёкшей датой
  const now = new Date().toISOString();
  const { data: expired, error } = await supabase
    .from("questions")
    .select("id, text, closes_at")
    .eq("status", "active")
    .lt("closes_at", now)
    .not("closes_at", "is", null);

  if (error) return res.status(500).json({ error: error.message });
  if (!expired || expired.length === 0) {
    return res.status(200).json({ ok: true, updated: 0 });
  }

  // Помечаем статусом "awaiting" — это кастомный статус для "ожидает итога"
  // Фронт и админка уже умеют его показывать
  const ids = expired.map(q => q.id);
  const { error: updateError } = await supabase
    .from("questions")
    .update({ status: "awaiting" })
    .in("id", ids);

  if (updateError) return res.status(500).json({ error: updateError.message });

  console.log(`auto-close: marked ${ids.length} questions as awaiting`);
  return res.status(200).json({ ok: true, updated: ids.length, ids });
}
