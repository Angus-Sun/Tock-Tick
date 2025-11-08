import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { supabase } from "./utils/supabaseClient";
import "./App.css";

import UploadPage from "./pages/UploadPage";
import Home from "./pages/Home";
import ChallengePage from "./pages/ChallengePage";
import Auth from "./pages/Auth"; // your login/signup page
import ProtectedRoute from "./components/ProtectedRoute"; // now implemented
import ProfilePage from "./pages/Profile";
import { UserProvider, useUser } from './hooks/useUser.jsx';

export default function App() {
  return (
    <UserProvider>
      <BrowserRouter>
        <div className="app">
          <NavBar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <UploadPage />
                </ProtectedRoute>
              }
            />
            <Route path="/challenge/:id" element={<ChallengePage />} />
            <Route path="/login" element={<Auth />} />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </div>
      </BrowserRouter>
    </UserProvider>
  );
}

function NavBar() {
  const { user, profile, refreshProfile } = useUser();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    refreshProfile();
  };
  return (
    <nav className="navbar">
      <div className="nav-container">
        <h1 className="logo">TokTik</h1>
        <div className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/upload">Upload</Link>
          <Link to="/profile">Profile</Link>
          {user ? (
            <>
              <span className="user-info">👤 {profile?.username || user.email || 'User'}</span>
              <button onClick={handleLogout} className="logout-btn">Logout</button>
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
