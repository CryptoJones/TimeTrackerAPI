// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getCustomer, listJobs, createJob, autoBillJob, listFrom } from '../api.js';

export default function CustomerDetail() {
    const { id } = useParams();
    const nav = useNavigate();
    const custId = Number(id);
    const [customer, setCustomer] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [note, setNote] = useState(null);
    const [jobDesc, setJobDesc] = useState('');
    const [busy, setBusy] = useState(false);
    const [billing, setBilling] = useState(null);

    async function onAutoBill(jobId) {
        setBilling(jobId);
        setError(null);
        setNote(null);
        try {
            const out = await autoBillJob(jobId);
            nav(`/invoices/${out.invoice.invId}`);
        } catch (err) {
            setError(err.message);
        } finally {
            setBilling(null);
        }
    }

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const c = await getCustomer(custId);
            setCustomer(c.customer || c);
            setJobs(listFrom(await listJobs(custId)));
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [custId]);

    useEffect(() => { load(); }, [load]);

    async function onAddJob(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await createJob({ jobCustId: custId, jobDesc });
            setJobDesc('');
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    const name = customer
        ? (customer.custCompanyName || [customer.custFName, customer.custLName].filter(Boolean).join(' '))
        : `Client #${custId}`;

    return (
        <div>
            <p><Link to="/clients" className="muted">← Clients</Link></p>
            <h1>{name}</h1>

            <div className="card" style={{ marginBottom: 20 }}>
                <h2>Add a job</h2>
                <form onSubmit={onAddJob} className="row-form">
                    <input placeholder="What's the work? (e.g. Website redesign)" value={jobDesc} onChange={(e) => setJobDesc(e.target.value)} required style={{ flex: 1 }} />
                    <button disabled={busy} type="submit">{busy ? 'Adding…' : 'Add job'}</button>
                </form>
            </div>

            {note && <p className="note">{note}</p>}
            {error && <p className="error">{error}</p>}
            {loading ? <p className="muted">Loading…</p> : (
                <table className="table">
                    <thead><tr><th>Job</th><th>Invoiced</th><th></th></tr></thead>
                    <tbody>
                        {jobs.length === 0 && <tr><td colSpan={3} className="muted">No jobs yet.</td></tr>}
                        {jobs.map((j) => (
                            <tr key={j.jobId}>
                                <td>{j.jobDesc}</td>
                                <td className="muted">{j.jobInvoiced ? 'Yes' : 'No'}</td>
                                <td>
                                    <button className="ghost small" disabled={billing === j.jobId}
                                        onClick={() => onAutoBill(j.jobId)}>
                                        {billing === j.jobId ? 'Billing…' : 'Auto-bill →'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
