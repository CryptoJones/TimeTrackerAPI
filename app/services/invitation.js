// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * invitation.js — teammate-invitation validity (#458). PURE: no DB, no
 * clock (nowMs injected). An invite is acceptable only if it is not
 * archived, not already accepted, its stored token hash matches the
 * presented one, and it has not expired. Token generation reuses
 * password-reset.js's generateToken.
 */

const INVITE_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

/**
 * @param invite a { invtArch, invtAcceptedAt, invtTokenHash, invtExpires }.
 * @param candidateHash SHA-256 of the presented token.
 * @param nowMs current time in ms.
 */
function isInviteValid(invite, candidateHash, nowMs) {
    if (!invite || invite.invtArch) return false;
    if (invite.invtAcceptedAt) return false;
    if (!invite.invtTokenHash || !candidateHash || invite.invtTokenHash !== candidateHash) return false;
    if (!invite.invtExpires) return false;
    const exp = new Date(invite.invtExpires).getTime();
    return Number.isFinite(exp) && Number(nowMs) <= exp;
}

module.exports = { INVITE_TTL_SEC, isInviteValid };
