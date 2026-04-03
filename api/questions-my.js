// api/questions-my.js
// Возвращает вопросы текущего пользователя с агрегированными голосами из view
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

  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ ok: false, error: "missing_initData" });

  const user = validateTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!user) return res.status(401).json({ ok: false, error: "invalid_auth" });

  const { data, error } = await supabase
    .from("questions_with_stats")
    .select("*")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true, questions: data });
}
