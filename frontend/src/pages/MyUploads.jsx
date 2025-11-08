import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";

export default function MyUploads() {
  const [uploads, setUploads] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    getMyUploads();
  }, []);

  const getMyUploads = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      navigate("/login");
      return;
    }

    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .eq("uploader_id", userId)
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setUploads(data);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>My Uploaded Challenges</h2>
      {uploads.length === 0 ? (
        <p>No uploads yet.</p>
      ) : (
        uploads.map((u) => (
          <div key={u.id}>
            <h3>{u.title}</h3>
            <video src={u.video_url} controls width="300" />
          </div>
        ))
      )}
    </div>
  );
}
