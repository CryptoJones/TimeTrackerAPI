// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getInvoice, recordPayment, carryForward, downloadInvoicePdf } from '../api.js';

const usd = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function InvoiceDetail() {
    const { id } = useParams();
    const invId = Number(id);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [note, setNote] = useState(null);
    const [pay, setPay] = useState({ amount: '', date: today(), description: '' });
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await getInvoice(invId));
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [invId]);

    useEffect(() => { load(); }, [load]);

    async function onPay(e) {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setNote(null);
        try {
            const body = { amount: Number(pay.amount), date: pay.date };
            if (pay.description) body.description = pay.description;
            await recordPayment(invId, body);
            setPay({ amount: '', date: today(), description: '' });
            setNote('Payment recorded.');
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function onCarryForward() {
        setBusy(true);
        setError(null);
        try {
            const out = await carryForward(invId, {});
            setNote(`Carried the balance forward to invoice #${out.invoice.invId}.`);
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function onPdf() {
        setError(null);
        try { await downloadInvoicePdf(invId); }
        catch (err) { setError(err.message); }
    }

    if (loading) return <p className="muted">Loading…</p>;
    if (!data) return <p className="error">{error || 'Not found.'}</p>;

    const inv = data.invoice || {};
    const lines = inv.lines || [];
    const payments = inv.payments || [];

    return (
        <div>
            <p><Link to="/invoices" className="muted">← Invoices</Link></p>
            <h1>Invoice #{inv.invId}</h1>

            <div className="summary-grid">
                <div className="card stat"><span className="muted">Status</span><strong>{data.status}</strong></div>
                <div className="card stat"><span className="muted">Total</span><strong>{usd(data.total)}</strong></div>
                <div className="card stat"><span className="muted">Paid</span><strong>{usd(data.paid)}</strong></div>
                <div className="card stat"><span className="muted">Balance</span><strong>{usd(data.balance)}</strong></div>
            </div>

            <div className="actions">
                <button className="ghost" onClick={onPdf}>Download PDF</button>
                {data.balance > 0 && (
                    <button className="ghost" disabled={busy} onClick={onCarryForward}>
                        Carry balance forward
                    </button>
                )}
            </div>

            {note && <p className="note">{note}</p>}
            {error && <p className="error">{error}</p>}

            <div className="cols">
                <div>
                    <h2>Lines</h2>
                    <table className="table">
                        <thead><tr><th>Line</th><th>Amount</th></tr></thead>
                        <tbody>
                            {lines.length === 0 && <tr><td colSpan={2} className="muted">No lines.</td></tr>}
                            {lines.map((l) => (
                                <tr key={l.injbId}>
                                    <td>{l.injbJobId == null ? 'Balance brought forward' : `Job #${l.injbJobId}`}</td>
                                    <td>{usd(l.injbAmount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <h2>Payments</h2>
                    <table className="table">
                        <thead><tr><th>Date</th><th>Amount</th><th>Note</th></tr></thead>
                        <tbody>
                            {payments.length === 0 && <tr><td colSpan={3} className="muted">No payments yet.</td></tr>}
                            {payments.map((p) => (
                                <tr key={p.cpayId}>
                                    <td>{p.cpayDate}</td>
                                    <td>{usd(p.cpayAmount)}</td>
                                    <td className="muted">{p.cpayDescription || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="card">
                    <h2>Record a payment</h2>
                    <form onSubmit={onPay}>
                        <label>Amount
                            <input type="number" step="0.01" min="0.01" value={pay.amount}
                                onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} required />
                        </label>
                        <label>Date
                            <input type="date" value={pay.date}
                                onChange={(e) => setPay((p) => ({ ...p, date: e.target.value }))} required />
                        </label>
                        <label>Note (optional)
                            <input value={pay.description}
                                onChange={(e) => setPay((p) => ({ ...p, description: e.target.value }))} />
                        </label>
                        <button disabled={busy} type="submit">{busy ? 'Saving…' : 'Record payment'}</button>
                    </form>
                </div>
            </div>
        </div>
    );
}
