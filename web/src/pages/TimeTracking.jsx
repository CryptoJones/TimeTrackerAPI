// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth.jsx';
import { listCustomers, listJobs, listTimeEntries, createTimeEntry, listFrom } from '../api.js';

function toIso(date, time) {
    if (!date || !time) return null;
    const d = new Date(`${date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
const today = () => new Date().toISOString().slice(0, 10);
function fmtMins(m) {
    if (m == null) return '—';
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function TimeTracking() {
    const { user } = useAuth();
    const companyId = user?.companyId;
    const [customers, setCustomers] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({
        teCustId: '', teJobId: '', date: today(), start: '09:00', end: '10:00',
        teDescription: '', teBillable: true,
    });

    const loadEntries = useCallback(async () => {
        if (!companyId) return;
        setEntries(listFrom(await listTimeEntries(companyId)));
    }, [companyId]);

    useEffect(() => {
        let live = true;
        (async () => {
            if (!companyId) return;
            setLoading(true);
            try {
                setCustomers(listFrom(await listCustomers(companyId)));
                await loadEntries();
                if (live) setError(null);
            } catch (err) {
                if (live) setError(err.message);
            } finally {
                if (live) setLoading(false);
            }
        })();
        return () => { live = false; };
    }, [companyId, loadEntries]);

    // Load the selected client's jobs.
    useEffect(() => {
        let live = true;
        (async () => {
            if (!form.teCustId) { setJobs([]); return; }
            try {
                const js = listFrom(await listJobs(Number(form.teCustId)));
                if (live) setJobs(js);
            } catch {
                if (live) setJobs([]);
            }
        })();
        return () => { live = false; };
    }, [form.teCustId]);

    const set = (k) => (e) =>
        setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

    async function onLog(e) {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            const teStartedAt = toIso(form.date, form.start);
            const teEndedAt = toIso(form.date, form.end);
            if (!teStartedAt || !teEndedAt) throw new Error('Enter a valid date, start, and end time.');
            const body = { teCustId: Number(form.teCustId), teStartedAt, teEndedAt, teBillable: form.teBillable };
            if (form.teJobId) body.teJobId = Number(form.teJobId);
            if (form.teDescription) body.teDescription = form.teDescription;
            await createTimeEntry(body);
            setForm((f) => ({ ...f, teDescription: '' }));
            await loadEntries();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const custName = (id) => {
        const c = customers.find((x) => x.custId === id);
        return c ? (c.custCompanyName || [c.custFName, c.custLName].filter(Boolean).join(' ')) : `#${id}`;
    };

    return (
        <div>
            <h1>Time tracking</h1>
            <div className="card" style={{ marginBottom: 20 }}>
                <h2>Log time</h2>
                <form onSubmit={onLog} className="row-form">
                    <select value={form.teCustId} onChange={set('teCustId')} required>
                        <option value="">Select client…</option>
                        {customers.map((c) => (
                            <option key={c.custId} value={c.custId}>
                                {c.custCompanyName || [c.custFName, c.custLName].filter(Boolean).join(' ')}
                            </option>
                        ))}
                    </select>
                    <select value={form.teJobId} onChange={set('teJobId')}>
                        <option value="">(no job)</option>
                        {jobs.map((j) => <option key={j.jobId} value={j.jobId}>{j.jobDesc}</option>)}
                    </select>
                    <input type="date" value={form.date} onChange={set('date')} required />
                    <input type="time" value={form.start} onChange={set('start')} required />
                    <input type="time" value={form.end} onChange={set('end')} required />
                    <input placeholder="Notes (optional)" value={form.teDescription} onChange={set('teDescription')} />
                    <label className="inline"><input type="checkbox" checked={form.teBillable} onChange={set('teBillable')} /> Billable</label>
                    <button disabled={busy} type="submit">{busy ? 'Logging…' : 'Log time'}</button>
                </form>
            </div>

            {error && <p className="error">{error}</p>}
            {loading ? <p className="muted">Loading…</p> : (
                <table className="table">
                    <thead><tr><th>Date</th><th>Client</th><th>Duration</th><th>Billable</th><th>Notes</th></tr></thead>
                    <tbody>
                        {entries.length === 0 && <tr><td colSpan={5} className="muted">No time logged yet.</td></tr>}
                        {entries.map((t) => (
                            <tr key={t.teId}>
                                <td>{t.teStartedAt ? t.teStartedAt.slice(0, 10) : '—'}</td>
                                <td>{custName(t.teCustId)}</td>
                                <td>{fmtMins(t.teMinutes)}</td>
                                <td className="muted">{t.teBillable ? 'Yes' : 'No'}</td>
                                <td className="muted">{t.teDescription || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
