import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { useUser } from '../hooks/useUser.jsx';
import { getUserStats } from '../utils/scoringAPI.js';
import './Profile.css';

export default function ProfilePage() {
  const { user, profile, setProfile } = useUser();
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams();
  const viewingOther = !!paramUserId;
  const targetUserId = paramUserId || user?.id;
  const [username, setUsername] = useState(profile?.username ?? '');
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('uploads'); // 'uploads', 'mimics'
  const [uploads, setUploads] = useState([]);
  const [mimics, setMimics] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [userStats, setUserStats] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [profileUser, setProfileUser] = useState(null);

  // Helper functions for tier display
  const getTierIcon = (tier) => {
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

  const getTierColor = (tier) => {
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

  async function handleDelete(id, table) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting video:", error);
    alert("Failed to delete video");
  } else {
    if (table === "challenges") setUploads(prev => prev.filter(u => u.id !== id));
    if (table === "scores") setMimics(prev => prev.filter(m => m.id !== id));
    alert("Video deleted successfully!");
  }
}

  const uploadAvatar = async (file) => {
  // Disallow avatar upload when viewing someone else's profile
  if (viewingOther) return;
  if (!file || !user) return;
  setUploading(true);
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'png';
  const filePath = `${user.id}/${Date.now()}.${ext}`;

  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { cacheControl: '3600', upsert: true });

  if (uploadErr) { alert(`Upload failed: ${uploadErr.message}`); setUploading(false); return; }

  const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filePath);
  const publicUrl = publicData?.publicUrl;

  // upsert profile (id must equal auth.uid())
  const { data: profileData, error: dbErr } = await supabase.from('profiles').upsert([
    { id: user.id, username, avatar_url: publicUrl, updated_at: new Date().toISOString() }
  ], { onConflict: 'id' }).select().single();

  if (dbErr) alert(dbErr.message);
  else {
    alert('Profile updated');
    setProfile(profileData);  // Update profile state locally
    window.location.reload();  // Refresh to apply changes
  }
  setUploading(false);
};


  const saveUsername = async () => {
    if (viewingOther) return; // can't edit someone else's profile
    if (!user) {
      navigate('/login');
      return;
    }
    const { data, error } = await supabase.from('profiles').upsert([
      { id: user.id, username, updated_at: new Date().toISOString() }
    ], { onConflict: 'id' }).select().single();
    
    if (error) alert(error.message);
    else {
      alert('Saved');
      setProfile(data);
    }
  };

  const fetchUploads = async () => {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('uploader_id', targetUserId)
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    else setUploads(data || []);
  };

  const fetchMimics = async () => {
    const { data, error } = await supabase
      .from('scores')
      .select('*, challenges(*)')
      .eq('player_id', targetUserId)
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    else setMimics(data || []);
  };

  const fetchUserStats = async () => {
    if (!targetUserId) return;
    
    setStatsLoading(true);
    try {
      // Try backend API first
      const statsData = await getUserStats(targetUserId);
      setUserStats(statsData.stats);
      setRanking(statsData.ranking);
    } catch (error) {
      console.warn("Failed to fetch user stats from backend:", error);
      
      // Fallback to direct database query
      try {
        const { data: stats } = await supabase
          .from('user_stats')
          .select('*')
          .eq('user_id', targetUserId)
          .single();
        
        if (stats) {
          setUserStats(stats);
          
          // Get basic rank info
          const { data: rank } = await supabase.rpc('get_user_rank', { 
            user_uuid: targetUserId 
          });
          
          if (rank && rank.length > 0) {
            setRanking(rank[0]);
          }
        }
      } catch (fallbackError) {
        console.error("Failed to fetch user stats from database:", fallbackError);
      }
    } finally {
      setStatsLoading(false);
    }
  };

  // Load data when tab or user changes
  useEffect(() => {
    // If viewing other user's profile, fetch their profile record
    if (viewingOther) {
      (async () => {
        try {
          const { data: p } = await supabase.from('profiles').select('*').eq('id', paramUserId).single();
          setProfileUser(p || null);
          setUsername(p?.username || '');
        } catch (e) {
          console.error('Failed to fetch profile for userId', paramUserId, e);
        }
      })();
    }

    if (!targetUserId) return;
    fetchUserStats(); // Fetch stats whenever user changes
    if (activeTab === 'uploads') fetchUploads();
    if (activeTab === 'mimics') fetchMimics();
  }, [activeTab, targetUserId, paramUserId]);

  // Guard: if not viewing other and auth user hasn't loaded yet, show loading
  if (!viewingOther && !user) {
    return (
      <div className="profile-container">
        <div className="profile-loading">Loading profile...</div>
      </div>
    );
  }
  return (
    <div className="profile-container">
      <div className="profile-header">
        <div className="profile-avatar">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="avatar" />
          ) : (
            <div className="profile-avatar-placeholder">
              {(profile?.username || user?.email || '?')?.[0]?.toUpperCase()}
            </div>
          )}
          {isEditing && (
            <label className="profile-avatar-change">
              Change
              <input type="file" accept="image/*" onChange={e => uploadAvatar(e.target.files[0])} />
            </label>
          )}
        </div>

        <div className="profile-info">
          {isEditing ? (
          <div className="profile-edit-form">
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Display name" />
            <button onClick={() => { saveUsername(); setIsEditing(false); }} className="profile-btn-save">Save</button>
            <button onClick={() => setIsEditing(false)} className="profile-btn-cancel">Cancel</button>
          </div>
        ) : (
          <div className="profile-username-display">
            <h1>{(viewingOther ? profileUser?.username : profile?.username) || user?.email}</h1>
            {!viewingOther && <button onClick={() => setIsEditing(true)} className="profile-btn-edit">Edit✏️</button>}
          </div>
        )}

        <div className="profile-stats">
          <div className="profile-stat">
            <div className="profile-stat-number">{uploads.length}</div>
            <div className="profile-stat-label">Challenges</div>
          </div>
          <div className="profile-stat">
            <div className="profile-stat-number">{mimics.length}</div>
            <div className="profile-stat-label">Mimics</div>
          </div>
          {userStats && (
            <>
              <div className="profile-stat highlight">
                <div className="profile-stat-number">{userStats.total_pp}</div>
                <div className="profile-stat-label">Total PP</div>
              </div>
              <div className="profile-stat">
                <div className="profile-stat-number">{userStats.average_score?.toFixed(1) || '0.0'}%</div>
                <div className="profile-stat-label">Avg Score</div>
              </div>
            </>
          )}
        </div>

        {/* User Ranking & Tier Display */}
        {userStats && (
          <div className="profile-ranking">
            <div className="rank-tier">
              <span className="tier-icon">{getTierIcon(userStats.rank_tier)}</span>
              <span className="tier-name" style={{ color: getTierColor(userStats.rank_tier) }}>
                {userStats.rank_tier}
              </span>
            </div>
            {ranking && (
              <div className="rank-position">
                <span className="rank-text">#{ranking.rank_position}</span>
                <span className="rank-percentile">Top {ranking.percentile}%</span>
              </div>
            )}
            {userStats.current_streak > 0 && (
              <div className="streak-info">
                <span className="streak-icon">🔥</span>
                <span className="streak-text">{userStats.current_streak} streak</span>
              </div>
            )}
          </div>
        )}

        {statsLoading && (
          <div className="profile-stats-loading">
            <div className="loading-spinner"></div>
            <span>Loading stats...</span>
          </div>
        )}
        </div>
      </div>

      <div className="profile-content">
        <div className="profile-tabs">
          <button onClick={() => setActiveTab('uploads')} className={`profile-tab ${activeTab === 'uploads' ? 'active' : ''}`}>
            🎬 Challenges
          </button>
          <button onClick={() => setActiveTab('mimics')} className={`profile-tab ${activeTab === 'mimics' ? 'active' : ''}`}>
            🎯 Mimics
          </button>
        </div>

        {activeTab === 'uploads' && (
          <div>
            {uploads.length === 0 ? (
              <div className="profile-empty-state">
                <div className="profile-empty-icon">📹</div>
                <div className="profile-empty-title">No challenges yet</div>
                <div className="profile-empty-description">Upload your first challenge to get started!</div>
              </div>
            ) : (
              <div className="profile-video-grid">
                {uploads.map((u) => (
                  <div key={u.id} className="profile-video-card">
                    <div className="profile-video-shell">
                      <video 
                        src={u.video_url} 
                        muted
                        playsInline
                        onMouseEnter={(e) => e.target.play()} 
                        onMouseLeave={(e) => {e.target.pause(); e.target.currentTime = 0;}} 
                      />
                    </div>
                    <h3 className="profile-video-title">{u.title}</h3>
                    <div className="profile-video-actions">
                      <button onClick={() => navigate(`/challenge/${u.id}`)} className="profile-compete-btn">Compete</button>
                      {!viewingOther && (
                        <button onClick={()=> {
                          if (window.confirm("Are you sure you want to delete this challenge?")) {
                            handleDelete(u.id, "challenges");
                          }}} className="profile-delete-btn">🗑️</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'mimics' && (
          <div>
            {mimics.length === 0 ? (
              <div className="profile-empty-state">
                <div className="profile-empty-icon">🎯</div>
                <div className="profile-empty-title">No mimics yet</div>
                <div className="profile-empty-description">Join a challenge and submit your mimic!</div>
              </div>
            ) : (
              <div className="profile-video-grid">
                {mimics.map((m) => (
                  <div key={m.id} onClick={() => navigate(`/challenge/${m.challenge_id}`)} className="profile-video-card">
                    <div className="profile-video-shell">
                      <video 
                        src={m.mimic_url} 
                        muted
                        playsInline
                        onMouseEnter={(e) => e.target.play()} 
                        onMouseLeave={(e) => {e.target.pause(); e.target.currentTime = 0;}} 
                      />
                    </div>
                    <h3 className="profile-video-title">{m.challenges?.title}</h3>
                      <div className="profile-video-actions">
                      <p className="profile-video-score">⭐ {m.score?.toFixed(1)}%</p>
                      {!viewingOther && (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("Are you sure you want to delete this mimic?")) {
                            handleDelete(m.id, "scores");
                          }
                          }} className="profile-delete-btn">🗑️</button>
                      )}
                    </div>
                    
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}