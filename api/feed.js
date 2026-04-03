// api/feed.js
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

  // Cache-Control: 30 сек в браузере, 60 сек на CDN
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");

  try {
    const { data, error } = await supabase
      .from("questions_with_stats")
      .select("id, author_id, text, option_yes, option_no, topic, closes_at, status, created_at, votes_yes, votes_no, total_votes")
      .in("status", ["active", "resolved_yes", "resolved_no"])
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("feed error:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    // Добавляем snapshot данные из таблицы questions (deprecated поля но нужны для delta)
    // Получаем их отдельным запросом чтобы не ломать view
    const ids = (data || []).map(q => q.id);
    let snapshots = {};
    if (ids.length > 0) {
      const { data: snData } = await supabase
        .from("questions")
        .select("id, votes_yes_snapshot, votes_no_snapshot, snapshot_at")
        .in("id", ids);
      if (snData) {
        snData.forEach(q => { snapshots[q.id] = q; });
      }
    }

    const enriched = (data || []).map(q => ({
      ...q,
      votes_yes_snapshot: snapshots[q.id]?.votes_yes_snapshot ?? null,
      votes_no_snapshot: snapshots[q.id]?.votes_no_snapshot ?? null,
      snapshot_at: snapshots[q.id]?.snapshot_at ?? null,
    }));

    return res.status(200).json({ ok: true, questions: enriched });
  } catch (e) {
    console.error("feed exception:", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
