// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';

function Protected({ children }) {
    const { user, loading } = useAuth();
    if (loading) return <div className="center muted">Loading…</div>;
    return user ? children : <Navigate to="/login" replace />;
}

function Header() {
    const { user, logout } = useAuth();
    const nav = useNavigate();
    if (!user) return null;
    return (
        <header className="topbar">
            <Link to="/" className="brand">⏱ TimeTracker</Link>
            <div className="spacer" />
            <span className="muted">{user.email}</span>
            <button className="ghost" onClick={async () => { await logout(); nav('/login'); }}>
                Log out
            </button>
        </header>
    );
}

export default function App() {
    return (
        <div className="app">
            <Header />
            <main className="content">
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/" element={<Protected><Dashboard /></Protected>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>
            <footer className="footer">
                Proudly Made in Nebraska. Go Big Red! 🌽
            </footer>
        </div>
    );
}
