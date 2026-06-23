// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { listCustomers, createCustomer, listFrom } from '../api.js';

export default function Clients() {
    const { user } = useAuth();
    const companyId = user?.companyId;
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({ custCompanyName: '', custFName: '', custLName: '', custEmail: '', custPhone: '' });
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!companyId) return;
        setLoading(true);
        try {
            setCustomers(listFrom(await listCustomers(companyId)));
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [companyId]);

    useEffect(() => { load(); }, [load]);

    async function onAdd(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const body = {
                custCompanyName: form.custCompanyName,
                custFName: form.custFName,
                custLName: form.custLName,
            };
            if (form.custEmail) body.custEmail = form.custEmail;
            if (form.custPhone) body.custPhone = form.custPhone;
            await createCustomer(body);
            setForm({ custCompanyName: '', custFName: '', custLName: '', custEmail: '', custPhone: '' });
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <div>
            <h1>Clients</h1>
            <div className="card" style={{ marginBottom: 20 }}>
                <h2>Add a client</h2>
                <form onSubmit={onAdd} className="row-form">
                    <input placeholder="Company / client name" value={form.custCompanyName} onChange={set('custCompanyName')} required />
                    <input placeholder="First name" value={form.custFName} onChange={set('custFName')} required />
                    <input placeholder="Last name" value={form.custLName} onChange={set('custLName')} required />
                    <input placeholder="Email (optional)" type="email" value={form.custEmail} onChange={set('custEmail')} />
                    <input placeholder="Phone (optional)" value={form.custPhone} onChange={set('custPhone')} />
                    <button disabled={busy} type="submit">{busy ? 'Adding…' : 'Add client'}</button>
                </form>
            </div>

            {error && <p className="error">{error}</p>}
            {loading ? <p className="muted">Loading…</p> : (
                <table className="table">
                    <thead><tr><th>Client</th><th>Contact</th><th>Email</th><th></th></tr></thead>
                    <tbody>
                        {customers.length === 0 && <tr><td colSpan={4} className="muted">No clients yet.</td></tr>}
                        {customers.map((c) => (
                            <tr key={c.custId}>
                                <td>{c.custCompanyName}</td>
                                <td>{[c.custFName, c.custLName].filter(Boolean).join(' ')}</td>
                                <td className="muted">{c.custEmail || '—'}</td>
                                <td><Link to={`/clients/${c.custId}`}>Jobs →</Link></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
