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

const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');

exports.whoami = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isMaster;
    try {
        isMaster = await auth.isMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'whoami: isMaster failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    if (isMaster) {
        return res.status(200).json({
            authenticated: true,
            isMaster: true,
            companyId: null,
        });
    }

    let companyId;
    try {
        companyId = await auth.getCompanyId(authKey);
    } catch (error) {
        log.error({ err: error }, 'whoami: getCompanyId failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    if (companyId === -1) {
        return res.status(200).json({
            authenticated: false,
            isMaster: false,
            companyId: null,
        });
    }

    return res.status(200).json({
        authenticated: true,
        isMaster: false,
        companyId,
    });
};
