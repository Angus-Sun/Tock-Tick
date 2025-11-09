// Minimal pose utilities: normalize landmarks and compute a baseline similarity score.
// Works with MediaPipe Pose landmarks: array of {x,y,z,visibility} (length 33)

export function landmarksToArray(landmarks = []) {
	return (landmarks || []).map((l) => [l.x ?? 0, l.y ?? 0, l.z ?? 0]);
}

export function normalizeLandmarks(arr = []) {
	// Center on hip midpoint and scale by shoulder-hip distance to be scale invariant.
	if (!arr || arr.length === 0) return [];
	const LEFT_HIP = 23;
	const RIGHT_HIP = 24;
	const LEFT_SHOULDER = 11;
	const RIGHT_SHOULDER = 12;
	const hip = [
		(arr[LEFT_HIP][0] + arr[RIGHT_HIP][0]) / 2,
		(arr[LEFT_HIP][1] + arr[RIGHT_HIP][1]) / 2,
		(arr[LEFT_HIP][2] + arr[RIGHT_HIP][2]) / 2,
	];
	const shoulder = [
		(arr[LEFT_SHOULDER][0] + arr[RIGHT_SHOULDER][0]) / 2,
		(arr[LEFT_SHOULDER][1] + arr[RIGHT_SHOULDER][1]) / 2,
		(arr[LEFT_SHOULDER][2] + arr[RIGHT_SHOULDER][2]) / 2,
	];
	const scale = Math.hypot(
		shoulder[0] - hip[0],
		shoulder[1] - hip[1],
		shoulder[2] - hip[2]
	) || 1e-6;

	return arr.map((p) => [(p[0] - hip[0]) / scale, (p[1] - hip[1]) / scale, (p[2] - hip[2]) / scale]);
}

function flatten(arr) {
	return arr.reduce((acc, a) => acc.concat(a), []);
}

export function cosineSimilarity(vecA = [], vecB = []) {
	let dot = 0, na = 0, nb = 0;
	for (let i = 0; i < vecA.length; i++) {
		const a = vecA[i] || 0;
		const b = vecB[i] || 0;
		dot += a * b;
		na += a * a;
		nb += b * b;
	}
	return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

export function poseSimilarity(landmarksA = [], landmarksB = []) {
	// Returns similarity in [0,1] (1 = identical)
	if (!landmarksA || !landmarksB) return 0;
	const a = normalizeLandmarks(landmarksToArray(landmarksA));
	const b = normalizeLandmarks(landmarksToArray(landmarksB));
	if (a.length === 0 || a.length !== b.length) return 0;
	const flatA = flatten(a);
	const flatB = flatten(b);
	// cosine in [-1,1] -> map to [0,1]
	return (cosineSimilarity(flatA, flatB) + 1) / 2;
}

export const JOINT_NAMES = [
	'nose','left_eye_inner','left_eye','left_eye_outer','right_eye_inner','right_eye','right_eye_outer',
	'left_ear','right_ear','mouth_left','mouth_right','left_shoulder','right_shoulder','left_elbow','right_elbow',
	'left_wrist','right_wrist','left_pinky','right_pinky','left_index','right_index','left_thumb','right_thumb',
	'left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle','left_heel','right_heel','left_foot_index','right_foot_index'
];

export function perJointSimilarity(landmarksA = [], landmarksB = [], opts = {}) {
	// returns array of similarity scores [0..1] per landmark index
	const tol = opts.tolerance || 0.6; // normalized distance that maps to zero similarity
	if (!landmarksA || !landmarksB) return [];
	const a = normalizeLandmarks(landmarksToArray(landmarksA));
	const b = normalizeLandmarks(landmarksToArray(landmarksB));
	if (!a.length || a.length !== b.length) return [];
	const sims = [];
	for (let i = 0; i < a.length; i++) {
		const ax = a[i][0], ay = a[i][1], az = a[i][2];
		const bx = b[i][0], by = b[i][1], bz = b[i][2];
		const dx = ax - bx, dy = ay - by, dz = az - bz;
		const dist = Math.hypot(dx, dy, dz);
		const s = Math.min(1, Math.max(0, 1 - dist / tol));
		sims.push(s);
	}
	return sims;
}

export function similarityToColor(sim) {
	// sim in [0,1] -> green (1) to red (0)
	const h = Math.round(120 * sim); // 0 (red) -> 120 (green)
	return `hsl(${h}, 80%, 45%)`;
}

// Angle-based scoring utilities
function angleBetweenPoints(a, b, c) {
	if (!a || !b || !c) return null;
	const ABx = a[0] - b[0];
	const ABy = a[1] - b[1];
	const CBx = c[0] - b[0];
	const CBy = c[1] - b[1];
	const dot = ABx * CBx + ABy * CBy;
	const mag1 = Math.hypot(ABx, ABy);
	const mag2 = Math.hypot(CBx, CBy);
	if (mag1 === 0 || mag2 === 0) return null;
	let cos = dot / (mag1 * mag2);
	cos = Math.min(1, Math.max(-1, cos));
	return (Math.acos(cos) * 180) / Math.PI; // degrees
}

export function poseToAngles(landmarks = []) {
	if (!Array.isArray(landmarks) || landmarks.length === 0) return {};
	const arr = landmarksToArray(landmarks);
	const get = (i) => arr[i] || null;
	const L_SHOULDER = 11, R_SHOULDER = 12, L_ELBOW = 13, R_ELBOW = 14, L_WRIST = 15, R_WRIST = 16;
	const L_HIP = 23, R_HIP = 24, L_KNEE = 25, R_KNEE = 26, L_ANKLE = 27, R_ANKLE = 28;
	return {
		left_knee: angleBetweenPoints(get(L_HIP), get(L_KNEE), get(L_ANKLE)),
		right_knee: angleBetweenPoints(get(R_HIP), get(R_KNEE), get(R_ANKLE)),
		left_hip: angleBetweenPoints(get(L_SHOULDER), get(L_HIP), get(L_KNEE)),
		right_hip: angleBetweenPoints(get(R_SHOULDER), get(R_HIP), get(R_KNEE)),
		left_elbow: angleBetweenPoints(get(L_SHOULDER), get(L_ELBOW), get(L_WRIST)),
		right_elbow: angleBetweenPoints(get(R_SHOULDER), get(R_ELBOW), get(R_WRIST)),
		left_shoulder: angleBetweenPoints(get(L_ELBOW), get(L_SHOULDER), get(L_HIP)),
		right_shoulder: angleBetweenPoints(get(R_ELBOW), get(R_SHOULDER), get(R_HIP)),
	};
}

export function angleSimilarity(a, b, tolerance = 25) {
	if (a == null || b == null) return 0;
	const d = Math.abs(a - b);
	return Math.max(0, 1 - d / tolerance);
}

export function perJointAngleSimilarity(landmarksA = [], landmarksB = [], opts = {}) {
	// returns array of similarity scores [0..1] per landmark index using angle matches for key joints
	if (!landmarksA || !landmarksB) return [];
	const angleTol = opts.angleTolerance || 25; // degrees
	const distTol = opts.distTolerance || 0.6; // normalized distance
	const visThreshold = typeof opts.visibilityThreshold === 'number' ? opts.visibilityThreshold : 0.25;
	const anglesA = poseToAngles(landmarksA);
	const anglesB = poseToAngles(landmarksB);
	const mapping = {
		left_knee: 25,
		right_knee: 26,
		left_hip: 23,
		right_hip: 24,
		left_elbow: 13,
		right_elbow: 14,
		left_shoulder: 11,
		right_shoulder: 12,
	};
	const sims = new Array(landmarksA.length).fill(null);

	// assign angle-based sims with visibility check
	for (const key of Object.keys(mapping)) {
		const idx = mapping[key];
		const vA = (landmarksA[idx] && typeof landmarksA[idx].visibility === 'number') ? landmarksA[idx].visibility : 1;
		const vB = (landmarksB[idx] && typeof landmarksB[idx].visibility === 'number') ? landmarksB[idx].visibility : 1;
		// compute raw angle similarity
		const simRaw = angleSimilarity(anglesA[key], anglesB[key], angleTol);
		// visibility factor: scale similarity instead of zeroing when below threshold
		const visAvg = (vA + vB) / 2;
		let visFactor = 1;
		if (visAvg < visThreshold) {
			// scale down but keep a conservative floor so occlusion doesn't zero the joint
			visFactor = Math.max(0.5, visAvg / Math.max(1e-6, visThreshold));
		}
		const sim = Math.max(0.2, Math.min(1, simRaw * visFactor));
		sims[idx] = sim;
	}

	// distance-based fallback for other joints
	const normA = normalizeLandmarks(landmarksToArray(landmarksA));
	const normB = normalizeLandmarks(landmarksToArray(landmarksB));
	for (let i = 0; i < sims.length; i++) {
		if (sims[i] == null) {
			const a = normA[i];
			const b = normB[i];
			if (!a || !b) { sims[i] = 0.2; continue; }
			const vA = (landmarksA[i] && typeof landmarksA[i].visibility === 'number') ? landmarksA[i].visibility : 1;
			const vB = (landmarksB[i] && typeof landmarksB[i].visibility === 'number') ? landmarksB[i].visibility : 1;
			if (vA < visThreshold || vB < visThreshold) {
				// low visibility: compute fallback but scale similarly to angle joints
				const dx = a[0] - b[0], dy = a[1] - b[1], dz = (a[2] || 0) - (b[2] || 0);
				const dist = Math.hypot(dx, dy, dz);
				const fallback = Math.max(0, Math.min(1, 1 - dist / distTol));
				const visAvg = (vA + vB) / 2;
				const visFactor = Math.max(0.5, visAvg / Math.max(1e-6, visThreshold));
				sims[i] = Math.max(0.2, fallback * visFactor);
				continue;
			}
			const dx = a[0] - b[0], dy = a[1] - b[1], dz = (a[2] || 0) - (b[2] || 0);
			const dist = Math.hypot(dx, dy, dz);
			sims[i] = Math.max(0, Math.min(1, 1 - dist / distTol));
		}
	}
	return sims;
}

// measure shoulder spread (distance between left and right shoulder) after normalization
export function shoulderSpreadSimilarity(landmarksA = [], landmarksB = [], tol = 0.8) {
	if (!landmarksA || !landmarksB) return 0;
	const arrA = normalizeLandmarks(landmarksToArray(landmarksA));
	const arrB = normalizeLandmarks(landmarksToArray(landmarksB));
	if (!arrA.length || !arrB.length) return 0;
	const L_SHOULDER = 11, R_SHOULDER = 12;
	const aL = arrA[L_SHOULDER];
	const aR = arrA[R_SHOULDER];
	const bL = arrB[L_SHOULDER];
	const bR = arrB[R_SHOULDER];
	if (!aL || !aR || !bL || !bR) return 0;
	const dA = Math.hypot(aL[0] - aR[0], aL[1] - aR[1]);
	const dB = Math.hypot(bL[0] - bR[0], bL[1] - bR[1]);
	const diff = Math.abs(dA - dB);
	return Math.max(0, Math.min(1, 1 - diff / tol));
}

export default {
	landmarksToArray,
	normalizeLandmarks,
	poseSimilarity,
	cosineSimilarity,
	perJointSimilarity,
	similarityToColor,
	JOINT_NAMES,
	poseToAngles,
	angleSimilarity,
	perJointAngleSimilarity,
};
