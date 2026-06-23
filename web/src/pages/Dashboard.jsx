// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { aging } from '../api.js';

const usd = (n) => `$${Number(n ?? 0).toFixed(2)}`;

const BUCKETS = [
    { key: 'current', label: 'Current' },
    { key: 'd1_30', label: '1–30 days' },
    { key: 'd31_60', label: '31–60 days' },
    { key: 'd61_90', label: '61–90 days' },
    { key: 'd90_plus', label: '90+ days' },
];

const LINKS = [
    { to: '/time', title: 'Track time', blurb: 'Log hours against a client and job.' },
    { to: '/clients', title: 'Clients & jobs', blurb: 'Add clients and the work you do for them.' },
    { to: '/invoices', title: 'Invoices', blurb: 'Auto-bill, record payments, download PDFs.' },
];

export default function Dashboard() {
    const { user } = useAuth();
    const companyId = user?.companyId;
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let live = true;
        (async () => {
            if (!companyId) return;
            try {
                const r = await aging(companyId);
                if (live) setReport(r);
            } catch (err) {
                if (live) setError(err.message);
            } finally {
                if (live) setLoading(false);
            }
        })();
        return () => { live = false; };
    }, [companyId]);

    const totals = report?.totals || {};
    const customers = (report?.customers || [])
        .slice()
        .sort((a, b) => (b.total || 0) - (a.total || 0));

    return (
        <div className="dashboard">
            <h1>Welcome{user?.companyName ? `, ${user.companyName}` : ''} 👋</h1>
            <p className="muted">Signed in as {user?.email}.</p>

            <h2 style={{ marginTop: 24 }}>Accounts receivable</h2>
            {error && <p className="error">{error}</p>}
            {loading ? <p className="muted">Loading…</p> : (
                <>
                    <div className="summary-grid">
                        <div className="card stat" style={{ gridColumn: '1 / -1' }}>
                            <span className="muted">Total outstanding</span>
                            <strong style={{ fontSize: 28 }}>{usd(totals.total)}</strong>
                        </div>
                        {BUCKETS.map((b) => (
                            <div className="card stat" key={b.key}>
                                <span className="muted">{b.label}</span>
                                <strong>{usd(totals[b.key])}</strong>
                            </div>
                        ))}
                    </div>

                    {customers.length > 0 && (
                        <>
                            <h2>Who owes you</h2>
                            <table className="table">
                                <thead><tr><th>Client</th><th>Current</th><th>Overdue</th><th>Total</th></tr></thead>
                                <tbody>
                                    {customers.map((c) => (
                                        <tr key={c.custId}>
                                            <td>{c.customerName || `#${c.custId}`}</td>
                                            <td>{usd(c.current)}</td>
                                            <td>{usd((c.total || 0) - (c.current || 0))}</td>
                                            <td>{usd(c.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                    {customers.length === 0 && <p className="muted">No outstanding balances. 🎉</p>}
                </>
            )}

            <h2 style={{ marginTop: 28 }}>Get things done</h2>
            <div className="grid">
                {LINKS.map((l) => (
                    <Link className="card section linkcard" to={l.to} key={l.to}>
                        <h2>{l.title}</h2>
                        <p className="muted">{l.blurb}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
