import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await db
      .from('questions')
      .select('id')
      .limit(1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      ok: true,
      db: 'connected',
      sample: data
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
