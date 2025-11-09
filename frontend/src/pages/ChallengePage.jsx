import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient.js";
import { v4 as uuidv4 } from "uuid";
import Leaderboard from "../components/Leaderboard.jsx";
import usePoseDetection from "../hooks/usePoseDetection.js";
import { calculateBasicPP } from "../utils/scoringAPI.js";
import "./ChallengePage.css";

export default function ChallengePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [finalScore, setFinalScore] = useState(null); // percent (kept for backwards compatibility)
  const [finalPP, setFinalPP] = useState(null); // performance points
  const [poseReady, setPoseReady] = useState(false);
  const [poseInitializing, setPoseInitializing] = useState(true);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const challengeVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const scoresRef = useRef([]);
  const recordedVideoRef = useRef(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Inflate factor for live and final scores (keeps values under 100)
  // 1.4 => +40% boost for displayed percentages (clamped below 100)
  const SCORE_INFLATION = {
    factor: 1.4,
    max: 99.99,
  };

  // Pose detection hook  - reference sequence will be set from challenge.reference_sequence
  const { currentScore, perStepScores, isRunning, start: startPose, stop: stopPose, reset: resetPose, goToStep } = usePoseDetection({
    videoRef,
    referenceSequence: challenge?.reference_sequence || [],
    threshold: 0.75,
    hold: 4,
    autoSkip: 0, // Disable auto-skip, manual progression
    disableAdvancement: false,
    onResult: (r) => {
      // First successful pose frame => mark ready
      if (!poseReady && r?.pose && Array.isArray(r.pose) && r.pose.length > 0) {
        setPoseReady(true);
        setPoseInitializing(false);
      }
    }
  });

  // Keep scoresRef in sync with perStepScores
  useEffect(() => {
    scoresRef.current = perStepScores;
  }, [perStepScores]);

  // Draw pose landmarks on canvas overlay
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
  let animationId;
  let currentStepIndex = 0;
  const lastSyncedStepRef = { current: -1 };

    const drawSkeleton = (landmarks, color, lineWidth = 3, dotSize = 5) => {
      if (!landmarks || !Array.isArray(landmarks) || landmarks.length === 0) return;
      
      const connections = [
        [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], // Arms
        [11, 23], [12, 24], [23, 24], // Torso
        [23, 25], [25, 27], [24, 26], [26, 28], // Legs
      ];
      
      // Draw connections
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      connections.forEach(([a, b]) => {
        if (landmarks[a] && landmarks[b]) {
          const visA = landmarks[a].visibility !== undefined ? landmarks[a].visibility : 1;
          const visB = landmarks[b].visibility !== undefined ? landmarks[b].visibility : 1;
          if (visA > 0.3 && visB > 0.3) {
            ctx.beginPath();
            ctx.moveTo(landmarks[a].x * canvas.width, landmarks[a].y * canvas.height);
            ctx.lineTo(landmarks[b].x * canvas.width, landmarks[b].y * canvas.height);
            ctx.stroke();
          }
        }
      });
      
      // Draw landmark points
      ctx.fillStyle = color;
      landmarks.forEach((landmark) => {
        if (landmark) {
          const vis = landmark.visibility !== undefined ? landmark.visibility : 1;
          if (vis > 0.3) {
            ctx.beginPath();
            ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, dotSize, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      });
    };

    const drawPose = () => {
      // Match canvas size to video
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw reference pose (cyan/blue) - the target pose to match
      const referenceSequence = challenge?.reference_sequence;
      const stepTimes = challenge?.step_times;
      
      if (referenceSequence && Array.isArray(referenceSequence) && referenceSequence.length > 0) {
        // Sync reference pose with challenge video's current time
        if (challengeVideoRef.current && stepTimes && Array.isArray(stepTimes) && stepTimes.length > 0) {
          const currentTime = challengeVideoRef.current.currentTime;
          
          // Find the reference pose index that corresponds to current video time
          let closestIndex = 0;
          let minDiff = Math.abs(stepTimes[0] - currentTime);
          
          for (let i = 1; i < stepTimes.length; i++) {
            const diff = Math.abs(stepTimes[i] - currentTime);
            if (diff < minDiff) {
              minDiff = diff;
              closestIndex = i;
            }
          }
          
          currentStepIndex = closestIndex;
          // sync hook step with challenge video time (only when it changes)
          try {
            if (lastSyncedStepRef.current !== currentStepIndex) {
              goToStep(currentStepIndex);
              lastSyncedStepRef.current = currentStepIndex;
            }
          } catch (e) {}
        } else {
          // Fallback: use perStepScores length (manual progression)
          currentStepIndex = Math.min(perStepScores.length, referenceSequence.length - 1);
          try {
            if (lastSyncedStepRef.current !== currentStepIndex) {
              goToStep(currentStepIndex);
              lastSyncedStepRef.current = currentStepIndex;
            }
          } catch (e) {}
        }
        
        const referencePose = referenceSequence[currentStepIndex];
        
        if (referencePose) {
          // Draw reference skeleton in cyan with slightly thicker lines
          drawSkeleton(referencePose, '#00d9ff', 4, 6);
          
          // Add a label for reference
          ctx.font = 'bold 14px Arial';
          ctx.fillStyle = '#00d9ff';
          ctx.fillText('TARGET', 10, 25);
        }
      }
      
      // Draw current pose (green) - your actual pose
      const currentPose = window.__currentPoseForCanvas;
      if (currentPose && Array.isArray(currentPose) && currentPose.length > 0) {
        drawSkeleton(currentPose, '#00ff00', 3, 5);
        
        // Add a label for current pose
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#00ff00';
        ctx.fillText('YOU', 10, 45);
      }
      
      // Show step indicator
      if (referenceSequence && referenceSequence.length > 0) {
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        const stepText = `Step ${currentStepIndex + 1}/${referenceSequence.length}`;
        const textWidth = ctx.measureText(stepText).width;
        ctx.strokeText(stepText, canvas.width - textWidth - 10, 25);
        ctx.fillText(stepText, canvas.width - textWidth - 10, 25);
      }
      
      animationId = requestAnimationFrame(drawPose);
    };
    
    if (isRunning) {
      drawPose();
    }
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isRunning, challenge, perStepScores, goToStep]);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchChallenge();
    startCamera();
  }, []);

  // Maintain object URL for recorded blob (prevents memory leaks)
  useEffect(() => {
    if (recordedBlob) {
      setPreviewLoading(true);
      const url = URL.createObjectURL(recordedBlob);
      setRecordedUrl(url);
      return () => {
        try { URL.revokeObjectURL(url); } catch (e) {}
      };
    } else {
      setRecordedUrl(null);
      setPreviewLoading(false);
    }
  }, [recordedBlob]);

  // Start pose engine once camera + challenge reference sequence available
  useEffect(() => {
    if (!poseReady && !isRunning && videoRef.current && challenge?.reference_sequence) {
      // Kick off initialization (will flip poseReady in onResult)
      try {
        setPoseInitializing(true);
        startPose();
      } catch (e) {
        console.warn('Pose start failed', e);
        setPoseInitializing(false);
      }
    }
  }, [challenge?.reference_sequence, videoRef.current]);

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

    // reset any previous recording and scores
    setRecordedBlob(null);
    setFinalScore(null);
    scoresRef.current = [];
    // Ensure pose engine is running & ready
    if (!poseReady) {
      setPoseInitializing(true);
      try { startPose(); } catch {}
      // wait until poseReady flips or timeout 3s
      const startTs = Date.now();
      while (!poseReady && Date.now() - startTs < 3000) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 100));
      }
    }
    // Fresh step scores
    resetPose();

    // countdown with pose detection already running
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
      
      // Start the challenge video first and wait for it to be ready
      if (challengeVideoRef.current) {
        try {
          challengeVideoRef.current.currentTime = 0;
          
          // Wait for video to be ready to play
          await new Promise((resolve) => {
            challengeVideoRef.current.oncanplay = resolve;
            // If already ready, resolve immediately
            if (challengeVideoRef.current.readyState >= 3) {
              resolve();
            }
          });
          
          await challengeVideoRef.current.play();
          
          // Give the video a moment to actually start playing and render first frame
          await new Promise((resolve) => setTimeout(resolve, 300));
          
          challengeVideoRef.current.onended = () => stopRecording();
        } catch (e) {
          console.warn("Challenge video play failed:", e);
        }
      }
      
      // Pose detection already started during countdown for warm-up
      // Just reset the step counter so scoring starts fresh
      try {
        resetPose();
      } catch (e) {
        console.warn("Failed to reset pose detection:", e);
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
      
      // Stop pose detection
      stopPose();
      
      // Calculate overall accuracy from perStepScores
      // Use setTimeout to ensure state has updated after stopPose
      setTimeout(() => {
        // Use the ref to get the latest scores (not stale closure value)
        const currentScores = scoresRef.current;
        
        console.log("Calculating final score from scoresRef:", currentScores);
        
        if (currentScores && currentScores.length > 0) {
          const avg = currentScores.reduce((a, b) => a + (b || 0), 0) / currentScores.length;
          const rawScore = avg * 100;
          // inflate and clamp below 100
          const inflated = Math.min(rawScore * SCORE_INFLATION.factor, SCORE_INFLATION.max);
          const score = Math.round(inflated);
          setFinalScore(score);
          // compute PP using scoringAPI fallback (difficulty from challenge)
          const pp = calculateBasicPP(score, challenge?.difficulty || 'BEGINNER');
          setFinalPP(pp);
          console.log("Final calculated score:", score, "(raw:", Math.round(rawScore), ") => PP:", pp, "from", currentScores.length, "steps", currentScores);
        } else {
          setFinalScore(0);
          setFinalPP(0);
          console.warn("No pose scores recorded - scoresRef was empty");
        }
      }, 500);
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
    
    // Fetch user's profile to get username for display
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();
    
    const playerName = profileData?.username || session.user.email;

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

    // Build scoreData payload for server
    const currentScores = scoresRef.current || [];
    const validStepScores = currentScores.filter(s => s != null && !isNaN(s));
    const avg = validStepScores.length > 0 ? (validStepScores.reduce((a,b)=>a+(b||0),0)/validStepScores.length) : 0;
    const rawScore = Math.round(avg * 100);
    const inflated = finalScore || Math.min(rawScore * SCORE_INFLATION.factor, SCORE_INFLATION.max);

    const scoreData = {
      finalScore: inflated,
      breakdown: {
        accuracy: Math.round((validStepScores.length > 0 ? validStepScores.reduce((a,b)=>a+(b||0),0)/validStepScores.length : 0) * 100),
        consistency: computeConsistency(currentScores),
        timing: 0,
        style: 0
      },
      difficulty: challenge?.difficulty || 'BEGINNER',
      difficultyMultiplier: challenge?.difficultyMultiplier || 1.0,
      metadata: {
        totalSteps: currentScores.length,
        validSteps: validStepScores.length,
        averageStepScore: Math.round(avg * 100)
      }
    };

    const ppData = {
      totalPP: finalPP || 0,
      breakdown: {},
      metadata: {}
    };

    // Send to backend for authoritative submission and leaderboard updates
    try {
      const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
      const resp = await fetch(`${API_BASE}/api/submit-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: id,
          userId,
          playerName,
          mimicUrl: publicData.publicUrl,
          scoreData,
          ppData
        })
      });

      const json = await resp.json();
      if (!resp.ok) {
        console.error('Submit failed', json);
        alert('Error submitting score: ' + (json.error || 'unknown'));
      } else {
        alert(`✅ Mimic uploaded and submitted! PP: ${ppData.totalPP}`);
      }
    } catch (err) {
      console.error('Submission error:', err);
      alert('Failed to submit score to server.');
    }

    setUploading(false);
    setFinalScore(null); // Reset for next recording
  };

  if (!challenge) return <p>Loading...</p>;

  const getScoreGrade = (score) => {
    if (score >= 95) return { grade: 'S+', color: '#FFD700' };
    if (score >= 90) return { grade: 'S', color: '#E6E6FA' };
    if (score >= 85) return { grade: 'A+', color: '#FF6B47' };
    if (score >= 80) return { grade: 'A', color: '#4ECDC4' };
    if (score >= 75) return { grade: 'B+', color: '#45B7D1' };
    if (score >= 70) return { grade: 'B', color: '#96CEB4' };
    if (score >= 60) return { grade: 'C', color: '#FECA57' };
    return { grade: 'D', color: '#FF6B6B' };
  };

  const computeConsistency = (scores) => {
    if (!scores || scores.length === 0) return 0;
    const valid = scores.filter(s => s != null && !isNaN(s));
    if (valid.length === 0) return 0;
    const mean = valid.reduce((a,b)=>a+b,0)/valid.length;
    const variance = valid.reduce((a,b)=>a+Math.pow(b-mean,2),0)/valid.length;
    const sd = Math.sqrt(variance);
    const consistency = Math.max(0, 1 - (sd / 0.5));
    return Math.round(consistency * 100);
  };

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
            {(!recording && recordedUrl) ? (
              <>
                <video
                  key={recordedUrl}
                  ref={recordedVideoRef}
                  src={recordedUrl}
                  controls
                  autoPlay
                  muted
                  playsInline
                  preload="metadata"
                  className="pane__video"
                  onLoadedMetadata={() => {
                    setPreviewLoading(false);
                    try { recordedVideoRef.current?.play?.(); } catch {}
                  }}
                  onError={() => setPreviewLoading(false)}
                />
                {previewLoading && (
                  <div style={{ position:'absolute',left:0,top:0,width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.4)',fontSize:'0.9rem',color:'#9dd49d' }}>
                    Preparing preview…
                  </div>
                )}
              </>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="pane__video"
                />
                <canvas
                  ref={canvasRef}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    opacity: isRunning ? 1 : 0,
                    transition: 'opacity 0.3s ease'
                  }}
                />
                {countdown && (
                  <div className="countdown-overlay">{countdown}</div>
                )}
              </>
            )}
          </div>

          {/* Pose detection status indicator */}
          <div style={{ marginTop: '8px', padding: '8px 12px', background: '#1a1a1a', borderRadius: '8px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: challenge?.reference_sequence && challenge.reference_sequence.length > 0 ? '#4ade80' : '#ef4444',
                display: 'inline-block'
              }}></span>
              <span style={{ color: '#9ca3af' }}>
                {challenge?.reference_sequence && challenge.reference_sequence.length > 0 
                  ? `Pose detection ready (${challenge.reference_sequence.length} reference poses)`
                  : 'No reference poses available - scoring disabled'}
              </span>
            </div>
            {isRunning && (
              <div style={{ marginTop: '6px', color: '#4ade80', fontSize: '0.8rem' }}>
                🟢 Pose tracking active
              </div>
            )}
          </div>

          {!recording ? (
            recordedUrl ? (
              <>
                {finalPP !== null && (
                      (() => {
                        const grade = getScoreGrade(finalScore || 0);
                        const currentScores = scoresRef.current || [];
                        const avgStepScore = currentScores && currentScores.length > 0 ? Math.round((currentScores.reduce((a,b)=>a+(b||0),0)/currentScores.length)*100) : 0;
                        const consistency = computeConsistency(currentScores);
                        const stepsCompleted = currentScores ? currentScores.length : 0;
                        return (
                          <div style={{ padding: '12px', background: 'rgba(59, 122, 59, 0.08)', borderRadius: '10px', color: '#d9f6d9', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div>
                                <div style={{ fontSize: '0.9rem', color: '#cfead1' }}>Final Grade</div>
                                <div style={{ fontSize: '2rem', fontWeight: '800', color: grade.color }}>{grade.grade}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.9rem', color: '#cfead1' }}>Accuracy</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '700' }}>{finalScore}%</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.9rem', color: '#cfead1' }}>PP Earned</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: '700' }}>{finalPP} PP</div>
                              </div>
                            </div>

                            <div style={{ marginTop: '10px', display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.8rem', color: '#9dd49d' }}>Steps completed</div>
                                <div style={{ fontSize: '1rem' }}>{stepsCompleted} / {challenge?.reference_sequence?.length || 0}</div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.8rem', color: '#9dd49d' }}>Avg step score</div>
                                <div style={{ fontSize: '1rem' }}>{avgStepScore}%</div>
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.8rem', color: '#9dd49d' }}>Consistency</div>
                                <div style={{ fontSize: '1rem' }}>{consistency}%</div>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    )}
                <button className="btn" disabled={uploading} onClick={handleUploadMimic}>
                  {uploading ? 'Uploading...' : '⬆️ Upload Mimic'}
                </button>
              </>
            ) : (
              <>
                <button className="btn" onClick={startRecordingProcess} disabled={!poseReady || poseInitializing}>
                  {poseInitializing && !poseReady ? '⏳ Preparing pose engine…' : '🎥 Start Recording'}
                </button>
                {!poseReady && (
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#9ca3af' }}>
                    Loading pose model & reference…
                  </div>
                )}
              </>
            )
          ) : (
            <>
              <button className="btn btn-stop" onClick={stopRecording}>
                ⏹ Stop Recording
              </button>
              {isRunning && (
                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(59, 122, 59, 0.15)', borderRadius: '10px', border: '2px solid rgba(59, 122, 59, 0.3)' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '700', color: '#9dd49d', marginBottom: '6px' }}>
                    Live Accuracy: {Math.min(currentScore * SCORE_INFLATION.factor, SCORE_INFLATION.max).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#d9f6d9' }}>
                    Steps completed: {perStepScores.length}
                    {challenge?.reference_sequence && challenge.reference_sequence.length > 0 && (
                      <span> / {challenge.reference_sequence.length}</span>
                    )}
                  </div>
                  <div style={{ 
                    marginTop: '8px', 
                    height: '6px', 
                    background: '#1a1a1a', 
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${Math.min(currentScore * SCORE_INFLATION.factor, SCORE_INFLATION.max)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #3b7a3b, #4ade80)',
                      transition: 'width 0.3s ease'
                    }}></div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Preview section removed - the mimic pane becomes the player */}
        </div>
      </div>

      <div className="challenge__leaderboard">
        <Leaderboard challenge={challenge} />
      </div>
    </div>
  );
}