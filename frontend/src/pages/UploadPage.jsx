import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../utils/supabaseClient.js";
import { v4 as uuidv4 } from "uuid";
import "./UploadPage.css";

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [successUrl, setSuccessUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);

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
    const fileName = `challenges/${uuidv4()}.mp4`;
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

    // Insert into challenges table
    const { error: dbError } = await supabase.from("challenges").insert([
      {
        title,
        uploader: uploaderName, // display username or email as fallback
        uploader_id: userId, // 🔥 associate with the logged-in user
        video_url: publicData.publicUrl,
      },
    ]);

    if (dbError) alert("Error saving challenge: " + dbError.message);
    else {
      alert("✅ Challenge uploaded successfully!");
      setSuccessUrl(publicData.publicUrl);
      setFile(null);
      setTitle("");
    }

    setUploading(false);
  };

  return (
    <div className="upload-container">
      <h1>Upload Challenge</h1>
      <p className="upload-subtitle">Share your creativity with the world</p>

      <div className="upload-form">
        <input
          type="text"
          placeholder="Challenge Title"
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
          <label htmlFor="video-upload" className="drop-label">
            <div className="drop-title">Drag &amp; drop your video here</div>
            <div className="drop-sub">or <strong>browse files</strong></div>
          </label>
          {file && <div className="file-name">✓ {file.name}</div>}
        </div>

        <button className="btn primary" disabled={uploading} onClick={handleUpload}>
          {uploading ? "Uploading..." : "Upload Challenge"}
        </button>
      </div>

      {successUrl && (
        <div className="success-video">
          <p>✨ Upload Successful!</p>
          <video src={successUrl} controls />
        </div>
      )}
    </div>
  );
}
