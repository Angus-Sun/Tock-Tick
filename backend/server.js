import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

import { supabase } from './supabase.js';

// --- Performance Points calculation ---
function calculatePerformancePoints(accuracy, lengthSeconds, options = {}) {
  const { basePP = 100, lengthUnit = 30 } = options;

  // Coerce and validate
  accuracy = Number(accuracy);
  lengthSeconds = Number(lengthSeconds);
  if (!Number.isFinite(accuracy) || !Number.isFinite(lengthSeconds)) {
    throw new Error('accuracy and lengthSeconds must be numbers');
  }

  // clamp
  accuracy = Math.max(0, Math.min(1, accuracy));
  lengthSeconds = Math.max(0, lengthSeconds);

  // If accuracy < 0.5 -> 0 PP (standing still baseline)
  if (accuracy < 0.5) return 0;

  // normalize so 0.5 -> 0 and 1.0 -> 1.0
  const normalizedAccuracy = (accuracy - 0.5) * 2; // range 0..1

  // length factor: minimum 1, scales linearly by lengthUnit seconds
  const lengthFactor = Math.max(1, lengthSeconds / lengthUnit);

  const rawPP = normalizedAccuracy * basePP * lengthFactor;
  return Math.round(rawPP);
}

// POST /api/pp -> compute PP and return pass flag
app.post('/api/pp', (req, res) => {
  try {
    const { accuracy, lengthSeconds } = req.body || {};
    if (accuracy == null || lengthSeconds == null) {
      return res.status(400).json({ error: 'accuracy and lengthSeconds are required' });
    }
    const pp = calculatePerformancePoints(accuracy, lengthSeconds);
    const pass = Number(accuracy) >= 0.5;
    return res.json({ pp, pass, accuracy: Number(accuracy), lengthSeconds: Number(lengthSeconds) });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/submit-score -> compute PP, fetch username and insert into Supabase 'scores' table
app.post('/api/submit-score', async (req, res) => {
  try {
    const { challenge_id, player_id, accuracy, lengthSeconds, mimic_url } = req.body || {};
    if (!challenge_id || !player_id || accuracy == null || lengthSeconds == null) {
      return res.status(400).json({ error: 'challenge_id, player_id, accuracy and lengthSeconds are required' });
    }

    const pp = calculatePerformancePoints(accuracy, lengthSeconds);
    const pass = Number(accuracy) >= 0.5;

    // Lookup username from profiles (service role key used by backend)
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', player_id)
      .single();

    const playerName = profile?.username || player_id;

    // Insert into scores table. score stored as percentage (0-100)
    const { error: insertErr, data: insertData } = await supabase.from('scores').insert([
      {
        challenge_id,
        player: playerName,
        player_id,
        score: Number(accuracy) * 100,
        mimic_url,
      }
    ]).select();

    if (profileErr) console.warn('profile lookup error', profileErr);
    if (insertErr) return res.status(500).json({ error: insertErr.message });

    return res.json({ pp, pass, inserted: insertData?.[0] || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Socket handler for real-time PP calculation
io.on('connection', (socket) => {
  socket.on('calculate_pp', (payload, ack) => {
    try {
      const { accuracy, lengthSeconds } = payload || {};
      const pp = calculatePerformancePoints(Number(accuracy), Number(lengthSeconds));
      const pass = Number(accuracy) >= 0.5;
      const result = { pp, pass };
      if (typeof ack === 'function') ack(result);
      else socket.emit('pp_result', result);
    } catch (err) {
      if (typeof ack === 'function') ack({ error: err.message });
      else socket.emit('pp_error', { error: err.message });
    }
  });
});

server.listen(3001, () => console.log('Backend running on http://localhost:3001'));
