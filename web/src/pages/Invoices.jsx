// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { listCustomers, listInvoices, listFrom } from '../api.js';

const STATUS_LABEL = {
    draft: 'Draft', sent: 'Sent', partial: 'Partially paid', paid: 'Paid', void: 'Void',
};

export default function Invoices() {
    const { user } = useAuth();
    const companyId = user?.companyId;
    const [customers, setCustomers] = useState([]);
    const [custId, setCustId] = useState('');
    const [invoices, setInvoices] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        (async () => {
            if (!companyId) return;
            try { setCustomers(listFrom(await listCustomers(companyId))); }
            catch (err) { setError(err.message); }
        })();
    }, [companyId]);

    useEffect(() => {
        let live = true;
        (async () => {
            if (!custId) { setInvoices([]); return; }
            setLoading(true);
            try {
                if (live) setInvoices(listFrom(await listInvoices(Number(custId))));
                if (live) setError(null);
            } catch (err) {
                if (live) setError(err.message);
            } finally {
                if (live) setLoading(false);
            }
        })();
        return () => { live = false; };
    }, [custId]);

    return (
        <div>
            <h1>Invoices</h1>
            <div className="card" style={{ marginBottom: 20 }}>
                <label>Client
                    <select value={custId} onChange={(e) => setCustId(e.target.value)}>
                        <option value="">Select a client to see their invoices…</option>
                        {customers.map((c) => (
                            <option key={c.custId} value={c.custId}>
                                {c.custCompanyName || [c.custFName, c.custLName].filter(Boolean).join(' ')}
                            </option>
                        ))}
                    </select>
                </label>
                <p className="muted" style={{ marginBottom: 0 }}>
                    Tip: create invoices by auto-billing a job from the client's page.
                </p>
            </div>

            {error && <p className="error">{error}</p>}
            {custId && (loading ? <p className="muted">Loading…</p> : (
                <table className="table">
                    <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        {invoices.length === 0 && <tr><td colSpan={5} className="muted">No invoices for this client.</td></tr>}
                        {invoices.map((inv) => (
                            <tr key={inv.invId}>
                                <td>#{inv.invId}</td>
                                <td>{inv.invDate}</td>
                                <td>{inv.invDueDate}</td>
                                <td>{STATUS_LABEL[inv.invStatus] || inv.invStatus || '—'}</td>
                                <td><Link to={`/invoices/${inv.invId}`}>Open →</Link></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ))}
        </div>
    );
}
