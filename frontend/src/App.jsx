import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import NavBar from "./components/NavBar";

import UploadPage from "./pages/UploadPage";
import Home from "./pages/Home";
import ChallengePage from "./pages/ChallengePage";
import LeaderboardPage from "./pages/LeaderboardPage";
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
            <Route path="/home" element={<Home />} />
            <Route
              path="/upload"
              element={
                <ProtectedRoute>
                  <UploadPage />
                </ProtectedRoute>
              }
            />
            <Route path="/challenge/:id" element={<ChallengePage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
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
