import { useState, useEffect } from "react";
import { supabase } from "../utils/supabaseClient.js";
import "./ScoreDisplay.css";

export default function ScoreDisplay({ 
  scoreData, 
  isVisible = true, 
  showDetails = true,
  onClose = null 
}) {
  const [userStats, setUserStats] = useState(null);
  const [rankInfo, setRankInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    if (scoreData && isVisible) {
      fetchUserStats();
    }
  }, [scoreData, isVisible]);

  const fetchUserStats = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch user stats
      const { data: stats } = await supabase
        .from('user_stats')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (stats) {
        setUserStats(stats);
        
        // Fetch rank information
        const { data: rank } = await supabase.rpc('get_user_rank', { 
          user_uuid: user.id 
        });
        
        if (rank && rank.length > 0) {
          setRankInfo(rank[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching user stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRankTierInfo = (tier) => {
    const tiers = {
      'LEGEND': { icon: '👑', color: '#FFD700', name: 'Legend' },
      'MASTER': { icon: '💎', color: '#E6E6FA', name: 'Master' },
      'EXPERT': { icon: '🔥', color: '#FF6B47', name: 'Expert' },
      'ADVANCED': { icon: '⭐', color: '#4ECDC4', name: 'Advanced' },
      'INTERMEDIATE': { icon: '🌟', color: '#45B7D1', name: 'Intermediate' },
      'BEGINNER': { icon: '🌱', color: '#96CEB4', name: 'Beginner' },
      'NOVICE': { icon: '🌸', color: '#FECA57', name: 'Novice' }
    };
    return tiers[tier] || tiers['NOVICE'];
  };

  const getDifficultyInfo = (difficulty) => {
    const difficulties = {
      'EXPERT': { icon: '🔥', color: '#FF6B47', multiplier: '2.0x' },
      'ADVANCED': { icon: '⚡', color: '#4ECDC4', multiplier: '1.6x' },
      'INTERMEDIATE': { icon: '⭐', color: '#45B7D1', multiplier: '1.3x' },
      'BEGINNER': { icon: '🌱', color: '#96CEB4', multiplier: '1.0x' }
    };
    return difficulties[difficulty] || difficulties['BEGINNER'];
  };

  const getScoreGrade = (score) => {
    if (score >= 95) return { grade: 'S+', color: '#FFD700' };
    if (score >= 90) return { grade: 'S', color: '#E6E6FA' };
    if (score >= 85) return { grade: 'A+', color: '#FF6B47' };
    if (score >= 80) return { grade: 'A', color: '#4ECDC4' };
    if (score >= 75) return { grade: 'B+', color: '#45B7D1' };
    if (score >= 70) return { grade: 'B', color: '#96CEB4' };
    if (score >= 60) return { grade: 'C', color: '#FECA57' };
    return { grade: 'D', color: '#FF6B6B' };
  };

  if (!scoreData || !isVisible) return null;

  const {
    finalScore = 0,
    breakdown = {},
    difficulty = 'BEGINNER',
    difficultyMultiplier = 1.0,
    metadata = {},
    ppData = {}
  } = scoreData;

  const scoreGrade = getScoreGrade(finalScore);
  const difficultyInfo = getDifficultyInfo(difficulty);
  const tierInfo = userStats ? getRankTierInfo(userStats.rank_tier) : null;

  return (
    <div className="score-display-overlay">
      <div className="score-display">
        {onClose && (
          <button className="score-close-btn" onClick={onClose}>✖</button>
        )}

        {/* Main Score Section */}
        <div className="score-main">
          <div className="score-header">
            <h2>Performance Results</h2>
            <div className="score-grade" style={{ color: scoreGrade.color }}>
              {scoreGrade.grade}
            </div>
          </div>

          <div className="score-value-section">
            <div className="final-score">
              <span className="score-percentage">{finalScore}%</span>
              <div className="score-bar">
                <div 
                  className="score-fill" 
                  style={{ 
                    width: `${finalScore}%`,
                    background: `linear-gradient(90deg, ${scoreGrade.color}20, ${scoreGrade.color})`
                  }}
                />
              </div>
            </div>

            <div className="difficulty-badge">
              <span className="difficulty-icon">{difficultyInfo.icon}</span>
              <span className="difficulty-text">{difficulty}</span>
              <span className="difficulty-multiplier">{difficultyInfo.multiplier}</span>
            </div>
          </div>
        </div>

        {/* PP Earned Section */}
        {ppData.totalPP && (
          <div className="pp-section">
            <div className="pp-earned">
              <div className="pp-main">
                <span className="pp-icon">⚡</span>
                <span className="pp-value">+{ppData.totalPP}</span>
                <span className="pp-label">PP</span>
              </div>
              
              {ppData.breakdown && showDetails && (
                <div className="pp-breakdown">
                  <div className="pp-item">
                    <span>Base Score</span>
                    <span>+{ppData.breakdown.basePP}</span>
                  </div>
                  {ppData.breakdown.difficultyBonus > 0 && (
                    <div className="pp-item">
                      <span>Difficulty Bonus</span>
                      <span>+{ppData.breakdown.difficultyBonus}</span>
                    </div>
                  )}
                  {ppData.breakdown.improvementBonus > 0 && (
                    <div className="pp-item personal-best">
                      <span>🎉 Personal Best!</span>
                      <span>+{ppData.breakdown.improvementBonus}</span>
                    </div>
                  )}
                  {ppData.breakdown.streakBonus > 0 && (
                    <div className="pp-item">
                      <span>Streak Bonus</span>
                      <span>+{ppData.breakdown.streakBonus}</span>
                    </div>
                  )}
                  {ppData.breakdown.excellenceBonus > 0 && (
                    <div className="pp-item excellence">
                      <span>🌟 Excellence!</span>
                      <span>+{ppData.breakdown.excellenceBonus}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Score Breakdown Toggle */}
        {showDetails && breakdown && (
          <div className="breakdown-section">
            <button 
              className="breakdown-toggle"
              onClick={() => setShowBreakdown(!showBreakdown)}
            >
              <span>Score Breakdown</span>
              <span className={`toggle-arrow ${showBreakdown ? 'open' : ''}`}>▼</span>
            </button>

            {showBreakdown && (
              <div className="breakdown-details">
                <div className="breakdown-grid">
                  <div className="breakdown-item">
                    <div className="breakdown-label">Accuracy</div>
                    <div className="breakdown-bar">
                      <div 
                        className="breakdown-fill accuracy"
                        style={{ width: `${breakdown.accuracy || 0}%` }}
                      />
                    </div>
                    <div className="breakdown-value">{breakdown.accuracy || 0}%</div>
                  </div>

                  <div className="breakdown-item">
                    <div className="breakdown-label">Consistency</div>
                    <div className="breakdown-bar">
                      <div 
                        className="breakdown-fill consistency"
                        style={{ width: `${breakdown.consistency || 0}%` }}
                      />
                    </div>
                    <div className="breakdown-value">{breakdown.consistency || 0}%</div>
                  </div>

                  <div className="breakdown-item">
                    <div className="breakdown-label">Timing</div>
                    <div className="breakdown-bar">
                      <div 
                        className="breakdown-fill timing"
                        style={{ width: `${breakdown.timing || 0}%` }}
                      />
                    </div>
                    <div className="breakdown-value">{breakdown.timing || 0}%</div>
                  </div>

                  <div className="breakdown-item">
                    <div className="breakdown-label">Style</div>
                    <div className="breakdown-bar">
                      <div 
                        className="breakdown-fill style"
                        style={{ width: `${breakdown.style || 0}%` }}
                      />
                    </div>
                    <div className="breakdown-value">{breakdown.style || 0}%</div>
                  </div>
                </div>

                {metadata && (
                  <div className="performance-stats">
                    <div className="stat-item">
                      <span className="stat-label">Steps Completed</span>
                      <span className="stat-value">
                        {metadata.validSteps || 0} / {metadata.totalSteps || 0}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Average Step Score</span>
                      <span className="stat-value">{metadata.averageStepScore || 0}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rank & Stats Section */}
        {userStats && showDetails && (
          <div className="rank-section">
            <div className="current-rank">
              <div className="rank-info">
                {tierInfo && (
                  <>
                    <span className="rank-icon">{tierInfo.icon}</span>
                    <span className="rank-name" style={{ color: tierInfo.color }}>
                      {tierInfo.name}
                    </span>
                  </>
                )}
                {rankInfo && (
                  <span className="rank-position">#{rankInfo.rank_position}</span>
                )}
              </div>
              
              <div className="total-pp">
                <span className="total-pp-value">{userStats.total_pp}</span>
                <span className="total-pp-label">Total PP</span>
              </div>
            </div>

            {rankInfo && (
              <div className="rank-progress">
                <div className="progress-info">
                  <span>Top {rankInfo.percentile}%</span>
                  <span>{rankInfo.total_players} players</span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${100 - rankInfo.percentile}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
          </div>
        )}
      </div>
    </div>
  );
}