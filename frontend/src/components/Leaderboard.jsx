import { useEffect, useState, useRef } from "react";
import { supabase } from "../utils/supabaseClient.js";
import "./Leaderboard.css";

export default function Leaderboard({ challenge }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null); // { player, score, mimic_url }
  const originalRef = useRef(null);
  const competitorRef = useRef(null);

  useEffect(() => {
    if (!challenge?.id) return;
    fetchRows();

    // Realtime refresh when a new score inserts for this challenge
    const ch = supabase
      .channel("scores-watch")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scores", filter: `challenge_id=eq.${challenge.id}` },
        fetchRows
      )
      .subscribe();

    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.id]);

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("scores")
      .select("id, player, score, mimic_url, created_at")
      .eq("challenge_id", challenge.id)
      .order("score", { ascending: false })
      .limit(10);

    if (!error) setRows(data || []);
    else console.error(error);
  };

  const medal = (i) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1);

  const openModal = (row) => {
    setSelected(row);
    setOpen(true);
  };

  const playBoth = async () => {
    if (!originalRef.current || !competitorRef.current) return;
    // Reset to start and play together
    originalRef.current.currentTime = 0;
    competitorRef.current.currentTime = 0;
    try {
      await Promise.all([
        originalRef.current.play(),
        competitorRef.current.play(),
      ]);
    } catch (e) {
      console.warn("Sync play failed (autoplay policy?):", e);
    }
  };

  return (
    <div className="lb">
      <h2 className="lb__title">Leaderboard</h2>

      <div className="lb__tableWrap">
        <table className="lb__table">
          <thead>
            <tr>
              <th className="w-rank">Rank</th>
              <th>Player</th>
              <th>Score</th>
              <th className="w-watch">Watch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="lb__rank">
                  <span className="lb__medal">{medal(i)}</span>
                </td>
                <td>{r.player}</td>
                <td>{(r.score ?? 0).toFixed(1)}%</td>
                <td>
                  <button className="lb__watchBtn" onClick={() => openModal(r)}>
                    ▶️ Watch Duel
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="lb__empty">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && selected && (
        <div className="lb__modalOverlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="lb__modal" onClick={(e) => e.stopPropagation()}>
            <div className="lb__modalHead">
              <h3 className="lb__modalTitle">
                {selected.player} — {(selected.score ?? 0).toFixed(1)}%
              </h3>
              <button className="lb__close" onClick={() => setOpen(false)} aria-label="Close">✖</button>
            </div>

            <div className="lb__videos">
              <div>
                <p className="lb__videoLabel">Original</p>
                <video ref={originalRef} className="lb__video" src={challenge.video_url} controls />
              </div>
              <div>
                <p className="lb__videoLabel">Competitor</p>
                <video ref={competitorRef} className="lb__video" src={selected.mimic_url} controls />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center" }}>
              <button className="lb__watchBtn" onClick={playBoth}>▶️ Play Both (Sync)</button>
            </div>

            <p className="lb__scoreText">
              <span className="lb__scoreTag">Score:</span> {(selected.score ?? 0).toFixed(1)}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
