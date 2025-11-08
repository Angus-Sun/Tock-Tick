import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import VideoSyncedFeed from '../components/VideoSyncedFeed';

export default function VideoPracticePage() {
  const [referenceVideo, setReferenceVideo] = useState(null);
  const [videoName, setVideoName] = useState('');
  const navigate = useNavigate();

  const onVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoName(file.name);
    setReferenceVideo(URL.createObjectURL(file));
  };

  return (
    <div>
      <h1>Practice Dance</h1>

      {!referenceVideo ? (
        <div style={{ marginBottom: 24, padding: 24, background: '#f5f5f5', borderRadius: 8 }}>
          <h3>Upload a dance video to practice</h3>
          <input
            type="file"
            accept="video/*"
            onChange={onVideoUpload}
            style={{ marginTop: 12 }}
          />
          <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
            Choose a video file of the dance you want to practice. The system will analyze the video and help you match the poses.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 12 }}>
            <h3>Practicing: {videoName}</h3>
            <button onClick={() => setReferenceVideo(null)} style={{ marginRight: 8 }}>
              Choose different video
            </button>
          </div>
          <VideoSyncedFeed referenceVideo={referenceVideo} />
        </div>
      )}
    </div>
  );
}