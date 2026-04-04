// api/questions.js
// Универсальный endpoint для чтения вопросов из questions_with_stats
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  const { id, author_id } = req.query;

  if (!id && !author_id) {
    return res.status(400).json({ ok: false, error: "provide id or author_id" });
  }

  try {
    let query = supabase
      .from("questions_with_stats")
      .select("id, author_id, text, option_yes, option_no, topic, status, closes_at, created_at, votes_yes, votes_no, total_votes");

    if (id) {
      query = query.eq("id", id).single();
      const { data, error } = await query;
      if (error) return res.status(404).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, questions: [data] });
    }

    if (author_id) {
      query = query.eq("author_id", author_id).order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, questions: data || [] });
    }
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
