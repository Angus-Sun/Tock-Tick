import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { 
  calculateComprehensiveScore, 
  calculatePerformancePoints,
  assessChallengeDifficulty,
  getPlayerRank,
  calculateLeaderboardPosition 
} from "./utils/scoring.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || 'your-supabase-url',
  process.env.SUPABASE_SERVICE_KEY || 'your-service-key'
);

// API Routes

// Calculate comprehensive score for a performance
app.post('/api/calculate-score', async (req, res) => {
  try {
    const { 
      stepScores = [], 
      timingData = [], 
      referenceSequence = [], 
      userPoses = [],
      challengeId,
      userId 
    } = req.body;

    if (!challengeId || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: challengeId and userId' 
      });
    }

    // Calculate comprehensive score
    const scoreResult = calculateComprehensiveScore({
      stepScores,
      timingData,
      referenceSequence,
      userPoses
    });

    // Get player history for PP calculation
    const { data: userStats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    const { data: personalBestData } = await supabase
      .from('scores')
      .select('score')
      .eq('player_id', userId)
      .eq('challenge_id', challengeId)
      .order('score', { ascending: false })
      .limit(1)
      .single();

    const { data: recentScores } = await supabase
      .from('scores')
      .select('score')
      .eq('player_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    const playerHistory = {
      personalBest: personalBestData?.score || 0,
      recentScores: recentScores?.map(s => s.score) || [],
      totalPlays: userStats?.total_plays || 0,
      currentStreak: userStats?.current_streak || 0
    };

    // Calculate PP earned
    const ppResult = calculatePerformancePoints(scoreResult, playerHistory);

    // Get challenge scores for leaderboard position
    const { data: challengeScores } = await supabase
      .from('scores')
      .select('score')
      .eq('challenge_id', challengeId);

    const allScores = challengeScores?.map(s => s.score) || [];
    const leaderboardPosition = calculateLeaderboardPosition(scoreResult.finalScore, allScores);

    const response = {
      ...scoreResult,
      ppData: ppResult,
      leaderboardPosition,
      playerRank: getPlayerRank((userStats?.total_pp || 0) + ppResult.totalPP)
    };

    res.json(response);

  } catch (error) {
    console.error('Score calculation error:', error);
    res.status(500).json({ error: 'Failed to calculate score' });
  }
});

// Submit score and update all related data
app.post('/api/submit-score', async (req, res) => {
  try {
    let {
      challengeId,
      userId,
      playerName,
      mimicUrl,
      scoreData,
      ppData
    } = req.body;

    // Helpful debug logging for failed submissions
    console.log('[/api/submit-score] incoming request', {
      challengeId: challengeId || null,
      userId: userId || null,
      playerName: playerName || null,
      mimicUrl: mimicUrl ? '<present>' : null,
      scoreDataPresent: !!scoreData,
      ppDataPresent: !!ppData,
      ip: req.ip,
      origin: req.get('origin')
    });

    const missing = {};
    if (!challengeId) missing.challengeId = true;
    if (!userId) missing.userId = true;
    if (!playerName) missing.playerName = true;
    if (!scoreData) missing.scoreData = true;

    if (Object.keys(missing).length > 0) {
      console.warn('[/api/submit-score] missing fields in request', missing);
      return res.status(400).json({ 
        error: 'Missing required fields',
        missing
      });
    }

    // Ensure we have an authoritative PP value on the server BEFORE inserting score.
    // If client didn't send PP, compute PP here. Accept 0 as valid (e.g., from early completion penalty)
    let effectivePP = (ppData && typeof ppData.totalPP === 'number') ? ppData.totalPP : null;
    if (effectivePP == null) {
      try {
        // Fetch player history for PP calculation
        const { data: userStatsForCalc } = await supabase
          .from('user_stats')
          .select('*')
          .eq('user_id', userId)
          .single();

        const { data: personalBestData } = await supabase
          .from('scores')
          .select('score')
          .eq('player_id', userId)
          .eq('challenge_id', challengeId)
          .order('score', { ascending: false })
          .limit(1)
          .single();

        const { data: recentScores } = await supabase
          .from('scores')
          .select('score')
          .eq('player_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);

        const playerHistory = {
          personalBest: personalBestData?.score || 0,
          recentScores: recentScores?.map(s => s.score) || [],
          totalPlays: userStatsForCalc?.total_plays || 0,
          currentStreak: userStatsForCalc?.current_streak || 0
        };

        const ppResult = calculatePerformancePoints(scoreData, playerHistory);
        effectivePP = ppResult.totalPP;
        // replace ppData so we keep breakdown/metadata consistent
        ppData = ppResult;
        console.log('Server-calculated PP:', effectivePP);
      } catch (e) {
        console.error('Failed to calculate PP server-side:', e);
        effectivePP = 0;
      }
    }

    // Insert score record with PP included
    console.log('Inserting score with PP:', effectivePP);
    const { data: scoreRecord, error: scoreError } = await supabase
      .from('scores')
      .insert([{
        challenge_id: challengeId,
        player: playerName,
        player_id: userId,
        score: scoreData.finalScore,
        mimic_url: mimicUrl,
        pp_earned: effectivePP || 0
      }])
      .select()
      .single();

    if (scoreError) {
      console.error('Error inserting score:', scoreError);
      throw scoreError;
    }
    
    console.log('Score inserted successfully with pp_earned:', scoreRecord.pp_earned);

    // Record PP history (use effectivePP)
    if (typeof effectivePP === 'number' && effectivePP > 0) {
      const { data: currentStats } = await supabase
        .from('user_stats')
        .select('total_pp')
        .eq('user_id', userId)
        .single();

      const previousTotal = currentStats?.total_pp || 0;
      const { data: ppHistoryData, error: ppHistoryError } = await supabase
        .from('pp_history')
        .insert([{
          user_id: userId,
          score_id: scoreRecord.id,
          challenge_id: challengeId,
          pp_earned: effectivePP,
          pp_breakdown: ppData.breakdown || {},
          previous_total_pp: previousTotal,
          new_total_pp: previousTotal + effectivePP
        }])
        .select();

      if (ppHistoryError) {
        console.error('Failed inserting pp_history:', ppHistoryError);
      } else {
        console.log('Inserted pp_history id(s):', ppHistoryData?.map(d=>d.id));
      }
    }

    // Update or create user_stats with new PP and play counts
    if (ppData?.totalPP >= 0) {
      try {
        const { data: existingStats } = await supabase
          .from('user_stats')
          .select('*')
          .eq('user_id', userId)
          .single();

  const prevTotal = existingStats?.total_pp || 0;
  const prevPlays = existingStats?.total_plays || 0;
  const newTotal = prevTotal + (effectivePP || 0);

        if (existingStats) {
          const { data: updatedStats, error: updateError } = await supabase
            .from('user_stats')
            .update({
              total_pp: newTotal,
              total_plays: prevPlays + 1,
              last_played: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .select()
            .single();

          if (updateError) console.error('Failed updating user_stats:', updateError);
          else console.log('Updated user_stats:', updatedStats);
        } else {
          const { data: insertedStats, error: insertError } = await supabase
            .from('user_stats')
            .insert([{
              user_id: userId,
              display_name: playerName,
              total_pp: newTotal,
              total_plays: 1,
              current_streak: ppData.metadata?.isPersonalBest ? 1 : 0,
              last_played: new Date().toISOString()
            }])
            .select()
            .single();

          if (insertError) console.error('Failed inserting user_stats:', insertError);
          else console.log('Inserted user_stats:', insertedStats);
        }
      } catch (err) {
        console.error('Failed updating user_stats:', err);
      }
    }

    // Update challenge metadata
    await updateChallengeMetadata(challengeId, scoreData.finalScore);

    // Trigger global leaderboard update
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('update_global_leaderboard');
      if (rpcError) {
        console.error('update_global_leaderboard RPC error:', rpcError);
      } else {
        console.log('update_global_leaderboard RPC result:', rpcData);
      }
    } catch (rpcEx) {
      console.error('Exception calling update_global_leaderboard RPC:', rpcEx);
    }
    // Fetch final user_stats to return to client for confirmation
    let finalUserStats = null;
    try {
      const { data: fetchedStats } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', userId)
        .single();
      finalUserStats = fetchedStats || null;
    } catch (e) {
      console.error('Failed fetching final user_stats:', e);
    }

    // Fetch the player's global_leaderboard entry to show current rank (if present)
    let leaderboardEntry = null;
    try {
      const { data: lbEntry, error: lbError } = await supabase
        .from('global_leaderboard')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (lbError && lbError.code !== 'PGRST116') { // ignore "No rows found" style errors
        console.error('Error fetching global_leaderboard entry:', lbError);
      } else {
        leaderboardEntry = lbEntry || null;
      }
    } catch (e) {
      console.error('Failed fetching leaderboard entry:', e);
    }

    // If leaderboard entry is missing, try an upsert fallback so recent players appear immediately
    if (!leaderboardEntry) {
      try {
        const upsertPayload = {
          user_id: userId,
          username: playerName,
          total_pp: finalUserStats?.total_pp || (ppData?.totalPP || 0),
          rank_tier: finalUserStats ? getPlayerRank(finalUserStats.total_pp)?.tier : null,
          last_updated: new Date().toISOString()
        };

        const { data: upsertRes, error: upsertErr } = await supabase
          .from('global_leaderboard')
          .upsert([upsertPayload], { onConflict: 'user_id' })
          .select()
          .single();

        if (upsertErr) {
          console.error('Failed upserting global_leaderboard fallback:', upsertErr);
        } else {
          console.log('Upserted fallback leaderboard entry:', upsertRes);
          leaderboardEntry = upsertRes;
        }
      } catch (e) {
        console.error('Exception during leaderboard upsert fallback:', e);
      }
    }

    // Return detail about stored objects
    res.json({ 
      success: true, 
      scoreId: scoreRecord.id,
      message: 'Score submitted successfully',
      ppStored: ppData?.totalPP || 0,
      userStats: finalUserStats,
      leaderboardEntry
    });

  } catch (error) {
    console.error('Score submission error:', error);
    res.status(500).json({ error: 'Failed to submit score' });
  }
});

// Get user statistics and ranking
app.get('/api/user-stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: userStats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    const { data: rankData } = await supabase
      .rpc('get_user_rank', { user_uuid: userId });

    const { data: recentScores } = await supabase
      .from('scores')
      .select(`
        score,
        pp_earned,
        created_at,
        challenges(title)
      `)
      .eq('player_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    res.json({
      stats: userStats,
      ranking: rankData?.[0] || null,
      recentActivity: recentScores || [],
      playerRank: userStats ? getPlayerRank(userStats.total_pp) : null
    });

  } catch (error) {
    console.error('User stats error:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

// Get global leaderboard
app.get('/api/global-leaderboard', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const { data: leaderboard } = await supabase
      .from('global_leaderboard')
      .select('*')
      .order('rank_position', { ascending: true })
      .range(offset, offset + limit - 1);

    res.json(leaderboard || []);

  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get leaderboard around a user (surrounding ranks)
app.get('/api/global-leaderboard/around/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const radius = parseInt(req.query.radius || '5', 10);

    // Fetch the user's leaderboard entry
    const { data: userEntry } = await supabase
      .from('global_leaderboard')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!userEntry) {
      // Return top if user is not on leaderboard
      const { data: top } = await supabase
        .from('global_leaderboard')
        .select('*')
        .order('rank_position', { ascending: true })
        .limit(radius * 2 + 1);

      return res.json({ around: top || [], user: null });
    }

    const start = Math.max(1, userEntry.rank_position - radius);
    const end = userEntry.rank_position + radius;

    const { data: around } = await supabase
      .from('global_leaderboard')
      .select('*')
      .order('rank_position', { ascending: true })
      .range(start - 1, end - 1); // range is zero-indexed

    res.json({ around: around || [], user: userEntry });
  } catch (error) {
    console.error('Leaderboard around user error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard around user' });
  }
});

// Helper function to update challenge metadata
async function updateChallengeMetadata(challengeId, newScore) {
  try {
    // Get current metadata
    const { data: metadata } = await supabase
      .from('challenge_metadata')
      .select('*')
      .eq('challenge_id', challengeId)
      .single();

    // Get all scores for this challenge
    const { data: allScores } = await supabase
      .from('scores')
      .select('score')
      .eq('challenge_id', challengeId);

    const scores = allScores?.map(s => s.score) || [];
    const totalAttempts = scores.length;
    const totalCompletions = scores.filter(s => s > 0).length;
    const averageScore = scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;
    const topScore = scores.length > 0 ? Math.max(...scores) : 0;

    const updateData = {
      total_attempts: totalAttempts,
      total_completions: totalCompletions,
      average_score: averageScore,
      top_score: topScore,
      updated_at: new Date().toISOString()
    };

    if (metadata) {
      // Update existing metadata
      await supabase
        .from('challenge_metadata')
        .update(updateData)
        .eq('challenge_id', challengeId);
    } else {
      // Create new metadata record
      await supabase
        .from('challenge_metadata')
        .insert([{
          challenge_id: challengeId,
          ...updateData
        }]);
    }
  } catch (error) {
    console.error('Error updating challenge metadata:', error);
  }
}

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-challenge', (challengeId) => {
    socket.join(`challenge-${challengeId}`);
  });

  socket.on('score-updated', (data) => {
    // Broadcast score updates to challenge participants
    socket.to(`challenge-${data.challengeId}`).emit('leaderboard-updated', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log('API endpoints:');
  console.log('  POST /api/calculate-score - Calculate comprehensive score');
  console.log('  POST /api/submit-score - Submit score and update stats');
  console.log('  GET /api/user-stats/:userId - Get user statistics');
  console.log('  GET /api/global-leaderboard - Get global leaderboard');
});
