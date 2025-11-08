import React, { useEffect, useRef, useState } from 'react';

const VideoFeed = ({ onVideoRecorded }) => {
    const videoRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const [recording, setRecording] = useState(false);
    const [videoChunks, setVideoChunks] = useState([]);

    useEffect(() => {
        const getMedia = async () => {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            videoRef.current.srcObject = stream;
            mediaRecorderRef.current = new MediaRecorder(stream);

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    setVideoChunks((prev) => [...prev, event.data]);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const videoBlob = new Blob(videoChunks, { type: 'video/webm' });
                onVideoRecorded(videoBlob);
                setVideoChunks([]);
            };
        };

        getMedia();

        return () => {
            if (mediaRecorderRef.current) {
                mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [onVideoRecorded, videoChunks]);

    const startRecording = () => {
        setRecording(true);
        mediaRecorderRef.current.start();
    };

    const stopRecording = () => {
        setRecording(false);
        mediaRecorderRef.current.stop();
    };

    return (
        <div className="video-container">
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: 'auto' }} />
            <button onClick={startRecording} disabled={recording}>Start Recording</button>
            <button onClick={() => { mediaRecorderRef.current.stop(); setRecording(false); }}>Stop Recording</button>
        </div>
    );
};

export default VideoFeed;