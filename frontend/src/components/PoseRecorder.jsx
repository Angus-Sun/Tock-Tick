import React, { useEffect, useRef, useState } from 'react';
import usePoseDetection from '../hooks/usePoseDetection';

// Simple Pose Recorder
// - shows a video preview, lets you enable camera
// - uses usePoseDetection to get currentPose
// - capture button stores the currentPose into an array (one step per capture)
// - download button saves captured array as JSON

export default function PoseRecorder() {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [captures, setCaptures] = useState([]);

  const { currentPose, start, stop, reset, isRunning } = usePoseDetection({
    videoRef,
    referenceSequence: [],
    threshold: 0.75,
    hold: 4,
  });

  useEffect(() => {
    return () => stop();
  }, [stop]);

  async function enableCamera() {
    if (!videoRef.current) return;
    setStatus('requesting');
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
      setStatus('ready');
      try { start(); } catch (e) { console.warn(e); }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err?.message || String(err));
    }
  }

  function captureStep() {
    if (!currentPose || !currentPose.length) {
      alert('No pose detected yet. Wait until the detector locks on and try again.');
      return;
    }
    // deep copy landmarks to detach from hook
    const copy = JSON.parse(JSON.stringify(currentPose));
    setCaptures((s) => [...s, copy]);
  }

  function downloadJSON() {
    const data = JSON.stringify(captures, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'referenceSequence.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    setCaptures([]);
  }

  return (
    <div style={{ border: '1px solid #ddd', padding: 12, borderRadius: 8, maxWidth: 720 }}>
      <h3>Pose Recorder</h3>
      <div style={{ width: 640, height: 360, background: '#000' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>

      <div style={{ marginTop: 8 }}>
        {status !== 'ready' && <button onClick={enableCamera}>Enable camera</button>}
        {status === 'ready' && <button onClick={() => (isRunning ? stop() : start())}>{isRunning ? 'Stop Pose' : 'Start Pose'}</button>}
        <button onClick={captureStep} style={{ marginLeft: 8 }}>Capture Step</button>
        <button onClick={downloadJSON} style={{ marginLeft: 8 }} disabled={!captures.length}>Download JSON</button>
        <button onClick={clearAll} style={{ marginLeft: 8 }} disabled={!captures.length}>Clear</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Captured steps:</strong> {captures.length}
        <ol style={{ marginTop: 8, maxHeight: 160, overflow: 'auto' }}>
          {captures.map((c, i) => (
            <li key={i} style={{ fontSize: 12, marginBottom: 6 }}>
              Step {i + 1} — {Array.isArray(c) ? `${c.length} landmarks` : typeof c}
            </li>
          ))}
        </ol>
      </div>

      {errorMsg && <div style={{ color: 'red', marginTop: 8 }}>Error: {errorMsg}</div>}
    </div>
  );
}
