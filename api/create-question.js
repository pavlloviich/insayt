// api/create-question.js
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

  const { initData, text, option_yes, option_no, topic, closes_at } = req.body || {};

  // 1. Валидация Telegram
  if (!initData) return res.status(401).json({ ok: false, error: "missing_initData" });
  const user = validateTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!user) return res.status(401).json({ ok: false, error: "invalid_auth" });
  const author_id = user.id;

  // 2. Валидация полей
  const textTrim = (text || "").trim();
  if (!textTrim || textTrim.length < 10 || textTrim.length > 120) {
    return res.status(400).json({ ok: false, error: "invalid_text", message: "Вопрос: от 10 до 120 символов" });
  }
  if (!(option_yes || "").trim()) {
    return res.status(400).json({ ok: false, error: "invalid_option_yes", message: "Укажи вариант ДА" });
  }
  if (!(option_no || "").trim()) {
    return res.status(400).json({ ok: false, error: "invalid_option_no", message: "Укажи вариант НЕТ" });
  }
  if (!(topic || "").trim()) {
    return res.status(400).json({ ok: false, error: "invalid_topic", message: "Выбери тему" });
  }

  // Валидация даты
  let closesAtISO = null;
  if (closes_at) {
    const d = new Date(closes_at);
    const now = new Date();
    const max = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
    if (isNaN(d.getTime()) || d < now) {
      return res.status(400).json({ ok: false, error: "invalid_closes_at", message: "Дата должна быть в будущем" });
    }
    if (d > max) {
      return res.status(400).json({ ok: false, error: "invalid_closes_at", message: "Максимум 45 дней" });
    }
    closesAtISO = d.toISOString();
  }

  // 3. Лимит 3 вопроса в сутки
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("author_id", author_id)
    .gte("created_at", dayAgo);

  if (count >= 3) {
    return res.status(429).json({ ok: false, error: "question_limit_reached", message: "Лимит 3 вопроса в сутки" });
  }

  // 4. Создаём вопрос
  const { data, error } = await supabase
    .from("questions")
    .insert({
      author_id,
      text: textTrim,
      option_yes: option_yes.trim(),
      option_no: option_no.trim(),
      topic: topic.trim(),
      closes_at: closesAtISO,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    console.error("create-question error:", error);
    return res.status(500).json({ ok: false, error: "db_error", message: error.message });
  }

  return res.status(200).json({ ok: true, question: data });
}
