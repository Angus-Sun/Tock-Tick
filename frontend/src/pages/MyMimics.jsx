import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

export default function MyMimics() {
  const [mimics, setMimics] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    getMyMimics();
  }, []);

  const getMyMimics = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      navigate("/login");
      return;
    }

    const { data, error } = await supabase
      .from("scores")
      .select("*, challenges(*)")
      .eq("player_id", userId)
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setMimics(data);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>My Mimics</h2>
      {mimics.length === 0 ? (
        <p>No mimics yet.</p>
      ) : (
        mimics.map((m) => (
          <div key={m.id} style={{ marginBottom: "20px" }}>
            <h3>{m.challenges?.title}</h3>
            <p>Score: {m.score?.toFixed(2)}</p>
            <video src={m.mimic_url} controls width="250" />
          </div>
        ))
      )}
    </div>
  );
}
