import React from "react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../utils/supabaseClient";
import { useUser } from "../hooks/useUser";
import "./NavBar.css";
import Logo from "./Logo.jsx";

export default function NavBar() {
  const { user, profile, refreshProfile } = useUser();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      refreshProfile();
    } catch (err) {
      console.error("Logout error", err);
    }
  };

  const navItems = [
    { to: '/', label: 'Home' },
    { to: '/upload', label: 'Upload' },
    { to: '/leaderboard', label: 'Leaderboard' },
    { to: '/profile', label: 'Profile' }
  ];

  return (
    <nav className="navbar glass fade-in">
      <div className="nav-container">
        <Link to="/" className="logo-brand spin-on-hover" aria-label="MatchA Dance home">
          <Logo />
          <span className="logo-text">MatchA Dance</span>
        </Link>
        <div className="nav-links">
          {navItems.map(item => (
            <Link key={item.to} to={item.to} className={`nav-link ${location.pathname === item.to ? 'active' : ''}`}>
              <span className="nav-link-text">{item.label}</span>
              <span className="nav-underline" />
            </Link>
          ))}
          {user ? (
            <div className="nav-auth-group">
              <span className="user-info fade-slide">{profile?.username || user.email}</span>
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <Link to="/login" className="nav-link auth-link">
              <span className="nav-link-text">Login</span>
              <span className="nav-underline" />
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
