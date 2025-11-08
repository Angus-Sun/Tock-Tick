import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { useUser } from "../hooks/useUser";
import "./Profile.css";

export default function ProfilePage() {
  const { user, profile, setProfile } = useUser();
  const navigate = useNavigate();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('uploads'); // 'uploads', 'mimics'
  const [uploads, setUploads] = useState([]);
  const [mimics, setMimics] = useState([]);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setUsername(profile?.username ?? '');
  }, [profile]);

  const uploadAvatar = async (file) => {
    if (!file || !user) return;
    setUploading(true);
    const filePath = `avatars/${user.id}_${Date.now()}`;

    const { data, error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadErr) {
      console.error(uploadErr);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(data.path);
    const publicUrl = urlData.publicUrl;

    // update profiles table
    const { error: dbError } = await supabase.from('profiles').upsert({ id: user.id, avatar_url: publicUrl });
    if (!dbError) setProfile((p) => ({ ...(p || {}), avatar_url: publicUrl }));
    setUploading(false);
  };

  const saveUsername = async () => {
    if (!user) return;
    const { error } = await supabase.from('profiles').upsert({ id: user.id, username });
    if (!error) {
      setProfile((p) => ({ ...(p || {}), username }));
      setIsEditing(false);
    }
  };

  const fetchUploads = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .eq('uploader_id', user.id)
      .order('created_at', { ascending: false });
    if (!error) setUploads(data || []);
  };

  const fetchMimics = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('scores')
      .select('*, challenges(*)')
      .eq('player_id', user.id)
      .order('created_at', { ascending: false });
    if (!error) setMimics(data || []);
  };

  // Load data when tab or user changes
  useEffect(() => {
    if (activeTab === 'uploads') fetchUploads();
    else fetchMimics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user]);

  // Guard against null user while auth state loads
  if (!user) return <p>Loading...</p>;

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

        {isEditing ? (
          <div className="profile-edit-form">
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Display name" />
            <button onClick={saveUsername} className="profile-btn-save">Save</button>
            <button onClick={() => setIsEditing(false)} className="profile-btn-cancel">Cancel</button>
          </div>
        ) : (
          <div className="profile-username-display">
            <h1>{profile?.username || user?.email}</h1>
            <button onClick={() => setIsEditing(true)} className="profile-btn-edit">Edit profile</button>
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
        </div>

        <div className="profile-tabs">
          <button onClick={() => setActiveTab('uploads')} className={`profile-tab ${activeTab === 'uploads' ? 'active' : ''}`}>
            🎬 Challenges
          </button>
          <button onClick={() => setActiveTab('mimics')} className={`profile-tab ${activeTab === 'mimics' ? 'active' : ''}`}>
            🎯 Mimics
          </button>
        </div>
      </div>

      <div className="profile-content">
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
                  <div key={u.id} onClick={() => navigate(`/challenge/${u.id}`)} className="profile-video-card">
                    <video src={u.video_url} onMouseOver={(e) => e.target.play()} onMouseOut={(e) => e.target.pause()} />
                    <div className="profile-video-overlay">{u.title}</div>
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
                    <video src={m.mimic_url} onMouseOver={(e) => e.target.play()} onMouseOut={(e) => e.target.pause()} />
                    <div className="profile-video-overlay">
                      <div>{m.challenges?.title}</div>
                      <div className="profile-video-score">⭐ {m.score?.toFixed(1)}%</div>
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
