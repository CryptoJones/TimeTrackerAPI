// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Signup() {
    const { signup } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        setError(null);
        if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        setBusy(true);
        try {
            await signup({ email, password, companyName: companyName || undefined });
            nav('/');
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="card auth-card">
            <h1>Create your account</h1>
            <form onSubmit={onSubmit}>
                <label>Workspace name
                    <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="My freelancing business" />
                </label>
                <label>Email
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </label>
                <label>Password
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                </label>
                {error && <p className="error">{error}</p>}
                <button disabled={busy} type="submit">{busy ? 'Creating…' : 'Sign up'}</button>
            </form>
            <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
        </div>
    );
}
