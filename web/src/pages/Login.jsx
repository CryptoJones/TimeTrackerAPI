// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
    const { login } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await login({ email, password });
            nav('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="card auth-card">
            <h1>Log in</h1>
            <form onSubmit={onSubmit}>
                <label>Email
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </label>
                <label>Password
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </label>
                {error && <p className="error">{error}</p>}
                <button disabled={busy} type="submit">{busy ? 'Logging in…' : 'Log in'}</button>
            </form>
            <p className="muted">No account? <Link to="/signup">Sign up</Link></p>
        </div>
    );
}
