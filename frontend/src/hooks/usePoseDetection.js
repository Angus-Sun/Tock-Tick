import { useCallback, useEffect, useRef, useState } from 'react';
import { Pose } from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { poseSimilarity, perJointAngleSimilarity, shoulderSpreadSimilarity } from '../utils/poseUtil';

/**
 * Baseline usePoseDetection hook
 * - videoRef: React ref to a <video> element (webcam or playback)
 * - referenceSequence: array of reference landmark frames (MediaPipe style)
 * - threshold: similarity threshold (0..1) to register a match for a step
 * - hold: consecutive frames above threshold required to advance
 * - onResult: optional callback called with { pose, score, step }
 */
export default function usePoseDetection({
	videoRef,
	referenceSequence = [],
	threshold = 0.75,
	hold = 4,
	onResult,
	autoSkip = 0, // seconds to wait before auto-advancing if user doesn't match (0 = disabled)
} = {}) {
	const poseRef = useRef(null);
	const cameraRef = useRef(null);
	const framesAboveRef = useRef(0);
	const stepRef = useRef(0);
	const perStepBestRef = useRef([]);
	const stepStartRef = useRef(0);

	const [isRunning, setIsRunning] = useState(false);
	const [currentPose, setCurrentPose] = useState(null);
	const [currentScore, setCurrentScore] = useState(0);
	const [currentStep, setCurrentStep] = useState(0);
	const [perStepScores, setPerStepScores] = useState([]);
	const [lastPerJointSims, setLastPerJointSims] = useState(null);
	// track previous landmarks to detect motion; penalize low-motion (sitting still)
	const lastLandmarksRef = useRef(null);

	// motion penalty config
	// motionThreshold: normalized motion (relative to shoulder width) at which no penalty applies
	// minMotionScale: minimum multiplier applied to similarity when motion==0 (e.g., 0.5 halves score)
	const MOTION_CONFIG = {
		motionThreshold: 0.02,
		minMotionScale: 0.5,
		// which landmark indices to consider for motion energy
		motionIndices: [11, 12, 13, 14, 15, 16, 23, 24, 25, 26],
	};

	const getTorsoWidth = (landmarks) => {
		if (!landmarks || !landmarks[11] || !landmarks[12]) return 0;
		const a = landmarks[11];
		const b = landmarks[12];
		const dx = a.x - b.x;
		const dy = a.y - b.y;
		return Math.sqrt(dx * dx + dy * dy) || 0;
	};

	const computeMotionMetric = (curr, prev) => {
		if (!curr || !prev) return 0;
		const indices = MOTION_CONFIG.motionIndices;
		const torso = getTorsoWidth(curr) || getTorsoWidth(prev) || 1;
		let sum = 0;
		let count = 0;
		for (const idx of indices) {
			const c = curr[idx];
			const p = prev[idx];
			if (!c || !p) continue;
			const dx = c.x - p.x;
			const dy = c.y - p.y;
			const d = Math.sqrt(dx * dx + dy * dy);
			sum += d / torso; // normalize by torso width
			count += 1;
		}
		return count ? sum / count : 0;
	};

	const reset = useCallback(() => {
		framesAboveRef.current = 0;
		stepRef.current = 0;
		setCurrentStep(0);
		setCurrentScore(0);
		perStepBestRef.current = [];
		setPerStepScores([]);
	}, []);

	// when referenceSequence changes, reset per-step tracking
	useEffect(() => {
		perStepBestRef.current = new Array(referenceSequence ? referenceSequence.length : 0).fill(0);
		setPerStepScores(perStepBestRef.current.slice());
		stepRef.current = 0;
		stepStartRef.current = Date.now();
		setCurrentStep(0);
	}, [referenceSequence]);

	const nextStep = useCallback(() => {
		if (!referenceSequence || referenceSequence.length === 0) return;
		stepRef.current = Math.min(stepRef.current + 1, referenceSequence.length - 1);
		framesAboveRef.current = 0;
		setCurrentStep(stepRef.current);
		stepStartRef.current = Date.now();
	}, [referenceSequence]);

	const prevStep = useCallback(() => {
		if (!referenceSequence || referenceSequence.length === 0) return;
		stepRef.current = Math.max(0, stepRef.current - 1);
		framesAboveRef.current = 0;
		setCurrentStep(stepRef.current);
		stepStartRef.current = Date.now();
	}, [referenceSequence]);

	const goToStep = useCallback((i) => {
		if (!referenceSequence || referenceSequence.length === 0) return;
		const idx = Math.max(0, Math.min(i, referenceSequence.length - 1));
		stepRef.current = idx;
		framesAboveRef.current = 0;
		setCurrentStep(stepRef.current);
		stepStartRef.current = Date.now();
	}, [referenceSequence]);

	const stop = useCallback(() => {
		setIsRunning(false);
		if (cameraRef.current && cameraRef.current.stop) cameraRef.current.stop();
		if (poseRef.current && typeof poseRef.current.close === 'function') poseRef.current.close();
		cameraRef.current = null;
		poseRef.current = null;
		try { window.__currentPoseForCanvas = null; } catch (e) {}
	}, []);

	const start = useCallback(() => {
		if (!videoRef?.current) return;
		setIsRunning(true);

		const pose = new Pose({
			locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`,
		});

		pose.setOptions({
			modelComplexity: 1,
			smoothLandmarks: true,
			enableSegmentation: false,
			minDetectionConfidence: 0.5,
			minTrackingConfidence: 0.5,
		});

		pose.onResults((results) => {
			const landmarks = results.poseLandmarks || [];
			// expose lightweight global copy for canvas overlay drawing
			try { window.__currentPoseForCanvas = landmarks; } catch (e) { }
			setCurrentPose(landmarks);

			if (!referenceSequence || referenceSequence.length === 0) {
				setCurrentScore(0);
				if (typeof onResult === 'function') onResult({ pose: landmarks, score: 0, step: stepRef.current });
				return;
			}

					const targetIndex = Math.min(stepRef.current, referenceSequence.length - 1);
					const target = referenceSequence[targetIndex];

					// Angle-based per-joint similarity (preferred)
							let sim = 0;
							try {
								const sims = perJointAngleSimilarity(landmarks, target, { angleTolerance: 35, distTolerance: 0.75, visibilityThreshold: 0.2 });
								// expose last per-joint sims for debugging/UI
								try { setLastPerJointSims(sims); } catch (e) { }
								// Weigh joints: give more importance to shoulders (arms) while still using hips/knees
								// Includes an explicit shoulder-spread term to capture arms-out vs arms-down differences
								const weightMap = {
									25: 0.10, // left_knee
									26: 0.10, // right_knee
									23: 0.10, // left_hip
									24: 0.10, // right_hip
									11: 0.20, // left_shoulder  (increased)
									12: 0.20, // right_shoulder (increased)
									13: 0.10, // left_elbow
									14: 0.10, // right_elbow
								};
								const shoulderSpreadWeight = 0.15; // extra term (0..1 weight) for shoulder width similarity
								let sum = 0;
								let wsum = 0;
								for (const idxStr of Object.keys(weightMap)) {
									const idx = Number(idxStr);
									const w = weightMap[idx];
									// fallback to conservative 0.2 when sim missing
									const s = (sims && sims[idx] != null) ? sims[idx] : 0.2;
									sum += s * w;
									wsum += w;
								}
								// shoulder spread similarity (distance between left and right shoulder after normalization)
								const shoulderSpreadSim = shoulderSpreadSimilarity(landmarks, target, 0.6);
								sum += shoulderSpreadSim * shoulderSpreadWeight;
								wsum += shoulderSpreadWeight;
								sim = wsum ? sum / wsum : 0;

								// (per-step best will be updated after motion penalty is applied)
							} catch (e) {
								// fallback to flattened-pose similarity
								sim = poseSimilarity(landmarks, target);
							}

				// compute motion and apply motion-based penalty (penalize sitting still)
				const prevLandmarks = lastLandmarksRef.current;
				const motionMetric = computeMotionMetric(landmarks, prevLandmarks);
				const motionFactor = Math.max(0, Math.min(1, motionMetric / MOTION_CONFIG.motionThreshold));
				const motionScale = MOTION_CONFIG.minMotionScale + (1 - MOTION_CONFIG.minMotionScale) * motionFactor;

				// apply motionScale to similarity
				const penalizedSim = sim * motionScale;

				// update per-step best for the current step using penalized similarity
				if (typeof stepRef.current === 'number') {
					const idx = stepRef.current;
					perStepBestRef.current[idx] = Math.max(perStepBestRef.current[idx] || 0, penalizedSim);
					setPerStepScores(perStepBestRef.current.slice());
				}

				const score = Math.round(penalizedSim * 100);
				setCurrentScore(score);

							if (penalizedSim >= threshold) framesAboveRef.current += 1; else framesAboveRef.current = 0;

					if (framesAboveRef.current >= hold) {
				framesAboveRef.current = 0;
				// advance step (cap at last index). If we're at the final step, stay there.
						if (referenceSequence && referenceSequence.length > 0) {
							stepRef.current = Math.min(stepRef.current + 1, Math.max(0, referenceSequence.length - 1));
						} else {
							stepRef.current = 0;
						}
						// reset per-step start time for the newly advanced step
						stepStartRef.current = Date.now();
						setCurrentStep(stepRef.current);
			}

					// auto-skip: if configured and the user hasn't matched within the timeout, advance
					try {
						if (autoSkip && typeof autoSkip === 'number' && autoSkip > 0) {
							const now = Date.now();
							const elapsed = now - (stepStartRef.current || 0);
							if (elapsed >= Math.round(autoSkip * 1000)) {
								// record current best for this step then advance (use penalized similarity)
								const completedIdx = stepRef.current;
								perStepBestRef.current[completedIdx] = Math.max(perStepBestRef.current[completedIdx] || 0, penalizedSim);
								setPerStepScores(perStepBestRef.current.slice());
								if (referenceSequence && referenceSequence.length > 0) {
									stepRef.current = Math.min(stepRef.current + 1, referenceSequence.length - 1);
								} else {
									stepRef.current = 0;
								}
								setCurrentStep(stepRef.current);
								// reset step start timer
								stepStartRef.current = Date.now();
							}
						}
					} catch (e) {}

				// expose last landmarks for next-frame motion computation
				try { lastLandmarksRef.current = landmarks; } catch (e) {}

				if (typeof onResult === 'function') onResult({ pose: landmarks, score, step: stepRef.current, perJoint: lastPerJointSims, motion: motionMetric, motionScale });

				// debug log: step, sim, penalizedSim, motion
				try {
					console.debug('pose-detect', { step: stepRef.current, sim, penalizedSim, motion: motionMetric, motionScale, framesAbove: framesAboveRef.current, threshold, perJoint: lastPerJointSims });
				} catch (e) {}
		});

		const camera = new Camera(videoRef.current, {
			onFrame: async () => {
				try {
					await pose.send({ image: videoRef.current });
				} catch (e) {
					// swallow frame errors
				}
			},
			width: 640,
			height: 480,
		});

		camera.start();
		poseRef.current = pose;
		cameraRef.current = camera;
	}, [videoRef, referenceSequence, threshold, hold, onResult, autoSkip]);

	useEffect(() => () => stop(), [stop]);

	return {
		currentPose,
		currentScore,
		currentStep,
		perStepScores,
		isRunning,
		start,
		stop,
		reset,
		nextStep,
		prevStep,
		goToStep,
	};
}