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
    const {
      challengeId,
      userId,
      playerName,
      mimicUrl,
      scoreData,
      ppData
    } = req.body;

    if (!challengeId || !userId || !playerName || !scoreData) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }

    // Insert score record with extended data
    const { data: scoreRecord, error: scoreError } = await supabase
      .from('scores')
      .insert([{
        challenge_id: challengeId,
        player: playerName,
        player_id: userId,
        score: scoreData.finalScore,
        mimic_url: mimicUrl,
        accuracy_score: scoreData.breakdown?.accuracy || 0,
        consistency_score: scoreData.breakdown?.consistency || 0,
        timing_score: scoreData.breakdown?.timing || 0,
        style_score: scoreData.breakdown?.style || 0,
        difficulty_level: scoreData.difficulty || 'BEGINNER',
        difficulty_multiplier: scoreData.difficultyMultiplier || 1.0,
        total_steps: scoreData.metadata?.totalSteps || 0,
        valid_steps: scoreData.metadata?.validSteps || 0,
        pp_earned: ppData?.totalPP || 0,
        is_personal_best: ppData?.metadata?.isPersonalBest || false
      }])
      .select()
      .single();

    if (scoreError) {
      throw scoreError;
    }

    // Record PP history
    if (ppData?.totalPP > 0) {
      const { data: currentStats } = await supabase
        .from('user_stats')
        .select('total_pp')
        .eq('user_id', userId)
        .single();

      await supabase
        .from('pp_history')
        .insert([{
          user_id: userId,
          score_id: scoreRecord.id,
          challenge_id: challengeId,
          pp_earned: ppData.totalPP,
          pp_breakdown: ppData.breakdown,
          previous_total_pp: currentStats?.total_pp || 0,
          new_total_pp: (currentStats?.total_pp || 0) + ppData.totalPP
        }]);
    }

    // Update challenge metadata
    await updateChallengeMetadata(challengeId, scoreData.finalScore);

    // Trigger global leaderboard update
    await supabase.rpc('update_global_leaderboard');

    res.json({ 
      success: true, 
      scoreId: scoreRecord.id,
      message: 'Score submitted successfully' 
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
