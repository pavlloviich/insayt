// api/comment.js
// Создаёт комментарий с rate limiting: 10/час, 30/сутки
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function validateTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (expectedHash !== hash) return null;
  try { return JSON.parse(params.get("user")); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const { initData, question_id, text, parent_id } = req.body || {};

  if (!initData || !question_id || !text?.trim()) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }
  if (text.trim().length > 500) {
    return res.status(400).json({ ok: false, error: "too_long", max: 500 });
  }

  // 1. Валидация Telegram
  const user = validateTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!user) return res.status(401).json({ ok: false, error: "invalid_auth" });
  const user_id = user.id;

  // 2. Проверяем лимиты
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayAgo  = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: hourCount }, { count: dayCount }] = await Promise.all([
    supabase.from("comments").select("*", { count: "exact", head: true })
      .eq("user_id", user_id).gte("created_at", hourAgo),
    supabase.from("comments").select("*", { count: "exact", head: true })
      .eq("user_id", user_id).gte("created_at", dayAgo),
  ]);

  if (hourCount >= 10) {
    return res.status(429).json({ ok: false, error: "hourly_limit", message: "Лимит 10 комментариев в час" });
  }
  if (dayCount >= 30) {
    return res.status(429).json({ ok: false, error: "daily_limit", message: "Лимит 30 комментариев в сутки" });
  }

  // 3. Проверяем что вопрос существует
  const { data: q } = await supabase
    .from("questions").select("id").eq("id", question_id).single();
  if (!q) return res.status(404).json({ ok: false, error: "question_not_found" });

  // 4. Создаём комментарий
  const { data, error } = await supabase.from("comments").insert({
    question_id,
    user_id,
    parent_id: parent_id || null,
    text: text.trim(),
  }).select().single();

  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({
    ok: true,
    comment: data,
    remaining: { hour: 10 - hourCount - 1, day: 30 - dayCount - 1 },
  });
}
