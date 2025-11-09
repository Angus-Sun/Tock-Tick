import { useEffect, useState, useRef } from "react";
import { supabase } from "../utils/supabaseClient.js";
import { useNavigate } from "react-router-dom";
import "./GlobalLeaderboard.css";

export default function GlobalLeaderboard() {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const navigate = useNavigate();
  const observerRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initializeData = async () => {
      try {
        setUserLoading(true);
        setLoading(true);
        
        await fetchCurrentUser();
        await fetchLeaderboard();
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        console.error("Error initializing leaderboard:", err);
        setError("Failed to load leaderboard");
      } finally {
        setLoading(false);
        setUserLoading(false);
      }
    };

    initializeData();

    // Subscribe to real-time updates on global_leaderboard
    const subscription = supabase
      .channel('leaderboard-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'global_leaderboard' },
        (payload) => {
          console.log('Leaderboard updated:', payload);
          fetchLeaderboard(); // Refresh leaderboard when changes occur
        }
      )
      .subscribe();

    // Intersection Observer for fade-in animations
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    return () => {
      subscription.unsubscribe();
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    // Observe leaderboard items when they load
    if (!loading && !userLoading && observerRef.current) {
      const items = document.querySelectorAll('.leaderboard-item');
      items.forEach((item) => {
        observerRef.current.observe(item);
      });
    }
  }, [loading, userLoading, leaderboardData]);

  const fetchCurrentUser = async () => {
    setUserLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
      await fetchUserRank(user.id);
    }
    setUserLoading(false);
  };

  const fetchUserRank = async (userId) => {
    try {
      const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const res = await fetch(`${API_BASE}/api/user-stats/${encodeURIComponent(userId)}`);
      if (!res.ok) {
        console.error('Failed to fetch user stats:', await res.text());
        return;
      }
      const json = await res.json();
      // Prefer RPC ranking if present, otherwise derive from playerRank
      if (json.ranking) setUserRank(json.ranking);
      else if (json.playerRank) setUserRank(json.playerRank);
    } catch (err) {
      console.error('Error fetching user rank:', err);
    }
  };

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('offset', '0');
      // Note: server doesn't currently support time filtering on this endpoint; keep client-side filter optional
      const resp = await fetch(`${API_BASE}/api/global-leaderboard?${params.toString()}`);
      if (!resp.ok) {
        console.error('Error fetching leaderboard from server:', await resp.text());
        setLeaderboardData([]);
      } else {
        const data = await resp.json();
        setLeaderboardData(data || []);
      }
    } catch (err) {
      console.error("Error in fetchLeaderboard:", err);
    } finally {
      setLoading(false);
    }
  };

  // Time filters intentionally removed per UX preference

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
      'BEGINNER': '#96CEB4',
      'INTERMEDIATE': '#45B7D1',
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
      'BEGINNER': '�',
      'INTERMEDIATE': '�',
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

  const getOrdinalSuffix = (num) => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return num + "st";
    if (j === 2 && k !== 12) return num + "nd";
    if (j === 3 && k !== 13) return num + "rd";
    return num + "th";
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

  if (loading || userLoading) {
    return null;
  }

  return (
    <div className="global-leaderboard animate-fade-in">
      <div className="leaderboard-header animate-slide-down">
  <h2>🏆 Top Performers</h2>
        {/* Controls removed: no time filters or manual refresh by UX decision */}
      </div>

      {/* User's Current Rank Card */}
      {currentUser && userRank && (
        <div className="user-rank-card animate-slide-up">
          <div className="rank-info">
            <span className="user-position">#{userRank.rank_position}</span>
            <div className="user-details">
              <span className="rank-label">Your Rank</span>
              <span className="percentile">Top {getOrdinalSuffix(userRank.percentile)} percentile</span>
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
          <p>Showing top {leaderboardData.length} {leaderboardData.length === 1 ? 'player' : 'players'}</p>
        </div>
      )}
    </div>
  );
}