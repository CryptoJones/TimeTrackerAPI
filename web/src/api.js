// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Thin client for the TimeTrackerAPI. The session credential is a company
// API key returned by signup/login; we stash it in localStorage and send
// it as the `authKey` header on every call (the API's existing auth).

const KEY_STORAGE = 'tt_api_key';

export function getApiKey() {
    return localStorage.getItem(KEY_STORAGE);
}
export function setApiKey(key) {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
}

/**
 * Core request helper. Adds the authKey header when a session key exists,
 * parses JSON, and throws an Error carrying the status + server message
 * on a non-2xx response.
 */
export async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const key = getApiKey();
    if (auth && key) headers.authKey = key;

    const res = await fetch(path.startsWith('/') ? path : `/v1/${path}`, {
        method,
        headers,
        body: body == null ? undefined : JSON.stringify(body),
    });

    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) {
        const message = (data && data.message) || `Request failed (${res.status})`;
        const err = new Error(message);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

// --- auth ---
export async function signup({ email, password, companyName }) {
    const out = await api('/v1/auth/signup', { method: 'POST', auth: false, body: { email, password, companyName } });
    setApiKey(out.apiKey);
    return out;
}
export async function login({ email, password }) {
    const out = await api('/v1/auth/login', { method: 'POST', auth: false, body: { email, password } });
    setApiKey(out.apiKey);
    return out;
}
export async function logout() {
    try { await api('/v1/auth/logout', { method: 'POST' }); } finally { setApiKey(null); }
}
export async function me() {
    return api('/v1/auth/me');
}
