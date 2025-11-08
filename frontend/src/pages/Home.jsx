import { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient.js";

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
    <div>
      <h1>Available Challenges</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
        {challenges.map(challenge => (
          <div key={challenge.id} style={{ border: "1px solid #ccc", padding: "10px" }}>
            <h3>{challenge.title}</h3>
            <p>By: {challenge.uploader}</p>
            <video src={challenge.video_url} controls width="200" />
            <br />
            <a href={`/challenge/${challenge.id}`}>
              <button>Compete</button>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
