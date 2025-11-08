import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera } from '@mediapipe/camera_utils';
import { perJointAngleSimilarity, shoulderSpreadSimilarity } from '../utils/poseUtil';
import { initializePoseDetection } from '../utils/poseLoader';

/**
 * Video-synced pose detection hook - uses shared MediaPipe instance for faster loading
 * - videoRef: React ref to a <video> element (webcam)
 * - referenceVideoRef: React ref to the reference video element
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
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState(null);
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

  // Set up the reference pose detector using shared instance
  useEffect(() => {
    if (!referenceVideo || !referenceVideoRef.current) return;

    let pose = null;
    setIsLoading(true);
    setLoadingProgress(10);

    // Use the shared MediaPipe instance
    initializePoseDetection(
      (progress) => setLoadingProgress(10 + Math.floor(progress * 0.8))
    ).then(p => {
      pose = p;
      setLoadingProgress(90);

    // Store the most recent pose results for the current timestamp
    pose.onResults((results) => {
      if (results.poseLandmarks) {
        referencePosesRef.current = {
          timestamp: referenceVideoRef.current.currentTime,
          landmarks: results.poseLandmarks,
        };
      }
    });

    referenceDetectorRef.current = pose;
    setReferenceLoaded(true);
    setIsLoading(false);
    setLoadingProgress(100);

    // No need to close the shared instance
    return () => {};
  }, [referenceVideo]);

  // Main pose detection for webcam
  const start = useCallback(() => {
    if (!videoRef?.current || !referenceLoaded) return;
    setIsRunning(true);
    startTimeRef.current = Date.now();

    // Use the shared MediaPipe instance for webcam detection
    const pose = await initializePoseDetection();

    pose.onResults((results) => {
      const landmarks = results.poseLandmarks || [];
      setCurrentPose(landmarks);
      // expose lightweight global copy for canvas overlay
      try { window.__currentPoseForCanvas = landmarks; } catch (e) {}

      // Get current timestamp from reference video
      const elapsed = referenceVideoRef.current?.currentTime || 0;
      setCurrentTimestamp(elapsed);

      // Use the most recent reference pose
      const reference = referencePosesRef.current;
      if (!reference || !reference.landmarks) {
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
    isLoading,
    loadingProgress,
    error,
    isReady: referenceLoaded && !isLoading && !error,
    start,
    stop,
    reset,
  };
}