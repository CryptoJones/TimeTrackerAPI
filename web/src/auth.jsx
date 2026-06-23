// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Auth context: tracks the current user (resolved from the stored session
// key on load) and exposes login/signup/logout that update it.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as apiClient from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // On mount, if we have a stored key, resolve the user via /me.
    useEffect(() => {
        let live = true;
        (async () => {
            if (!apiClient.getApiKey()) { setLoading(false); return; }
            try {
                const { user: u } = await apiClient.me();
                if (live) setUser(u);
            } catch {
                apiClient.setApiKey(null); // stale/invalid key
            } finally {
                if (live) setLoading(false);
            }
        })();
        return () => { live = false; };
    }, []);

    const login = useCallback(async (creds) => {
        const out = await apiClient.login(creds);
        setUser(out.user);
        return out;
    }, []);
    const signup = useCallback(async (form) => {
        const out = await apiClient.signup(form);
        setUser(out.user);
        return out;
    }, []);
    const logout = useCallback(async () => {
        await apiClient.logout();
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
