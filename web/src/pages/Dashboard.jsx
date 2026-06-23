// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { useAuth } from '../auth.jsx';

// Home screen after login. The feature areas (time tracking, clients &
// jobs, invoices & payments) land in the next iterations; this shell
// confirms the auth round-trip and frames where they'll go.
const SECTIONS = [
    { key: 'time', title: 'Time tracking', blurb: 'Start/stop timers and log hours against jobs.' },
    { key: 'clients', title: 'Clients & jobs', blurb: 'Manage customers and the work you do for them.' },
    { key: 'invoices', title: 'Invoices & payments', blurb: 'Auto-bill time, record payments, download PDFs.' },
    { key: 'reports', title: 'Reports', blurb: 'A/R aging and invoice lists.' },
];

export default function Dashboard() {
    const { user } = useAuth();
    return (
        <div className="dashboard">
            <h1>Welcome{user?.companyName ? `, ${user.companyName}` : ''} 👋</h1>
            <p className="muted">Signed in as {user?.email}. Here's your workspace.</p>
            <div className="grid">
                {SECTIONS.map((s) => (
                    <div className="card section" key={s.key}>
                        <h2>{s.title}</h2>
                        <p className="muted">{s.blurb}</p>
                        <span className="badge">Coming soon</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
