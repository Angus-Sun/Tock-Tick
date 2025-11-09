import { Pose } from '@mediapipe/pose';
import { landmarksToArray, normalizeLandmarks } from './poseUtil';

// Process a video File into a reference sequence of landmarks (one representative frame per detected step)
// Returns { referenceSequence: [landmarks], stepTimes: [seconds], suggestedAutoSkip }
export async function processVideoFile(file, { sampleFps = 15, smoothWindow = 5, motionThresholdFactor = 0.6, fixedIntervalSeconds = 0 } = {}) {
  if (!file) throw new Error('no file');

  // create hidden video element
  const video = document.createElement('video');
  video.muted = true;
  video.src = URL.createObjectURL(file);
  video.crossOrigin = 'anonymous';

  await new Promise((res, rej) => {
    video.addEventListener('loadedmetadata', () => res());
    video.addEventListener('error', (e) => rej(e));
  });

  // set up MediaPipe Pose
  const pose = new Pose({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
  pose.setOptions({ modelComplexity: 1, smoothLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

  const frames = [];

  pose.onResults((results) => {
    const lm = results.poseLandmarks || [];
    frames.push({ time: video.currentTime, landmarks: lm });
  });

  // play and sample frames at sampleFps
  const sampleMs = Math.round(1000 / sampleFps);

  video.play().catch(() => {});

  await new Promise((resolve) => {
    const iv = setInterval(async () => {
      if (video.ended) {
        clearInterval(iv);
        resolve();
        return;
      }
      try {
        await pose.send({ image: video });
      } catch (e) {
        // ignore
      }
    }, sampleMs);
  });

  // close pose
  try { pose.close(); } catch (e) {}

  // if not enough frames, fallback
  if (!frames.length) return { referenceSequence: [], stepTimes: [], suggestedAutoSkip: 0 };

  // If the caller requested fixed-interval sampling (e.g. every 0.25s), choose frames nearest to those times
  if (fixedIntervalSeconds && fixedIntervalSeconds > 0) {
    // Prefer the video's declared duration when available; fallback to last sampled time
    const duration = (video.duration && !isNaN(video.duration) && video.duration > 0) ? video.duration : (frames[frames.length - 1].time || 0);
    if (duration <= 0) return { referenceSequence: [], stepTimes: [], suggestedAutoSkip: 0 };
    const times = [];
    for (let t = 0; t <= duration + 1e-6; t += fixedIntervalSeconds) times.push(t);

    const stepIndices = times.map((target) => {
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < frames.length; i++) {
        const d = Math.abs((frames[i].time || 0) - target);
        if (d < bestDiff) {
          bestDiff = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    });

    // If many targets map to the same frame (common when frames have missing/constant times),
    // dedupe while preserving order. If deduplication yields only one index but multiple
    // frames exist, fall back to evenly spaced frame selection to get multiple steps.
    const uniqueIndices = stepIndices.reduce((acc, cur) => {
      if (!acc.length || acc[acc.length - 1] !== cur) acc.push(cur);
      return acc;
    }, []);

    let finalIndices = uniqueIndices;
    if (finalIndices.length <= 1 && frames.length > 1) {
      // pick N frames evenly spaced based on duration and desired interval
      const approxCount = Math.max(1, Math.round(duration / fixedIntervalSeconds));
      const step = Math.max(1, Math.floor(frames.length / Math.max(1, approxCount)));
      finalIndices = [];
      for (let i = 0; i < frames.length; i += step) finalIndices.push(i);
      // ensure last frame included
      if (finalIndices[finalIndices.length - 1] !== frames.length - 1) finalIndices.push(frames.length - 1);
    }

    // build referenceSequence and times
    const referenceSequence = finalIndices.map(i => frames[i].landmarks || []);
    const stepTimes = finalIndices.map(i => frames[i].time || 0);
    const suggestedAutoSkip = fixedIntervalSeconds;
    try { URL.revokeObjectURL(video.src); } catch (e) {}
    return { referenceSequence, stepTimes, suggestedAutoSkip };
  }

  // compute motion between consecutive frames using normalized landmarks
  const normFrames = frames.map(f => normalizeLandmarks(landmarksToArray(f.landmarks)));
  const motions = [0];
  for (let i = 1; i < normFrames.length; i++) {
    const a = normFrames[i - 1];
    const b = normFrames[i];
    if (!a || !b || a.length !== b.length) { motions.push(0); continue; }
    let sum = 0;
    for (let j = 0; j < a.length; j++) {
      const dx = a[j][0] - b[j][0];
      const dy = a[j][1] - b[j][1];
      const dz = (a[j][2] || 0) - (b[j][2] || 0);
      sum += Math.hypot(dx, dy, dz);
    }
    motions.push(sum / a.length);
  }

  // smooth motions
  const smooth = [];
  for (let i = 0; i < motions.length; i++) {
    let s = 0, cnt = 0;
    for (let k = i - Math.floor(smoothWindow/2); k <= i + Math.floor(smoothWindow/2); k++) {
      if (k >= 0 && k < motions.length) { s += motions[k]; cnt++; }
    }
    smooth.push(s / Math.max(1, cnt));
  }

  // threshold for low motion (static pose candidates)
  const meanMotion = smooth.reduce((a,b)=>a+b,0) / smooth.length;
  const thresh = meanMotion * motionThresholdFactor;

  // find local minima below threshold
  const minima = [];
  for (let i = 1; i < smooth.length - 1; i++) {
    if (smooth[i] <= smooth[i-1] && smooth[i] <= smooth[i+1] && smooth[i] <= thresh) minima.push(i);
  }

  // ensure minima are separated by at least sampleFps*0.4 frames (~0.4s)
  const minSep = Math.max(1, Math.round(sampleFps * 0.4));
  const filtered = [];
  for (const idx of minima) {
    if (!filtered.length || idx - filtered[filtered.length-1] >= minSep) filtered.push(idx);
  }

  // if no minima found, fallback: attempt to sample still frames by finding lowest motion frames every ~1s
  let stepIndices = filtered;
  if (!stepIndices.length) {
    const approxStepFrames = Math.max(1, Math.round(frames.length / Math.max(1, Math.round((frames[frames.length-1].time) / 1.0))));
    // choose frames with lowest motion in sliding windows
    for (let t = 0; t < frames.length; t += Math.round(sampleFps)) {
      let best = t; let bestVal = smooth[t] || 1e9;
      for (let k = t; k < Math.min(frames.length, t + Math.round(sampleFps)); k++) {
        if ((smooth[k]||0) < bestVal) { bestVal = smooth[k]; best = k; }
      }
      stepIndices.push(best);
    }
  }

  // build referenceSequence using the frames at stepIndices
  const referenceSequence = stepIndices.map(i => frames[i].landmarks || []);
  const stepTimes = stepIndices.map(i => frames[i].time || 0);

  // suggested auto-skip: median inter-step interval
  const intervals = [];
  for (let i = 1; i < stepTimes.length; i++) intervals.push(stepTimes[i] - stepTimes[i-1]);
  const suggestedAutoSkip = intervals.length ? intervals.sort((a,b)=>a-b)[Math.floor(intervals.length/2)] : 0;

  // cleanup
  try { URL.revokeObjectURL(video.src); } catch (e) {}

  return { referenceSequence, stepTimes, suggestedAutoSkip };
}

export default processVideoFile;