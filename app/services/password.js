// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * password.js — password hashing for user accounts (#444). Uses Node's
 * built-in scrypt (memory-hard KDF) — NO external dependency. Stored form
 * is `scrypt$<salt-hex>$<hash-hex>`; each hash carries its own random
 * salt. verifyPassword is constant-time. PURE (CPU only), unit-testable.
 */

const crypto = require('crypto');

const KEYLEN = 64;
const SALT_BYTES = 16;

/** Hash a plaintext password → `scrypt$salt$hash`. */
function hashPassword(password) {
    const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
    const derived = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
    return `scrypt$${salt}$${derived}`;
}

/** Verify a password against a stored `scrypt$salt$hash`. Constant-time. */
function verifyPassword(password, stored) {
    const parts = String(stored || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt' || !parts[1] || !parts[2]) return false;
    const salt = parts[1];
    let derived;
    try {
        derived = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
    } catch (_) {
        return false;
    }
    const a = Buffer.from(parts[2], 'hex');
    const b = Buffer.from(derived, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
