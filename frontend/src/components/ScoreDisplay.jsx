import React from 'react';

// Simple display component for pose scoring state
export default function ScoreDisplay({ state }) {
  if (!state) return null;
  const { index = 0, targets = [], lastSimilarity = 0, overall = 0, stepScores = [] } = state;
  const stepNum = targets.length ? Math.min(index + 1, targets.length) : 0;

  return (
    <div style={{ padding: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 6, width: 260 }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Step {stepNum} / {targets.length || 0}</div>
    <div style={{ fontSize: 12, marginTop: 6 }}>Current match: {Math.round((lastSimilarity || 0) * 100)}%</div>
  <div style={{ fontSize: 12 }}>Overall: {overall}%</div>
      <div style={{ fontSize: 12, marginTop: 6 }}>Completed: {stepScores.length} / {targets.length}</div>
      <div style={{ fontSize: 12, marginTop: 6, wordBreak: 'break-word' }}>Scores: {stepScores.length ? stepScores.join(', ') : '-'}</div>
    </div>
  );
}
