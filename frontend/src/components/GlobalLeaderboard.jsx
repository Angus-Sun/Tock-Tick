import { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient.js";
import { useNavigate } from "react-router-dom";
import "./GlobalLeaderboard.css";

export default function GlobalLeaderboard() {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, today, week, month
  const [userRank, setUserRank] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchLeaderboard();
    fetchCurrentUser();
  }, [filter]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
      fetchUserRank(user.id);
    }
  };

  const fetchUserRank = async (userId) => {
    try {
      const { data, error } = await supabase.rpc('get_user_rank', { user_uuid: userId });
      if (!error && data && data.length > 0) {
        setUserRank(data[0]);
      }
    } catch (err) {
      console.error("Error fetching user rank:", err);
    }
  };

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('global_leaderboard')
        .select(`
          user_id,
          username,
          total_pp,
          rank_position,
          rank_tier,
          recent_activity,
          last_updated
        `)
        .order('rank_position', { ascending: true })
        .limit(50);

      // Apply time filters if needed
      if (filter !== 'all') {
        const timeFilter = getTimeFilter(filter);
        query = query.gte('last_updated', timeFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching leaderboard:", error);
      } else {
        setLeaderboardData(data || []);
      }
    } catch (err) {
      console.error("Error in fetchLeaderboard:", err);
    } finally {
      setLoading(false);
    }
  };

  const getTimeFilter = (period) => {
    const now = new Date();
    switch (period) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      case 'week':
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return weekAgo.toISOString();
      case 'month':
        const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        return monthAgo.toISOString();
      default:
        return null;
    }
  };

  const getRankIcon = (position) => {
    if (position === 1) return "🥇";
    if (position === 2) return "🥈";
    if (position === 3) return "🥉";
    return `#${position}`;
  };

  const getRankTierColor = (tier) => {
    const colors = {
      'LEGEND': '#FFD700',
      'MASTER': '#E6E6FA',
      'EXPERT': '#FF6B47',
      'ADVANCED': '#4ECDC4',
      'INTERMEDIATE': '#45B7D1',
      'BEGINNER': '#96CEB4',
      'NOVICE': '#FECA57'
    };
    return colors[tier] || '#FECA57';
  };

  const getRankTierIcon = (tier) => {
    const icons = {
      'LEGEND': '👑',
      'MASTER': '💎',
      'EXPERT': '🔥',
      'ADVANCED': '⭐',
      'INTERMEDIATE': '🌟',
      'BEGINNER': '🌱',
      'NOVICE': '🌸'
    };
    return icons[tier] || '🌸';
  };

  const formatPP = (pp) => {
    if (pp >= 1000) {
      return `${(pp / 1000).toFixed(1)}k`;
    }
    return pp.toString();
  };

  const navigateToProfile = (userId) => {
    navigate(`/profile/${userId}`);
  };

  const refreshLeaderboard = async () => {
    try {
      // Call the function to update global leaderboard
      await supabase.rpc('update_global_leaderboard');
      await fetchLeaderboard();
    } catch (err) {
      console.error("Error refreshing leaderboard:", err);
    }
  };

  if (loading) {
    return (
      <div className="global-leaderboard">
        <div className="leaderboard-header">
          <h2>🏆 Global Leaderboard</h2>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading rankings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="global-leaderboard">
      <div className="leaderboard-header">
        <h2>🏆 Global Leaderboard</h2>
        <div className="leaderboard-controls">
          <div className="time-filters">
            <button 
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Time
            </button>
            <button 
              className={`filter-btn ${filter === 'month' ? 'active' : ''}`}
              onClick={() => setFilter('month')}
            >
              This Month
            </button>
            <button 
              className={`filter-btn ${filter === 'week' ? 'active' : ''}`}
              onClick={() => setFilter('week')}
            >
              This Week
            </button>
          </div>
          <button className="refresh-btn" onClick={refreshLeaderboard} title="Refresh Rankings">
            🔄
          </button>
        </div>
      </div>

      {/* User's Current Rank Card */}
      {currentUser && userRank && (
        <div className="user-rank-card">
          <div className="rank-info">
            <span className="user-position">#{userRank.rank_position}</span>
            <div className="user-details">
              <span className="rank-label">Your Rank</span>
              <span className="percentile">Top {userRank.percentile}%</span>
            </div>
          </div>
          <div className="total-players">
            {userRank.total_players} Players
          </div>
        </div>
      )}

      {/* Leaderboard List */}
      <div className="leaderboard-list">
        {leaderboardData.length === 0 ? (
          <div className="empty-state">
            <p>🎯 No rankings yet. Be the first to compete!</p>
          </div>
        ) : (
          leaderboardData.map((player, index) => (
            <div 
              key={player.user_id} 
              className={`leaderboard-item ${currentUser?.id === player.user_id ? 'current-user' : ''}`}
              onClick={() => navigateToProfile(player.user_id)}
            >
              <div className="rank-position">
                <span className="position-badge">
                  {getRankIcon(player.rank_position)}
                </span>
              </div>

              <div className="player-info">
                <div className="player-name">
                  {player.username}
                  {currentUser?.id === player.user_id && (
                    <span className="you-badge">YOU</span>
                  )}
                </div>
                <div className="player-tier">
                  <span 
                    className="tier-badge"
                    style={{ color: getRankTierColor(player.rank_tier) }}
                  >
                    {getRankTierIcon(player.rank_tier)} {player.rank_tier}
                  </span>
                </div>
              </div>

              <div className="player-stats">
                <div className="pp-score">
                  <span className="pp-value">{formatPP(player.total_pp)}</span>
                  <span className="pp-label">PP</span>
                </div>
                
                {player.recent_activity?.recent_scores && (
                  <div className="recent-activity">
                    <div className="recent-scores">
                      {player.recent_activity.recent_scores.slice(0, 3).map((score, idx) => (
                        <div key={idx} className="recent-score">
                          <span className="score-value">{score.score?.toFixed(0)}%</span>
                          <span className="score-pp">+{score.pp_earned}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="view-profile">
                <span className="profile-arrow">→</span>
              </div>
            </div>
          ))
        )}
      </div>

      {leaderboardData.length > 0 && (
        <div className="leaderboard-footer">
          <p>Showing top {leaderboardData.length} players</p>
          <button className="view-more-btn" onClick={() => navigate('/rankings')}>
            View Full Rankings
          </button>
        </div>
      )}
    </div>
  );
}