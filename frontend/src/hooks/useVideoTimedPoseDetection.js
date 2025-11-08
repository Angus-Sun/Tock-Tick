import { useCallback, useEffect, useRef, useState } from 'react';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { perJointAngleSimilarity, shoulderSpreadSimilarity } from '../utils/poseUtil';

/**
 * Video-synced pose detection hook
 * - videoRef: React ref to a <video> element (webcam)
 * - referenceVideo: URL/Blob of the reference video
 * - onResult: optional callback called with { pose, score, timestamp }
 */
export default function useVideoTimedPoseDetection({
  videoRef,
  referenceVideo,
  threshold = 0.75,
  hold = 4,
  onResult,
} = {}) {
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const referenceVideoRef = useRef(null);
  const referenceDetectorRef = useRef(null);
  const startTimeRef = useRef(0);
  const referencePosesRef = useRef([]);

  const [isRunning, setIsRunning] = useState(false);
  const [currentPose, setCurrentPose] = useState(null);
  const [currentScore, setCurrentScore] = useState(0);
  const [referenceLoaded, setReferenceLoaded] = useState(false);
  const [perStepScores, setPerStepScores] = useState([]);
  const [currentTimestamp, setCurrentTimestamp] = useState(0);

  // Reset everything
  const reset = useCallback(() => {
    startTimeRef.current = Date.now();
    setCurrentScore(0);
    setPerStepScores([]);
    setCurrentTimestamp(0);
    if (referenceVideoRef.current) {
      referenceVideoRef.current.currentTime = 0;
    }
  }, []);

  // Load and process the reference video
  useEffect(() => {
    if (!referenceVideo) return;
    
    // Create hidden video element for the reference
    const video = document.createElement('video');
    video.muted = true;
    video.src = typeof referenceVideo === 'string' ? referenceVideo : URL.createObjectURL(referenceVideo);
    referenceVideoRef.current = video;

    // Set up pose detector for reference video
    const pose = new Pose({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    const poses = [];
    pose.onResults((results) => {
      if (results.poseLandmarks) {
        poses.push({
          timestamp: video.currentTime,
          landmarks: results.poseLandmarks,
        });
      }
    });

    // Process the video frames to collect reference poses
    video.addEventListener('loadedmetadata', async () => {
      const duration = video.duration;
      const fps = 15; // sample rate
      const interval = 1000 / fps;
      
      // Play and capture frames
      video.play();
      return new Promise((resolve) => {
        const iv = setInterval(async () => {
          if (video.ended || video.currentTime >= duration) {
            clearInterval(iv);
            resolve();
            return;
          }
          try {
            await pose.send({ image: video });
          } catch (e) {}
        }, interval);
      }).then(() => {
        referencePosesRef.current = poses;
        setReferenceLoaded(true);
        pose.close();
      });
    });

    return () => {
      try { URL.revokeObjectURL(video.src); } catch (e) {}
      try { pose.close(); } catch (e) {}
    };
  }, [referenceVideo]);

  // Main pose detection for webcam
  const start = useCallback(() => {
    if (!videoRef?.current || !referenceLoaded) return;
    setIsRunning(true);
    startTimeRef.current = Date.now();

    const pose = new Pose({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    pose.onResults((results) => {
      const landmarks = results.poseLandmarks || [];
      setCurrentPose(landmarks);
      // expose lightweight global copy for canvas overlay
      try { window.__currentPoseForCanvas = landmarks; } catch (e) {}

      // Find the reference pose for the current timestamp
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setCurrentTimestamp(elapsed);

      // Find closest reference pose by timestamp
      const reference = referencePosesRef.current.find(p => Math.abs(p.timestamp - elapsed) < 0.1);
      if (!reference) {
        setCurrentScore(0);
        return;
      }

      // Score against reference using angle-based similarity
      try {
        const sims = perJointAngleSimilarity(landmarks, reference.landmarks, {
          angleTolerance: 35,
          distTolerance: 0.75,
          visibilityThreshold: 0.2
        });

        // Weight joints like the original hook
        const weightMap = {
          25: 0.10, // left_knee
          26: 0.10, // right_knee
          23: 0.10, // left_hip
          24: 0.10, // right_hip
          11: 0.20, // left_shoulder
          12: 0.20, // right_shoulder
          13: 0.10, // left_elbow
          14: 0.10, // right_elbow
        };
        const shoulderSpreadWeight = 0.15;

        let sum = 0;
        let wsum = 0;
        for (const [idx, w] of Object.entries(weightMap)) {
          const s = (sims && sims[idx] != null) ? sims[idx] : 0.2;
          sum += s * w;
          wsum += w;
        }

        const shoulderSpreadSim = shoulderSpreadSimilarity(landmarks, reference.landmarks, 0.6);
        sum += shoulderSpreadSim * shoulderSpreadWeight;
        wsum += shoulderSpreadWeight;

        const sim = wsum ? sum / wsum : 0;
        const score = Math.round(sim * 100);
        setCurrentScore(score);

        // Update scores for this timepoint
        setPerStepScores((prev) => {
          const idx = Math.floor(elapsed * 2); // bucket scores every 0.5s
          const next = [...prev];
          next[idx] = Math.max(next[idx] || 0, sim);
          return next;
        });

        if (typeof onResult === 'function') {
          onResult({ pose: landmarks, score, timestamp: elapsed });
        }
      } catch (e) {
        setCurrentScore(0);
      }
    });

    const camera = new Camera(videoRef.current, {
      onFrame: async () => {
        try {
          await pose.send({ image: videoRef.current });
        } catch (e) {}
      },
      width: 640,
      height: 480,
    });

    camera.start();
    poseRef.current = pose;
    cameraRef.current = camera;
  }, [videoRef, referenceLoaded, onResult]);

  const stop = useCallback(() => {
    setIsRunning(false);
    if (cameraRef.current) cameraRef.current.stop();
    if (poseRef.current) poseRef.current.close();
    cameraRef.current = null;
    poseRef.current = null;
    try { window.__currentPoseForCanvas = null; } catch (e) {}
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    currentPose,
    currentScore,
    currentTimestamp,
    perStepScores,
    isRunning,
    isReady: referenceLoaded,
    start,
    stop,
    reset,
  };
}