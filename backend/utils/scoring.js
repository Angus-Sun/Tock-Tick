/**
 * Comprehensive scoring system for Tock-Tick dance challenges
 * Includes pose similarity, difficulty assessment, performance bonuses, and PP calculation
 */

// Base scoring constants
const SCORING_WEIGHTS = {
  ACCURACY: 0.6,      // Pose similarity accuracy
  CONSISTENCY: 0.2,   // Score consistency across video
  TIMING: 0.1,        // Timing accuracy
  STYLE: 0.1          // Style/energy bonus
};

const DIFFICULTY_MULTIPLIERS = {
  BEGINNER: 1.0,
  INTERMEDIATE: 1.3,
  ADVANCED: 1.6,
  EXPERT: 2.0
};

const PP_BASE_VALUES = {
  MIN_PP: 5,          // Minimum PP for participation
  MAX_PP: 100,        // Maximum PP for perfect score
  DIFFICULTY_BONUS: 50, // Extra PP for harder challenges
  IMPROVEMENT_BONUS: 25, // Bonus for beating personal best
  STREAK_BONUS: 10     // Bonus for consecutive good performances
};

/**
 * Calculate pose similarity score using MediaPipe landmarks
 * @param {Array} userPose - User's pose landmarks
 * @param {Array} referencePose - Reference pose landmarks
 * @returns {number} Similarity score (0-1)
 */
function calculatePoseSimilarity(userPose, referencePose) {
  if (!userPose || !referencePose || userPose.length !== referencePose.length) {
    return 0;
  }

  // Weight map for different body parts (matches frontend logic)
  const jointWeights = {
    // Core joints (higher weight)
    11: 0.14, // left_shoulder
    12: 0.14, // right_shoulder
    13: 0.12, // left_elbow
    14: 0.12, // right_elbow
    15: 0.12, // left_wrist
    16: 0.12, // right_wrist
    
    // Lower body
    23: 0.06, // left_hip
    24: 0.06, // right_hip
    25: 0.10, // left_knee
    26: 0.10, // right_knee
    27: 0.06, // left_ankle
    28: 0.06, // right_ankle
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [jointIndex, weight] of Object.entries(jointWeights)) {
    const idx = parseInt(jointIndex);
    const userJoint = userPose[idx];
    const refJoint = referencePose[idx];

    if (userJoint && refJoint) {
      // Calculate 3D distance
      const dx = userJoint.x - refJoint.x;
      const dy = userJoint.y - refJoint.y;
      const dz = (userJoint.z || 0) - (refJoint.z || 0);
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      // Convert distance to similarity (closer = more similar)
      const similarity = Math.max(0, 1 - distance / 0.6); // 0.6 is tolerance threshold
      
      // Apply visibility weighting
      const visibility = Math.min(userJoint.visibility || 1, refJoint.visibility || 1);
      const adjustedSimilarity = similarity * Math.max(0.5, visibility);
      
      weightedSum += adjustedSimilarity * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Assess challenge difficulty based on movement complexity
 * @param {Array} referenceSequence - Array of reference poses
 * @returns {string} Difficulty level
 */
function assessChallengeDifficulty(referenceSequence) {
  if (!referenceSequence || referenceSequence.length === 0) {
    return 'BEGINNER';
  }

  let totalMovement = 0;
  let rapidChanges = 0;
  
  for (let i = 1; i < referenceSequence.length; i++) {
    const prevPose = referenceSequence[i - 1];
    const currPose = referenceSequence[i];
    
    if (prevPose && currPose) {
      // Calculate movement between poses
      let poseMovement = 0;
      const keyJoints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26]; // Key tracking joints
      
      for (const jointIdx of keyJoints) {
        const prev = prevPose[jointIdx];
        const curr = currPose[jointIdx];
        
        if (prev && curr) {
          const movement = Math.sqrt(
            Math.pow(curr.x - prev.x, 2) + 
            Math.pow(curr.y - prev.y, 2) + 
            Math.pow((curr.z || 0) - (prev.z || 0), 2)
          );
          poseMovement += movement;
        }
      }
      
      totalMovement += poseMovement;
      
      // Count rapid changes (high movement in short time)
      if (poseMovement > 0.3) {
        rapidChanges++;
      }
    }
  }

  const avgMovement = totalMovement / Math.max(1, referenceSequence.length - 1);
  const rapidChangeRatio = rapidChanges / Math.max(1, referenceSequence.length - 1);

  // Determine difficulty based on movement metrics
  if (avgMovement > 0.25 || rapidChangeRatio > 0.4) {
    return 'EXPERT';
  } else if (avgMovement > 0.15 || rapidChangeRatio > 0.25) {
    return 'ADVANCED';
  } else if (avgMovement > 0.08 || rapidChangeRatio > 0.15) {
    return 'INTERMEDIATE';
  } else {
    return 'BEGINNER';
  }
}

/**
 * Calculate consistency score based on score variance
 * @param {Array} stepScores - Array of per-step scores
 * @returns {number} Consistency score (0-1)
 */
function calculateConsistency(stepScores) {
  if (!stepScores || stepScores.length === 0) return 0;

  const validScores = stepScores.filter(score => score !== null && score !== undefined);
  if (validScores.length === 0) return 0;

  const mean = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
  const variance = validScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / validScores.length;
  const standardDeviation = Math.sqrt(variance);

  // Lower deviation = higher consistency
  // Normalize so that perfect consistency (0 deviation) = 1.0
  return Math.max(0, 1 - (standardDeviation / 0.5)); // 0.5 is max expected deviation
}

/**
 * Calculate timing accuracy based on when poses are hit
 * @param {Array} timingData - Array of timing accuracy data
 * @returns {number} Timing score (0-1)
 */
function calculateTimingAccuracy(timingData) {
  if (!timingData || timingData.length === 0) return 0.5; // Default neutral timing

  const avgTiming = timingData.reduce((sum, timing) => sum + (timing || 0.5), 0) / timingData.length;
  return Math.max(0, Math.min(1, avgTiming));
}

/**
 * Calculate style bonus based on movement energy and expression
 * @param {Array} stepScores - Array of per-step scores
 * @param {number} averageScore - Overall average score
 * @returns {number} Style bonus (0-1)
 */
function calculateStyleBonus(stepScores, averageScore) {
  if (!stepScores || stepScores.length === 0) return 0;

  // Award style bonus for maintaining high scores
  const highScoreRatio = stepScores.filter(score => score > 0.8).length / stepScores.length;
  
  // Award bonus for peak performance moments
  const peakScores = stepScores.filter(score => score > 0.9).length;
  const peakBonus = Math.min(0.3, peakScores / stepScores.length * 2);
  
  // Combined style score
  const styleScore = (highScoreRatio * 0.7) + peakBonus;
  
  return Math.max(0, Math.min(1, styleScore));
}

/**
 * Calculate comprehensive score for a performance
 * @param {Object} performanceData - Performance metrics
 * @returns {Object} Detailed scoring breakdown
 */
function calculateComprehensiveScore(performanceData) {
  const {
    stepScores = [],
    timingData = [],
    referenceSequence = [],
    userPoses = []
  } = performanceData;

  // Calculate base accuracy from step scores
  const validStepScores = stepScores.filter(score => score !== null && score !== undefined);
  const baseAccuracy = validStepScores.length > 0 
    ? validStepScores.reduce((sum, score) => sum + score, 0) / validStepScores.length 
    : 0;

  // Calculate component scores
  const accuracy = baseAccuracy;
  const consistency = calculateConsistency(stepScores);
  const timing = calculateTimingAccuracy(timingData);
  const style = calculateStyleBonus(stepScores, accuracy);

  // Calculate weighted final score
  const finalScore = 
    (accuracy * SCORING_WEIGHTS.ACCURACY) +
    (consistency * SCORING_WEIGHTS.CONSISTENCY) +
    (timing * SCORING_WEIGHTS.TIMING) +
    (style * SCORING_WEIGHTS.STYLE);

  // Assess difficulty and apply multiplier
  const difficulty = assessChallengeDifficulty(referenceSequence);
  const difficultyMultiplier = DIFFICULTY_MULTIPLIERS[difficulty];
  const adjustedScore = Math.min(1.0, finalScore * difficultyMultiplier);

  return {
    finalScore: Math.round(adjustedScore * 100), // Convert to percentage
    breakdown: {
      accuracy: Math.round(accuracy * 100),
      consistency: Math.round(consistency * 100),
      timing: Math.round(timing * 100),
      style: Math.round(style * 100)
    },
    difficulty,
    difficultyMultiplier,
    metadata: {
      totalSteps: stepScores.length,
      validSteps: validStepScores.length,
      averageStepScore: Math.round(baseAccuracy * 100)
    }
  };
}

/**
 * Calculate Performance Points (PP) earned for a performance
 * @param {Object} scoreData - Score and performance data
 * @param {Object} playerHistory - Player's historical performance
 * @returns {Object} PP calculation breakdown
 */
function calculatePerformancePoints(scoreData, playerHistory = {}) {
  const {
    finalScore,
    difficulty,
    breakdown
  } = scoreData;

  const {
    personalBest = 0,
    recentScores = [],
    totalPlays = 0,
    currentStreak = 0
  } = playerHistory;

  // Base PP from score (scaled to 0-100 range)
  let basePP = Math.max(PP_BASE_VALUES.MIN_PP, (finalScore / 100) * PP_BASE_VALUES.MAX_PP);

  // Difficulty bonus
  const difficultyBonus = (() => {
    switch (difficulty) {
      case 'EXPERT': return PP_BASE_VALUES.DIFFICULTY_BONUS;
      case 'ADVANCED': return PP_BASE_VALUES.DIFFICULTY_BONUS * 0.7;
      case 'INTERMEDIATE': return PP_BASE_VALUES.DIFFICULTY_BONUS * 0.4;
      default: return 0;
    }
  })();

  // Personal best improvement bonus
  const improvementBonus = finalScore > personalBest 
    ? PP_BASE_VALUES.IMPROVEMENT_BONUS * ((finalScore - personalBest) / 100)
    : 0;

  // Consistency streak bonus
  const streakBonus = currentStreak >= 3 
    ? PP_BASE_VALUES.STREAK_BONUS * Math.min(3, Math.floor(currentStreak / 3))
    : 0;

  // Excellence bonus for exceptional performance
  const excellenceBonus = finalScore >= 95 ? 15 : finalScore >= 90 ? 10 : finalScore >= 85 ? 5 : 0;

  // Total PP calculation
  const totalPP = Math.round(basePP + difficultyBonus + improvementBonus + streakBonus + excellenceBonus);

  return {
    totalPP,
    breakdown: {
      basePP: Math.round(basePP),
      difficultyBonus: Math.round(difficultyBonus),
      improvementBonus: Math.round(improvementBonus),
      streakBonus: Math.round(streakBonus),
      excellenceBonus
    },
    metadata: {
      isPersonalBest: finalScore > personalBest,
      scoreImprovement: finalScore - personalBest,
      difficultyLevel: difficulty
    }
  };
}

/**
 * Get player rank based on total PP
 * @param {number} totalPP - Player's total PP
 * @returns {Object} Rank information
 */
function getPlayerRank(totalPP) {
  if (totalPP >= 10000) return { tier: 'LEGEND', name: 'Legend', color: '#FFD700' };
  if (totalPP >= 7500) return { tier: 'MASTER', name: 'Master', color: '#E6E6FA' };
  if (totalPP >= 5000) return { tier: 'EXPERT', name: 'Expert', color: '#FF6B47' };
  if (totalPP >= 2500) return { tier: 'ADVANCED', name: 'Advanced', color: '#4ECDC4' };
  if (totalPP >= 1000) return { tier: 'INTERMEDIATE', name: 'Intermediate', color: '#45B7D1' };
  if (totalPP >= 250) return { tier: 'BEGINNER', name: 'Beginner', color: '#96CEB4' };
  return { tier: 'NOVICE', name: 'Novice', color: '#FECA57' };
}

/**
 * Calculate leaderboard position and percentile
 * @param {number} score - Player's score for this challenge
 * @param {Array} allScores - All scores for this challenge
 * @returns {Object} Position and percentile data
 */
function calculateLeaderboardPosition(score, allScores = []) {
  if (allScores.length === 0) {
    return { position: 1, percentile: 100, totalPlayers: 1 };
  }

  const sortedScores = [...allScores].sort((a, b) => b - a);
  const position = sortedScores.findIndex(s => s <= score) + 1;
  const percentile = Math.round(((allScores.length - position + 1) / allScores.length) * 100);

  return {
    position,
    percentile,
    totalPlayers: allScores.length + 1 // +1 for current player
  };
}

module.exports = {
  calculatePoseSimilarity,
  assessChallengeDifficulty,
  calculateConsistency,
  calculateTimingAccuracy,
  calculateStyleBonus,
  calculateComprehensiveScore,
  calculatePerformancePoints,
  getPlayerRank,
  calculateLeaderboardPosition,
  SCORING_WEIGHTS,
  DIFFICULTY_MULTIPLIERS,
  PP_BASE_VALUES
};
