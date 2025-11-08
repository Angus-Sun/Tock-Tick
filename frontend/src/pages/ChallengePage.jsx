import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient.js";
import { v4 as uuidv4 } from "uuid";
import Leaderboard from "../components/Leaderboard.jsx";
import "./ChallengePage.css";

export default function ChallengePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [countdown, setCountdown] = useState(null);

  const videoRef = useRef(null);
  const challengeVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    fetchChallenge();
    startCamera();
  }, []);

  const fetchChallenge = async () => {
    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .eq("id", id)
      .single();
    if (error) console.error(error);
    else setChallenge(data);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      alert("Camera access denied or unavailable.");
      console.error(err);
    }
  };

  const startRecordingProcess = async () => {
    // check if logged in
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/login");
      return;
    }

    // reset any previous recording
    setRecordedBlob(null);

    // countdown
    for (let i = 3; i > 0; i--) {
      setCountdown(i);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCountdown(null);
    await beginRecording();
  };

  const beginRecording = async () => {
    try {
      chunksRef.current = [];
      const stream = videoRef.current?.srcObject;
      if (!stream) throw new Error("Camera stream not ready");

      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch {}
      }

      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        setRecordedBlob(blob);
      };

      recorder.start();
      setRecording(true);

      if (challengeVideoRef.current) {
        try {
          challengeVideoRef.current.currentTime = 0;
          await challengeVideoRef.current.play();
          challengeVideoRef.current.onended = () => stopRecording();
        } catch (e) {
          console.warn("Challenge video play failed:", e);
        }
      }
    } catch (err) {
      console.error("Failed to start recording:", err);
      alert("Could not start recording. Check camera permissions and try again.");
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleUploadMimic = async () => {
    if (!recordedBlob)
      return alert("Record a video first!");

    setUploading(true);

    // check session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      setUploading(false);
      navigate("/login");
      return;
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // upload to storage
    const fileName = `mimics/${uuidv4()}.webm`;
    const { data, error: uploadError } = await supabase.storage
      .from("videos")
      .upload(fileName, recordedBlob, { contentType: "video/webm" });

    if (uploadError) {
      alert("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: publicData } = supabase.storage
      .from("videos")
      .getPublicUrl(data.path);

    // save score row
    const { error: dbError } = await supabase.from("scores").insert([
      {
        challenge_id: id,
        player: userEmail,
        player_id: userId,
        score: Math.random() * 100,
        mimic_url: publicData.publicUrl,
      },
    ]);

    if (dbError) alert("Error saving score: " + dbError.message);
    else alert("✅ Mimic uploaded successfully!");

    setUploading(false);
  };

  if (!challenge) return <p>Loading...</p>;

  return (
    <div className="challenge">
      <div className="challenge__header">
        <h1 className="challenge__title">{challenge.title}</h1>
        <p className="challenge__meta">Original by {challenge.uploader}</p>
      </div>

      <div className="challenge__pane">
        <div className="pane__left">
          <p className="pane__label">🎬 Challenge Video</p>
          <video
            ref={challengeVideoRef}
            className="pane__video"
            src={challenge.video_url}
            controls
          />
        </div>

        <div className="pane__right">
          <p className="pane__label">📹 Your Mimic</p>

          <div className="video-container">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="pane__video"
            />
            {countdown && (
              <div className="countdown-overlay">{countdown}</div>
            )}
          </div>

          {!recording ? (
            <button className="btn" onClick={startRecordingProcess}>
              🎥 Start Recording
            </button>
          ) : (
            <button className="btn btn-stop" onClick={stopRecording}>
              ⏹ Stop Recording
            </button>
          )}

          {recordedBlob && (
            <div className="preview">
              <h4>Preview Recording:</h4>
              <video
                src={URL.createObjectURL(recordedBlob)}
                controls
                className="pane__video"
              />
              <button
                className="btn"
                disabled={uploading}
                onClick={handleUploadMimic}
              >
                {uploading ? "Uploading..." : "⬆️ Upload Mimic"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="challenge__leaderboard">
        <Leaderboard challenge={challenge} />
      </div>
    </div>
  );
}
