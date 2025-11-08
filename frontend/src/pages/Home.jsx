import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../utils/supabaseClient.js";
import "./Home.css";

export default function Home() {
  const [challenges, setChallenges] = useState([]);

  useEffect(() => {
    fetchChallenges();
  }, []);

  const fetchChallenges = async () => {
    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setChallenges(data);
  };

  return (
    <div className="home-page">
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-logo">MATCH-A DANCE</div>
          <p className="hero-sub">Got the moves? Let’s see if they MATCH-A!</p>
          <div className="hero-ctas">
            <Link className="btn primary" to="/upload">Upload a Mimic</Link>
            <a
              className="btn secondary"
              href="#challenges"
              onClick={(e) => {
                e.preventDefault();
                const el = document.querySelector('.challenges');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              Explore Challenges
            </a>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="challenges">
          <h2>Available Challenges</h2>
          <div className="challenge-grid">
            {challenges.map(challenge => (
              <article key={challenge.id} className="challenge-card">
                <h3>{challenge.title}</h3>
                <p className="meta">By: {challenge.uploader}</p>
                {challenge.video_url ? (
                  <video src={challenge.video_url} controls width="100%" />
                ) : (
                  <div className="placeholder">No preview</div>
                )}
                <a className="btn small" href={`/challenge/${challenge.id}`}>Compete</a>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
