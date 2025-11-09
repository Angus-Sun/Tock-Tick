import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../utils/supabaseClient.js";
import Logo from "../components/Logo.jsx";
import "./Home.css";

export default function Home() {
  const [challenges, setChallenges] = useState([]);
  const [showEmptyMessage, setShowEmptyMessage] = useState(false);

  useEffect(() => { fetchChallenges(); }, []);

  // Delay showing empty message to avoid flash
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowEmptyMessage(true);
    }, 5000);
    
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // IntersectionObserver for bi-directional fade (in and out)
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          } else {
            entry.target.classList.remove('visible');
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -5% 0px', // fade out slightly before fully leaving
      }
    );

    // Observe all elements on mount and when challenges update
    const attach = () => {
      document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
    };
    // slight delay to ensure DOM is ready
    const t = setTimeout(attach, 50);

    return () => {
      clearTimeout(t);
      observer.disconnect();
    };
  }, [challenges]);

  const fetchChallenges = async () => {
    const { data, error } = await supabase
      .from('challenges')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    setChallenges(data || []);
  };

  return (
    <div className="home-page">
      <header className="home-hero animate-on-scroll">
        <div className="home-logo-wrapper">
          <Logo className="home-logo" />
        </div>
        <h1 className="home-title">MatchA Dance</h1>
        <p className="home-sub">Discover community challenges & prove your match(a)ing skills.</p>
        <div className="home-actions">
          <Link to="/upload" className="hero-btn accent">Upload</Link>
          <a href="#challenge-feed" className="hero-btn outline" onClick={e => { e.preventDefault(); document.getElementById('challenge-feed')?.scrollIntoView({behavior:'smooth'}); }}>Explore</a>
        </div>
      </header>

      <main className="challenge-section animate-on-scroll" id="challenge-feed">
        {challenges.length === 0 && showEmptyMessage && <div className="empty">No challenges yet. Be first!</div>}
        <div className="challenge-grid">
          {challenges.map(challenge => (
            <article key={challenge.id} className="challenge-card animate-on-scroll">
              <div className="video-shell">
                {challenge.video_url ? (
                  <video
                    className="challenge-video"
                    src={challenge.video_url}
                    muted
                    playsInline
                    onMouseEnter={e => e.currentTarget.play()}
                    onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                    controls
                  />
                ) : (
                  <div className="placeholder">No preview</div>
                )}
              </div>
              <h3 className="challenge-title">{challenge.title}</h3>
              <p className="challenge-meta">By {challenge.uploader}</p>
              <Link className="play-btn" to={`/challenge/${challenge.id}`}>Compete</Link>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
