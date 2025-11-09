// API utility functions for backend scoring integration

const API_BASE_URL = 'http://localhost:3001/api';

export async function calculateScore(performanceData) {
  try {
    const response = await fetch(`${API_BASE_URL}/calculate-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(performanceData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error calculating score:', error);
    throw error;
  }
}

export async function submitScore(scoreSubmissionData) {
  try {
    const response = await fetch(`${API_BASE_URL}/submit-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scoreSubmissionData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error submitting score:', error);
    throw error;
  }
}

export async function getUserStats(userId) {
  try {
    const response = await fetch(`${API_BASE_URL}/user-stats/${userId}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching user stats:', error);
    throw error;
  }
}

export async function getGlobalLeaderboard(options = {}) {
  try {
    const { limit = 50, offset = 0 } = options;
    const response = await fetch(`${API_BASE_URL}/global-leaderboard?limit=${limit}&offset=${offset}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching global leaderboard:', error);
    throw error;
  }
}

// Frontend scoring calculation fallback (if backend is unavailable)
export function calculateBasicScore(stepScores = []) {
  if (!stepScores || stepScores.length === 0) return 0;
  
  const validScores = stepScores.filter(score => score !== null && score !== undefined);
  if (validScores.length === 0) return 0;
  
  const average = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
  return Math.round(average * 100);
}

// Mock PP calculation for frontend fallback
export function calculateBasicPP(score, difficulty = 'BEGINNER') {
  const basePP = Math.max(5, Math.round(score * 0.8));
  
  const difficultyMultipliers = {
    'EXPERT': 2.0,
    'ADVANCED': 1.6,
    'INTERMEDIATE': 1.3,
    'BEGINNER': 1.0
  };
  
  const multiplier = difficultyMultipliers[difficulty] || 1.0;
  return Math.round(basePP * multiplier);
}

export default {
  calculateScore,
  submitScore,
  getUserStats,
  getGlobalLeaderboard,
  calculateBasicScore,
  calculateBasicPP
};