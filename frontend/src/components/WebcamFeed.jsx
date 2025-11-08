import React, { useEffect, useRef, useState } from 'react';
import usePoseDetection from '../hooks/usePoseDetection';
import ScoreDisplay from './ScoreDisplay';
import { perJointSimilarity, JOINT_NAMES, similarityToColor, perJointAngleSimilarity } from '../utils/poseUtil';

export default function WebcamFeed({ referenceSequence, stepTimes = null, autoSkipDefault, onStream, autoStart = false, withAudio = false, onStartRecording = null, onStopRecording = null, isRecording = false }) {
	const videoRef = useRef(null);
	const canvasRef = useRef(null);
		const [status, setStatus] = useState('idle'); // idle | requesting | ready | error
		const [errorMsg, setErrorMsg] = useState('');
		const [countdown, setCountdown] = useState(null);
		const [showReference, setShowReference] = useState(true);
		const [showLabels, setShowLabels] = useState(true);
		const [showLive, setShowLive] = useState(true);
		const [colorBySimilarity, setColorBySimilarity] = useState(true);

	const [autoSkip, setAutoSkip] = useState(typeof autoSkipDefault === 'number' ? autoSkipDefault : 5.0); // seconds to auto-skip if user doesn't match (0 = disabled)

	// update local autoSkip if the parent provides a default (e.g., generated from video step times)
	useEffect(() => {
		if (typeof autoSkipDefault === 'number' && !Number.isNaN(autoSkipDefault)) {
			setAutoSkip(autoSkipDefault);
		}
	}, [autoSkipDefault]);
	const disableAdvancement = Array.isArray(stepTimes) && stepTimes.length > 0;
	const { currentScore, currentStep, perStepScores, isRunning, start, stop, reset, nextStep, prevStep, goToStep } = usePoseDetection({
		videoRef,
		referenceSequence,
		threshold: 0.75,
		hold: 4,
		autoSkip,
		disableAdvancement,
	});

	// auto-stop recording when user reaches the final step
	const autoStopRef = useRef(false);
	const autoStopTimeoutRef = useRef(null);
	// step sync timer (advance reference step according to stepTimes)
	const stepTimerRef = useRef(null);
	const stepStartTimestampRef = useRef(null);

	// defensive length value for referenceSequence (avoid reading .length on null)
	const referenceLen = Array.isArray(referenceSequence) ? referenceSequence.length : 0;

	// compute overall dance accuracy as the mean of per-step best scores (0..100)
	const overallAccuracy = (perStepScores && perStepScores.length)
		? Math.round((perStepScores.reduce((a, b) => a + (b || 0), 0) / perStepScores.length) * 100)
		: 0;

// grade badge removed; grading UI is disabled for now

	useEffect(() => {
		return () => stop();
	}, [stop]);

	// when recording and the current step reaches the last reference, stop recording automatically
	useEffect(() => {
		if (!isRecording) {
			// reset auto-stop state when not recording
			autoStopRef.current = false;
			if (autoStopTimeoutRef.current) {
				clearTimeout(autoStopTimeoutRef.current);
				autoStopTimeoutRef.current = null;
			}
			return;
		}

		if (isRecording && Array.isArray(referenceSequence) && referenceSequence.length > 0) {
			const lastIndex = referenceSequence.length - 1;
			if (currentStep >= lastIndex && !autoStopRef.current) {
				// give a small grace period to capture the final frames
				autoStopRef.current = true;
				autoStopTimeoutRef.current = setTimeout(() => {
					if (typeof onStopRecording === 'function') {
						try { onStopRecording(); } catch (e) { console.error('auto onStopRecording failed', e); }
					}
					autoStopTimeoutRef.current = null;
				}, 500);
			}
		}
		// cleanup if referenceSequence changes or component unmounts
		return () => {
			if (autoStopTimeoutRef.current) {
				clearTimeout(autoStopTimeoutRef.current);
				autoStopTimeoutRef.current = null;
			}
		};
	}, [currentStep, referenceSequence, isRecording, onStopRecording]);


	// Sync reference progression to provided stepTimes while recording or when mimic started
	useEffect(() => {
		// clear any existing timer when stepTimes changes
		if (stepTimerRef.current) {
			clearInterval(stepTimerRef.current);
			stepTimerRef.current = null;
			stepStartTimestampRef.current = null;
		}

		if (!Array.isArray(stepTimes) || stepTimes.length === 0) return;

		// Start syncing when recording starts (or when camera autoStart triggers and hook is running)
		const startSync = () => {
			if (stepTimerRef.current) return;
			stepStartTimestampRef.current = Date.now();
			stepTimerRef.current = setInterval(() => {
				const elapsed = (Date.now() - stepStartTimestampRef.current) / 1000;
				// find latest step index where stepTimes[idx] <= elapsed
				let idx = 0;
				for (let i = 0; i < stepTimes.length; i++) {
					if ((stepTimes[i] || 0) <= elapsed) idx = i;
					else break;
				}
				if (typeof goToStep === 'function') {
					goToStep(idx);
				}
				// if reached final step, stop the timer (autoStop handles stopping recording)
				if (idx >= stepTimes.length - 1) {
					// clear interval but leave auto-stop to stop recording
					if (stepTimerRef.current) {
						clearInterval(stepTimerRef.current);
						stepTimerRef.current = null;
					}
				}
			}, 100);
		};

		// start sync when recording starts or if pose detection is already running
		if (isRecording) startSync();

		// also start if pose detection starts (isRunning becomes true) and autoStart was requested
		// watch isRunning to start sync if recording started later
		if (!isRecording && isRunning) startSync();

		return () => {
			if (stepTimerRef.current) {
				clearInterval(stepTimerRef.current);
				stepTimerRef.current = null;
			}
			stepStartTimestampRef.current = null;
		};
	}, [stepTimes, isRecording, isRunning, goToStep]);

	async function performEnable() {
		if (!videoRef.current) return;
		setStatus('requesting');
		setErrorMsg('');
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: withAudio });
			// show the raw stream immediately so user sees themselves even if MediaPipe hasn't started
			videoRef.current.srcObject = stream;
			// if parent wants the stream (e.g., to record) provide it
			if (typeof onStream === 'function') {
				onStream(stream);
			}
			videoRef.current.play().catch(() => {});
			setStatus('ready');
			// start pose detection hook which uses MediaPipe Camera under the hood
			try {
				start();
			} catch (e) {
				// fallback: still OK because video shows raw stream
				console.warn('Failed to start pose hook:', e);
			}
		} catch (err) {
			console.error('Camera permission / start error', err);
			setStatus('error');
			setErrorMsg(err?.message || String(err));
		}
	}

	async function runCountdownThen(action) {
		// avoid double-running
		if (countdown) return;
		setCountdown(3);
		for (let i = 3; i > 0; i--) {
			setCountdown(i);
			// eslint-disable-next-line no-await-in-loop
			await new Promise((r) => setTimeout(r, 1000));
		}
		setCountdown(null);
		try {
			await action();
		} catch (e) {
			console.error('Action after countdown failed', e);
		}
	}

	// if autoStart is requested, enable camera on mount (with countdown)
	useEffect(() => {
		if (autoStart) runCountdownThen(performEnable);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoStart]);

		// Drawing overlay: landmarks and skeleton
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

				// helper to draw landmarks
						const connections = [
							// torso
							[11, 12], [11, 23], [12, 24], [23, 24],
							// left arm
							[11, 13], [13, 15],
							// right arm
							[12, 14], [14, 16],
							// left leg
							[23, 25], [25, 27],
							// right leg
							[24, 26], [26, 28],
							// shoulders to hips
							[11, 12]
						];

						const drawLandmarks = (landmarks, opts = {}) => {
							const { defaultColor = 'cyan', perJointColors = null, labels = true } = opts;
							if (!Array.isArray(landmarks) || landmarks.length === 0) return;
							ctx.lineWidth = 2;

							// draw connections with averaged color
							for (const [a, b] of connections) {
								const A = landmarks[a];
								const B = landmarks[b];
								if (!A || !B) continue;
								const x1 = A.x * canvas.width;
								const y1 = A.y * canvas.height;
								const x2 = B.x * canvas.width;
								const y2 = B.y * canvas.height;
								// color for segment: average of endpoint colors
								let stroke = defaultColor;
								if (perJointColors && perJointColors[a] && perJointColors[b]) {
									// blend colors by averaging HSL by converting via canvas
									stroke = perJointColors[a];
								}
								ctx.strokeStyle = stroke;
								ctx.beginPath();
								ctx.moveTo(x1, y1);
								ctx.lineTo(x2, y2);
								ctx.stroke();
							}

							// draw circles and labels
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

				// draw live landmarks in greenish
						try {
							const live = window && window.__currentPoseForCanvas ? window.__currentPoseForCanvas : null;
							if (showLive && live) {
								drawLandmarks(live, { defaultColor: 'lime', perJointColors: null, labels: showLabels });
							}
						} catch (e) {
							// ignore
						}

				// draw reference target in cyan
				const target = referenceLen > 0 ? referenceSequence[Math.min(currentStep, referenceLen - 1)] : null;
						if (target && showReference) {
							let perColors = null;
							try {
								const live = window && window.__currentPoseForCanvas ? window.__currentPoseForCanvas : null;
											if (colorBySimilarity && live) {
												// use angle-based per-joint similarity when available
												const sims = perJointAngleSimilarity(live, target, { angleTolerance: 35, distTolerance: 0.75, visibilityThreshold: 0.2 });
												perColors = sims.map(s => similarityToColor(s));
											}
							} catch (e) {
								perColors = null;
							}
							drawLandmarks(target, { defaultColor: 'cyan', perJointColors: perColors, labels: showLabels });
						}

				raf = requestAnimationFrame(draw);
			}

			raf = requestAnimationFrame(draw);

			return () => {
				if (raf) cancelAnimationFrame(raf);
			};
		}, [referenceSequence, currentStep, isRunning, videoRef.current, canvasRef.current]);

		// keep a global cache of the latest pose for the canvas draw loop (avoid re-rendering heavy)
		useEffect(() => {
			window.__currentPoseForCanvas = null;
			return () => { window.__currentPoseForCanvas = null; };
		}, []);

		// update global pose when currentPose changes (hook already keeps it)
		useEffect(() => {
			// piggyback on the pose hook which sets a global on each frame if available
			// the hook doesn't expose currentPose here; we rely on the hook to set window.__currentPoseForCanvas
		}, []);

	return (
			<div>
				<div style={{ position: 'relative', width: 640, height: 480, background: '#000' }}>
					<video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
					<canvas ref={canvasRef} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} />
					{countdown && (
						<div style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
							<div style={{ fontSize: 96, fontWeight: 800, color: 'white', textShadow: '0 2px 6px rgba(0,0,0,0.8)' }}>{countdown}</div>
						</div>
					)}
					{/* grade badge overlay removed (rendered beside Reset button instead) */}
				</div>

					<div style={{ marginTop: 8 }}>
						{/* Unified enable + record button. If not recording, show a single button that will run the countdown, enable camera if needed, then call parent start-recording handler. */}
						{!isRecording ? (
							<button
								onClick={async () => {
								if (referenceLen === 0) return; // disabled guard
								await runCountdownThen(async () => {
									if (status !== 'ready') {
										await performEnable();
									}
									if (typeof onStartRecording === 'function') {
										try { await onStartRecording(); } catch (e) { console.error('onStartRecording failed', e); }
									}
								});
								}
							}
								disabled={!!countdown || referenceLen === 0}
							>
								{status !== 'ready' ? 'Enable & Start Recording' : 'Start Recording'}
							</button>
						) : (
							<button style={{ marginLeft: 8 }} onClick={() => { if (typeof onStopRecording === 'function') onStopRecording(); }}>Stop Recording</button>
						)}

						<button onClick={() => runCountdownThen(async () => { reset(); })} style={{ marginLeft: 8 }} disabled={!!countdown || referenceLen === 0}>Reset</button>

						{referenceLen === 0 && (
							<div style={{ marginTop: 8, color: '#bbb', fontSize: 13 }}>Generate steps on the challenge page to enable camera controls.</div>
						)}
					</div>

					<div style={{ marginTop: 8 }}>
						<label style={{ marginRight: 12 }}><input type="checkbox" checked={showLive} onChange={(e) => setShowLive(e.target.checked)} /> Show live</label>
						<label style={{ marginRight: 12 }}><input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} /> Show reference</label>
						<label style={{ marginRight: 12 }}><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Show labels</label>
						<label style={{ marginRight: 12 }}><input type="checkbox" checked={colorBySimilarity} onChange={(e) => setColorBySimilarity(e.target.checked)} /> Color by similarity</label>
					</div>

					<div style={{ marginTop: 8 }}>
						<ScoreDisplay state={{ lastSimilarity: currentScore / 100, overall: overallAccuracy, stepScores: perStepScores.map(s => Math.round(s * 100)), index: currentStep, targets: referenceSequence }} />
						{referenceLen > 0 && (
							<div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, display: 'inline-block' }}>
								<div style={{ fontSize: 12, color: '#ddd' }}>Overall dance accuracy</div>
								<div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{overallAccuracy}%</div>
							</div>
						)}

						{/* auto-skip slider */}
						<div style={{ marginTop: 8, marginLeft: 12 }}>
							<label style={{ color: '#ddd', marginRight: 10 }}>Auto-skip after: {autoSkip > 0 ? `${autoSkip.toFixed(1)}s` : 'disabled'}</label>
							<input type="range" min="0" max="15" step="0.5" value={autoSkip} onChange={(e) => setAutoSkip(Number(e.target.value))} />
						</div>
						{/* simple step progress */}
						<div style={{ marginTop: 8 }}>
							<strong>Step:</strong> {Math.min(currentStep + 1, referenceLen)} / {referenceLen}
							<div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
								<div style={{ width: `${((currentStep + (currentScore/100)) / Math.max(1, referenceLen)) * 100}%`, height: '100%', background: '#4caf50' }} />
							</div>
							{perStepScores && perStepScores.length > 0 && (
								<div style={{ marginTop: 8, fontSize: 13 }}>
									<strong>Per-step scores:</strong>
									<ul>
										{perStepScores.map((s, i) => (
											<li key={i}>Step {i + 1}: {Math.round(s * 100)}%</li>
										))}
									</ul>
									<div style={{ marginTop: 6 }}>
										<button onClick={prevStep} style={{ marginRight: 8 }}>Prev Step</button>
										<button onClick={nextStep}>Next Step</button>
									</div>
								</div>
							)}
						</div>
					</div>

			<div style={{ marginTop: 8, color: status === 'error' ? 'red' : '#444' }}>
				<strong>Status:</strong> {status}
				{errorMsg && <div style={{ marginTop: 4 }}>Error: {errorMsg}</div>}
			</div>
		</div>
	);
}


