// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * password-reset.js — one-time reset-token helpers (#446). `generateToken`
 * mints a 256-bit random token (the raw token is emailed once; only its
 * SHA-256 is stored, via auth.hashKey). `isValid` checks a stored user's
 * reset token hash + expiry against a candidate — PURE (no DB, no clock:
 * `nowMs` is injected), unit-testable.
 */

const crypto = require('crypto');

/** A fresh 64-char hex reset token (256 bits). */
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * @param user a User with { userResetTokenHash, userResetExpires }.
 * @param candidateHash the SHA-256 of the presented token.
 * @param nowMs current time in ms.
 * @returns true when the hash matches AND the token has not expired.
 */
function isValid(user, candidateHash, nowMs) {
    if (!user || !user.userResetTokenHash || !user.userResetExpires) return false;
    if (!candidateHash || user.userResetTokenHash !== candidateHash) return false;
    const exp = new Date(user.userResetExpires).getTime();
    return Number.isFinite(exp) && Number(nowMs) <= exp;
}

module.exports = { generateToken, isValid };
