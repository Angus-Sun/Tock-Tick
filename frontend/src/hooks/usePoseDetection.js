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
	referenceSequence,
	threshold = 0.75,
	hold = 4,
	onResult,
	autoSkip = 0, // seconds to wait before auto-advancing if user doesn't match (0 = disabled)
	disableAdvancement = false, // when true, don't auto-advance steps (external controller manages steps)
} = {}) {
	const poseRef = useRef(null);
	const cameraRef = useRef(null);
	const lastPoseRef = useRef(null);
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
								const sims = perJointAngleSimilarity(landmarks, target, { angleTolerance: 25, distTolerance: 0.6, visibilityThreshold: 0.25 });
								// expose last per-joint sims for debugging/UI
								try { setLastPerJointSims(sims); } catch (e) { }
								// Weigh joints: give more importance to shoulders (arms) while still using hips/knees
								// Includes an explicit shoulder-spread term to capture arms-out vs arms-down differences
								// Rebalanced weights: emphasize arms (shoulder/elbow/wrist) and legs (knee/ankle),
								// de-emphasize hips/torso/head so standing still doesn't score highly.
								const weightMap = {
									// legs
									25: 0.10, // left_knee
									26: 0.10, // right_knee
									27: 0.06, // left_ankle
									28: 0.06, // right_ankle
									// hips (lower weight)
									23: 0.06, // left_hip
									24: 0.06, // right_hip
									// arms (higher weight)
									11: 0.14, // left_shoulder
									12: 0.14, // right_shoulder
									13: 0.12, // left_elbow
									14: 0.12, // right_elbow
									15: 0.12, // left_wrist
									16: 0.12, // right_wrist
								};
								const shoulderSpreadWeight = 0.15; // extra term (0..1 weight) for shoulder width similarity
								let sum = 0;
								let wsum = 0;
								for (const idxStr of Object.keys(weightMap)) {
									const idx = Number(idxStr);
									const w = weightMap[idx];
									// fallback to conservative 0.1 when sim missing
									const s = (sims && sims[idx] != null) ? sims[idx] : 0.1;
									sum += s * w;
									wsum += w;
								}
								// shoulder spread similarity (distance between left and right shoulder after normalization)
								const shoulderSpreadSim = shoulderSpreadSimilarity(landmarks, target, 0.6);
								sum += shoulderSpreadSim * shoulderSpreadWeight;
								wsum += shoulderSpreadWeight;
								sim = wsum ? sum / wsum : 0;

								// Motion penalty: if the reference is moving between consecutive steps but the
								// user is not moving, reduce similarity so standing still doesn't score highly.
								try {
									const prevTarget = referenceSequence && referenceSequence[Math.max(0, stepRef.current - 1)];
									let refMotion = 0;
									if (prevTarget && Array.isArray(prevTarget) && Array.isArray(target) && prevTarget.length === target.length) {
										let s = 0;
										let cnt = 0;
										for (let i = 0; i < target.length; i++) {
											const a = prevTarget[i];
											const b = target[i];
											if (!a || !b) continue;
											s += Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
											cnt++;
										}
										refMotion = cnt ? s / cnt : 0;
									}

								let userMotion = 0;
								if (lastPoseRef.current && Array.isArray(lastPoseRef.current) && Array.isArray(landmarks) && lastPoseRef.current.length === landmarks.length) {
									let s2 = 0, c2 = 0;
									for (let i = 0; i < landmarks.length; i++) {
										const a = lastPoseRef.current[i];
										const b = landmarks[i];
										if (!a || !b) continue;
										s2 += Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
										c2++;
									}
									userMotion = c2 ? s2 / c2 : 0;
								}

								// Strong penalty if reference is moving but user is not
								if (refMotion > 0.02 && userMotion < Math.max(0.004, refMotion * 0.4)) {
									sim *= 0.35;
								}
								
								// Additional penalty: if user is completely still (very low motion), score should be near zero
								if (userMotion < 0.003) {
									sim *= 0.1; // Reduce to 10% if barely moving
								}
								} catch (e) {}

								// update per-step best for the current step
								if (typeof stepRef.current === 'number') {
									const idx = stepRef.current;
									perStepBestRef.current[idx] = Math.max(perStepBestRef.current[idx] || 0, sim);
									setPerStepScores(perStepBestRef.current.slice());
								}
							} catch (e) {
								// fallback to flattened-pose similarity
								sim = poseSimilarity(landmarks, target);
							}
				const score = Math.round(sim * 100);
				setCurrentScore(score);

							if (sim >= threshold) framesAboveRef.current += 1; else framesAboveRef.current = 0;

					// If autoSkip timing is enabled, prefer time-based advancement instead of
					// requiring the user to hit accuracy thresholds. Otherwise, allow
					// sim/hold-based advancement as before.
					if (!disableAdvancement && (!autoSkip || autoSkip <= 0) && framesAboveRef.current >= hold) {
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
						if (!disableAdvancement && autoSkip && typeof autoSkip === 'number' && autoSkip > 0) {
							const now = Date.now();
							const elapsed = now - (stepStartRef.current || 0);
							if (elapsed >= Math.round(autoSkip * 1000)) {
								// record current best for this step then advance
								const completedIdx = stepRef.current;
								perStepBestRef.current[completedIdx] = Math.max(perStepBestRef.current[completedIdx] || 0, sim);
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

				if (typeof onResult === 'function') onResult({ pose: landmarks, score, step: stepRef.current, perJoint: lastPerJointSims });

				// update lastPoseRef for motion comparisons on the next frame
				try {
					lastPoseRef.current = landmarks && Array.isArray(landmarks) ? landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })) : null;
				} catch (e) {}

				// debug log: step, sim, framesAbove
				try {
					console.debug('pose-detect', { step: stepRef.current, sim, framesAbove: framesAboveRef.current, threshold, perJoint: lastPerJointSims });
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
