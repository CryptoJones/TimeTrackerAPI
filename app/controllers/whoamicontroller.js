// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * GET /v1/whoami — return what the calling authKey resolves to.
 *
 * Useful for SDK clients to confirm wiring (is my key recognized?
 * is it a master key? which company does it belong to?) without
 * having to call a domain endpoint and infer from a 403/200 result.
 *
 * Response shape:
 *   {
 *     "authenticated": true|false,
 *     "isMaster": true|false,
 *     "companyId": <int>|null
 *   }
 *
 * A missing authKey header returns 403 like every other v1
 * endpoint. An unknown authKey returns 200 with
 * { authenticated: false, isMaster: false, companyId: null }
 * — we deliberately distinguish "header missing" from "header
 * present but key not in our records" so a client can tell
 * whether the network plumbing is wrong vs. the credential.
 */

// Mounted under attachAuth but NOT under requireAuth — req.authKey
// may be null, req.companyId may be -1. That's intentional; the
// response shape distinguishes "header missing" from "header
// present but unknown."

exports.whoami = async (req, res) => {
    if (!req.authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }
    if (req.isMaster) {
        return res.status(200).json({
            authenticated: true,
            isMaster: true,
            companyId: null,
        });
    }
    if (req.companyId === -1) {
        return res.status(200).json({
            authenticated: false,
            isMaster: false,
            companyId: null,
        });
    }
    return res.status(200).json({
        authenticated: true,
        isMaster: false,
        companyId: req.companyId,
    });
};
