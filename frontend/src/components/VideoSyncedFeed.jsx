import React, { useRef, useState, useEffect } from 'react';
import useVideoTimedPoseDetection from '../hooks/useVideoTimedPoseDetection';
import { JOINT_NAMES, similarityToColor, perJointAngleSimilarity } from '../utils/poseUtil';
import './VideoSyncedFeed.css';

export default function VideoSyncedFeed({ referenceVideo }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | requesting | ready | error
  const [errorMsg, setErrorMsg] = useState('');
  const [showReference, setShowReference] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showLive, setShowLive] = useState(true);
  const [colorBySimilarity, setColorBySimilarity] = useState(true);

  // Use the video-synced hook
  const { currentScore, currentTimestamp, perStepScores, isRunning, isReady, start, stop, reset } = useVideoTimedPoseDetection({
    videoRef,
    referenceVideo,
    threshold: 0.75,
    hold: 4,
  });

  // Average score across all recorded timepoints
  const overallAccuracy = perStepScores.length
    ? Math.round((perStepScores.reduce((a, b) => a + (b || 0), 0) / perStepScores.length) * 100)
    : 0;

  useEffect(() => {
    return () => stop();
  }, [stop]);

  async function enableCameraAndStart() {
    if (!videoRef.current) return;
    setStatus('requesting');
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
      setStatus('ready');
      try {
        start();
      } catch (e) {
        console.warn('Failed to start pose hook:', e);
      }
    } catch (err) {
      console.error('Camera permission / start error', err);
      setStatus('error');
      setErrorMsg(err?.message || String(err));
    }
  }

  // Drawing overlay with canvas (same as WebcamFeed.jsx)
  useEffect(() => {
    let raf = null;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');

    function resizeCanvas() {
      const rect = video.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }

    function draw() {
      if (!ctx) return;
      resizeCanvas();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const connections = [
        [11, 12], [11, 23], [12, 24], [23, 24],
        [11, 13], [13, 15],
        [12, 14], [14, 16],
        [23, 25], [25, 27],
        [24, 26], [26, 28],
        [11, 12]
      ];

      const drawLandmarks = (landmarks, opts = {}) => {
        const { defaultColor = 'cyan', perJointColors = null, labels = true } = opts;
        if (!Array.isArray(landmarks) || landmarks.length === 0) return;
        ctx.lineWidth = 2;

        for (const [a, b] of connections) {
          const A = landmarks[a];
          const B = landmarks[b];
          if (!A || !B) continue;
          const x1 = A.x * canvas.width;
          const y1 = A.y * canvas.height;
          const x2 = B.x * canvas.width;
          const y2 = B.y * canvas.height;
          let stroke = defaultColor;
          if (perJointColors && perJointColors[a] && perJointColors[b]) {
            stroke = perJointColors[a];
          }
          ctx.strokeStyle = stroke;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        for (let i = 0; i < landmarks.length; i++) {
          const p = landmarks[i];
          if (!p) continue;
          const x = p.x * canvas.width;
          const y = p.y * canvas.height;
          const fill = perJointColors && perJointColors[i] ? perJointColors[i] : defaultColor;
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
          if (labels) {
            ctx.font = '10px Arial';
            ctx.fillStyle = 'white';
            const label = JOINT_NAMES && JOINT_NAMES[i] ? JOINT_NAMES[i] : String(i);
            ctx.fillText(label, x + 6, y - 6);
          }
        }
      };

      try {
        const live = window && window.__currentPoseForCanvas ? window.__currentPoseForCanvas : null;
        if (showLive && live) {
          drawLandmarks(live, { defaultColor: 'lime', perJointColors: null, labels: showLabels });
        }
      } catch (e) {}

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [videoRef.current, canvasRef.current, showLive, showLabels]);

  return (
    <div>
      <div className="video-container">
        {/* Reference video */}
        <div className="video-feed">
          <video
            src={referenceVideo}
            autoPlay
            loop
            muted
            playsInline
          />
          <div className="video-label">
            Reference Dance
          </div>
        </div>

        {/* Your webcam feed */}
        <div className="video-feed">
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} />

          {/* Time and score overlay */}
          <div className="video-overlay">
            <div>Time: {currentTimestamp.toFixed(1)}s</div>
            <div style={{ color: '#0f0' }}>Score: {currentScore}%</div>
          </div>

          <div className="video-label">
            Your Performance
          </div>
        </div>
      </div>

      <div className="controls">
        {status !== 'ready' && (
          <button onClick={enableCameraAndStart}>Enable camera & start</button>
        )}
        {status === 'ready' && (
          <button onClick={() => (isRunning ? stop() : start())}>{isRunning ? 'Stop' : 'Restart'}</button>
        )}
        <button onClick={reset} style={{ marginLeft: 8 }}>Reset</button>
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={{ marginRight: 12 }}><input type="checkbox" checked={showLive} onChange={(e) => setShowLive(e.target.checked)} /> Show live</label>
        <label style={{ marginRight: 12 }}><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Show labels</label>
      </div>

      {/* Score display */}
      <div style={{ marginTop: 8 }}>
        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, display: 'inline-block' }}>
          <div style={{ fontSize: 12, color: '#ddd' }}>Overall dance accuracy</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{overallAccuracy}%</div>
        </div>
      </div>

      <div style={{ marginTop: 8, color: status === 'error' ? 'red' : '#444' }}>
        <strong>Status:</strong> {status} {!isReady && '(loading reference...)'}
        {errorMsg && <div style={{ marginTop: 4 }}>Error: {errorMsg}</div>}
      </div>
    </div>
  );
}