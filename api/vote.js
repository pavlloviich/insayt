// api/vote.js
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ─── RATE LIMIT STORAGE ───────────────────────────────────────────────────────
const lastVoteTime = new Map();
const RATE_LIMIT_MS = 2000;
// ─────────────────────────────────────────────────────────────────────────────

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

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (expectedHash !== hash) return null;

  const userParam = params.get("user");
  if (!userParam) return null;

  try {
    return JSON.parse(userParam);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const { initData, question_id, vote } = req.body || {};

  if (!initData || !question_id || !vote) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  // 1. Validate Telegram initData
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const user = validateTelegramInitData(initData, BOT_TOKEN);

  if (!user) {
    return res.status(401).json({ ok: false, error: "invalid_auth" });
  }

  // 2. Extract user_id from validated initData — NEVER trust client
  const user_id = user.id;

  // 3. Rate limiting — in-memory, MVP-grade
  const now = Date.now();
  const last = lastVoteTime.get(user_id);

  if (last && now - last < RATE_LIMIT_MS) {
    return res.status(429).json({ ok: false, error: "rate_limited" });
  }

  lastVoteTime.set(user_id, now);

  if (lastVoteTime.size > 1000) {
    const cutoff = now - RATE_LIMIT_MS * 10;
    for (const [uid, ts] of lastVoteTime.entries()) {
      if (ts < cutoff) lastVoteTime.delete(uid);
    }
  }

  // 4. Insert into votes — single source of truth
  const { error } = await supabase.from("votes").insert({
    user_id,
    question_id,
    choice: vote,
  });

  if (error) {
    if (error.code === "23505") {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    return res.status(500).json({ ok: false, error: error.message });
  }

  // 5. Return fresh aggregated data from view for instant UI update
  // Frontend (index.html) expects data.question_after to update percentages
  const { data: questionAfter } = await supabase
    .from("questions_with_stats")
    .select("votes_yes, votes_no, total_votes, option_yes, option_no")
    .eq("id", question_id)
    .single();

  return res.status(200).json({
    ok: true,
    question_after: questionAfter || null,
  });
}
