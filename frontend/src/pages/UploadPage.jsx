import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient.js";
import { v4 as uuidv4 } from "uuid";
import { FaVideo } from "react-icons/fa"; // Video icon from React Icons
import processVideoFile from "../utils/videotoReference.js";
import "./UploadPage.css";

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [processingPoses, setProcessingPoses] = useState(false);
  const [successUrl, setSuccessUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles[0]) setFile(droppedFiles[0]);
  };

  const handleUpload = async () => {
    if (!file || !title) return alert("Please select a video and enter a title.");

    setUploading(true);

    // Get current user session
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
    
    // Fetch user's profile to get username
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single();
    
    const uploaderName = profileData?.username || session.user.email;

    // Upload to Supabase Storage
    const fileName = `danceclips/${uuidv4()}.mp4`;
    const { data, error: uploadError } = await supabase.storage
      .from("videos")
      .upload(fileName, file, { contentType: "video/mp4" });

    if (uploadError) {
      alert("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }

    // Get public URL
    const { data: publicData } = supabase.storage
      .from("videos")
      .getPublicUrl(data.path);

    // Process video to generate reference poses
    setProcessingPoses(true);
    let referenceSequence = null;
    let stepTimes = null;
    let suggestedAutoSkip = null;
    
    try {
      console.log("Processing video to extract reference poses...");
      const result = await processVideoFile(file, { fixedIntervalSeconds: 0.5 });
      referenceSequence = result.referenceSequence;
      stepTimes = result.stepTimes;
      suggestedAutoSkip = result.suggestedAutoSkip;
      console.log(`✅ Generated ${referenceSequence.length} reference poses`);
    } catch (err) {
      console.error("Failed to process video for reference poses:", err);
      alert("⚠️ Video uploaded but pose detection data could not be generated. The challenge will still work but scoring may not be available.");
    } finally {
      setProcessingPoses(false);
    }

    // Insert into challenges table with reference data
    const { error: dbError } = await supabase.from("challenges").insert([ 
      { 
        title,
        uploader: uploaderName, 
        uploader_id: userId, 
        video_url: publicData.publicUrl,
        reference_sequence: referenceSequence,
        step_times: stepTimes,
        suggested_auto_skip: suggestedAutoSkip,
      },
    ]);

    if (dbError) alert("Error saving challenge: " + dbError.message);
    else {
      const poseMsg = referenceSequence ? ` with ${referenceSequence.length} reference poses` : '';
      alert(`✅ Dance challenge uploaded successfully${poseMsg}!`);
      navigate("/");
    }

    setUploading(false);
  };

  return (
    <div className="upload-container">
      <h1>Upload Dance Challenge</h1>
      <p className="upload-subtitle">Share your moves with the world</p>

      <div className="upload-form">
        <input
          type="text"
          placeholder="Dance Challenge Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div
          className={`dropzone ${dragActive ? "active" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            id="video-upload"
            accept="video/*"
            onChange={handleFileChange}
            className="hidden-input"
          />
          <label htmlFor="video-upload" className="file-label">
            <FaVideo size={80} color="#999" />
            <div className="file-label-text">
              <strong>Drop your video here or click to browse</strong>
            </div>
            {file && <div className="file-name">{file.name}</div>}
          </label>
          <button 
            type="button"
            disabled={uploading || processingPoses} 
            onClick={(e) => {
              e.stopPropagation();
              if (!file || !title) {
                // If no file, trigger file picker
                if (!file) {
                  document.getElementById('video-upload').click();
                } else {
                  alert("Please enter a title for your video");
                }
              } else {
                handleUpload();
              }
            }}
            className="upload-button-inside"
          >
            {processingPoses ? "⏳ Processing poses..." : uploading ? "⬆️ Uploading..." : "Upload Video"}
          </button>
          {processingPoses && (
            <div style={{ marginTop: '12px', textAlign: 'center', color: '#9dd49d', fontSize: '0.9rem' }}>
              🔍 Analyzing video to extract reference poses for scoring...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
