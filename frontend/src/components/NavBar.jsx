import React from "react";
import { Link } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { useUser } from "../hooks/useUser";
import "./NavBar.css";

export default function NavBar() {
  const { user, profile, refreshProfile } = useUser();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      refreshProfile();
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="logo">
          MATCH-A DANCE
        </Link>
        <div className="nav-links">
          <Link to="/">Home</Link>
          <Link to="/upload">Upload</Link>
          <Link to="/mymimics">My Mimics</Link>
          <Link to="/leaderboard">Leaderboard</Link>
          <Link to="/profile">Profile</Link>
          {user ? (
            <>
              <span className="user-info">{profile?.username || user.email}</span>
              <button className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
