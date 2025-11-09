import React from "react";
import GlobalLeaderboard from "../components/GlobalLeaderboard.jsx";
import "./LeaderboardPage.css";

export default function LeaderboardPage() {
	return (
		<div className="leaderboard-page">
			<header className="leaderboard-header page-header">
				<h1>Global Leaderboard</h1>
				<p className="subtitle">Top performers across all challenges</p>
			</header>

			<main className="leaderboard-main">
				<GlobalLeaderboard />
			</main>
		</div>
	);
}

