<div align="center">
    <img alt="Logo" src="frontend/public/image.png" width="100" />
</div>
<h1 align="center">
    MatchA Dance
</h1>
<p align="center">
   🥇 <strong>1st Place Overall Winner at <a href="https://goonhacks.devpost.com/">GoOnHacks</a></strong>
</p>
<p align="center">
   A real-time pose matching and dance challenge application that uses AI-powered pose detection to score user performances against reference videos. Challenge yourself and compete on global leaderboards!
</p>

<p align="center">
  <a href="https://devpost.com/software/f-7l6bs3">
    <img src="https://img.shields.io/badge/Devpost-View%20Project-003E54?style=for-the-badge&logo=devpost" alt="View on Devpost" />
  </a>
  <a href="https://matchadance.vercel.app/">
    <img src="https://img.shields.io/badge/Live-Demo-00C7B7?style=for-the-badge&logo=vercel" alt="Live Demo" />
  </a>
</p>

## Features

- **Real-time Pose Detection**: Uses MediaPipe Pose to track body movements through your webcam
- **Video Challenges**: Upload and share dance/movement challenges for others to mimic
- **Advanced Scoring System**: Comprehensive scoring based on pose accuracy, timing, and consistency
- **Performance Points (PP)**: Earn PP based on your performance with difficulty multipliers
- **Global Leaderboards**: Compete with players worldwide on each challenge
- **User Profiles**: Track your progress, view your uploads and completed challenges
- **Live Feedback**: See your score update in real-time as you perform
- **Video Recording**: Record your attempts and preview before submitting
- **Social Features**: View other users' profiles and their achievements

## Tech Stack

### Frontend
- **React 19.1** - UI framework
- **Vite** - Build tool and dev server
- **React Router DOM** - Client-side routing
- **MediaPipe Pose** - AI pose detection
- **Framer Motion** - Animations
- **Socket.io Client** - Real-time communication
- **Supabase JS** - Backend client

### Backend
- **Node.js** with Express - REST API server
- **Socket.io** - WebSocket server for real-time features
- **Supabase** - PostgreSQL database and authentication
- **dotenv** - Environment configuration

### Deployment
- **Vercel** - Frontend hosting (configured)
- **Backend** - Can be deployed to any Node.js hosting service

### Prerequisites

- Node.js 18+ and npm
- A [Supabase](https://supabase.com/) account and project
- Modern web browser with webcam access

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Angus-Sun/matchA-dance.git
   cd matchA-dance
   ```

2. **Install root dependencies**
   ```bash
   npm install
   ```

3. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   ```

4. **Install backend dependencies**
   ```bash
   cd backend
   npm install
   ```

### Environment Variables

#### Backend (`backend/.env`)
Create a `.env` file in the `backend` directory:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
PORT=3001
```

#### Frontend (`frontend/.env`)
Create a `.env` file in the `frontend` directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_SOCKET_URL=http://localhost:3001
```

### Scoring Algorithm

The scoring system evaluates performances based on:

- **Pose Accuracy**: How closely your body position matches the reference
- **Timing**: Whether you hit the poses at the right moments
- **Smoothness**: Consistency and flow of movements
- **Completeness**: Coverage of all key poses in the challenge

**Performance Points (PP)** are calculated considering:
- Base score percentage
- Challenge difficulty rating
- Personal best comparison
- Consistency bonus/penalty
- Leaderboard position modifier

## 📄 License

[AGPL](LICENSE)

