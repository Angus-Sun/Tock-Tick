import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { v4 as uuidv4 } from "uuid";
import Leaderboard from "../components/Leaderboard";
import WebcamFeed from "../components/WebcamFeed";
import processVideoFile from "../utils/videoToReference";

// Simple error boundary class to catch render-time errors and show a helpful UI
import React from "react";

class ErrorBoundary extends React.Component {
	constructor(props) {
		super(props);
		this.state = { hasError: false, error: null };
	}
	static getDerivedStateFromError(error) {
		return { hasError: true, error };
	}
	componentDidCatch(error, info) {
		console.error('ErrorBoundary caught', error, info);
	}
	render() {
		if (this.state.hasError) {
			return (
				<div style={{ padding: 20, color: 'white', background: '#7f1d1d' }}>
					<h3>Something went wrong rendering this page</h3>
					<pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
				</div>
			);
		}
		return this.props.children;
	}
}

export default function ChallengePage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const [challenge, setChallenge] = useState(null);
	const [uploading, setUploading] = useState(false);
	const [recording, setRecording] = useState(false);
	const [recordedBlob, setRecordedBlob] = useState(null);
	// page-level countdown removed: webcam now shows a unified 3s countdown
		const [generating, setGenerating] = useState(false);
		const [generateError, setGenerateError] = useState(null);
		const [generatedReference, setGeneratedReference] = useState(null);
		const [generatedStepTimes, setGeneratedStepTimes] = useState(null);
		const [suggestedAutoSkip, setSuggestedAutoSkip] = useState(null);
		const [mimicStarted, setMimicStarted] = useState(false);

		// streamRef will hold the MediaStream provided by WebcamFeed so we can record it
		const streamRef = useRef(null);
	const challengeVideoRef = useRef(null);
	const mediaRecorderRef = useRef(null);
	const chunksRef = useRef([]);
			const [pageError, setPageError] = useState(null);

			useEffect(() => {
				(async () => {
					try {
						await fetchChallenge();
					} catch (err) {
						console.error('fetchChallenge error', err);
						setPageError(err?.message || String(err));
					}
				})();
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);

	const fetchChallenge = async () => {
			try {
				const { data, error } = await supabase
					.from("challenges")
					.select("*")
					.eq("id", id)
					.single();
				if (error) {
					console.error('supabase fetch error', error);
					throw error;
				}
				setChallenge(data);
			} catch (err) {
				console.error('fetchChallenge failed', err);
				throw err;
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

		// directly begin recording (WebcamFeed handles the shared visual countdown)
		await beginRecording();
	};

	const beginRecording = async () => {
		try {
			chunksRef.current = [];
			const stream = streamRef.current;
			if (!stream) return alert("Camera not available");

			if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") return;

			const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
			mediaRecorderRef.current = recorder;

			recorder.ondataavailable = (e) => {
				if (e.data && e.data.size) chunksRef.current.push(e.data);
			};

			recorder.onstop = () => {
				const blob = new Blob(chunksRef.current, { type: "video/webm" });
				setRecordedBlob(blob);
				setRecording(false);
			};

			recorder.start();
			setRecording(true);
		} catch (err) {
			console.error(err);
			alert("Recording failed.");
		}
	};

	const stopRecording = () => {
		if (mediaRecorderRef.current?.state === "recording") {
			mediaRecorderRef.current.stop();
		}
	};

	const handleUploadMimic = async () => {
		if (!recordedBlob) return alert("No recording to upload");

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
		else alert("Mimic uploaded!");

		setUploading(false);
	};

	const handleGenerateSteps = async (intervalSeconds = 0.5) => {
		if (!challenge || !challenge.video_url) return alert('No video available to generate from');
		setGenerateError(null);
		setGenerating(true);
		try {
			// fetch the video as a blob
			const res = await fetch(challenge.video_url);
			if (!res.ok) throw new Error('Failed to fetch video: ' + res.statusText);
			const blob = await res.blob();
			// convert to File so processVideoFile can use URL.createObjectURL semantics
			const file = new File([blob], 'challenge.mp4', { type: blob.type || 'video/mp4' });
			const result = await processVideoFile(file, { fixedIntervalSeconds: intervalSeconds });
			// keep generated reference on this page and show joints
			setGeneratedReference(result.referenceSequence || []);
			setGeneratedStepTimes(result.stepTimes || []);
			setSuggestedAutoSkip(result.suggestedAutoSkip || intervalSeconds);
			// don't auto-start mimic; allow user to click Start Mimic Dance
			setMimicStarted(false);
		} catch (err) {
			console.error('generate steps failed', err);
			setGenerateError(err?.message || String(err));
		} finally {
			setGenerating(false);
		}
	};

		if (pageError) {
			return (
				<div style={{ padding: 20 }}>
					<h2>Error loading challenge</h2>
					<pre style={{ color: 'crimson' }}>{String(pageError)}</pre>
				</div>
			);
		}

		if (!challenge) return <p>Loading...</p>;

			return (
				<ErrorBoundary>
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

					{/* Generate reference steps from the challenge video */}
					<div style={{ marginTop: 12 }}>
						<button className="btn" onClick={() => handleGenerateSteps(0.5)} disabled={generating}>
							{generating ? 'Generating...' : 'Generate Steps (0.5s)'}
						</button>
						{generating && (
							<div style={{ marginTop: 8, color: '#ddd' }}>Processing video — this can take 20–60s depending on length.</div>
						)}
						{generateError && (
							<div style={{ marginTop: 8, color: 'crimson' }}>Error: {generateError}</div>
						)}
					</div>
				</div>

						<div className="pane__right">
							<p className="pane__label">📹 Your Mimic</p>

							<div className="video-container">
											{/* WebcamFeed handles camera access and draws joint tracker overlay. We pass onStream so we can record the same MediaStream. */}
											<WebcamFeed
												referenceSequence={generatedReference || null}
												stepTimes={generatedStepTimes || null}
												autoStart={mimicStarted}
												autoSkipDefault={suggestedAutoSkip}
												withAudio={true}
												onStream={(s) => { streamRef.current = s; }}
												onStartRecording={startRecordingProcess}
												onStopRecording={stopRecording}
												isRecording={recording}
											/>
							</div>

					{/* Recording controls moved into WebcamFeed */}

					{/* Start mimic dance to generated reference */}
					{generatedReference && generatedReference.length > 0 && (
						<div style={{ marginTop: 8 }}>
							<button className="btn" onClick={() => setMimicStarted(true)} disabled={mimicStarted}>
								{mimicStarted ? 'Mimic running' : 'Start Mimic Dance'}
							</button>
							<button style={{ marginLeft: 8 }} className="btn" onClick={() => { setMimicStarted(false); setGeneratedReference(null); setGeneratedStepTimes(null); setSuggestedAutoSkip(null); }}>
								Clear Generated
							</button>
							<div style={{ marginTop: 6, fontSize: 13 }}>Generated steps: {generatedStepTimes ? generatedStepTimes.length : generatedReference.length}</div>
						</div>
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
			</ErrorBoundary>
		);
}

