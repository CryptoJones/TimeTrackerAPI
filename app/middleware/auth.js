// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Shared auth helpers + middleware. Promotes the duplicated logic
 * previously hand-rolled inside customercontroller.js and
 * timeentrycontroller.js into a single source of truth.
 *
 * Exports
 *   isMaster(authKey)      -> true if authKey matches an unarchived
 *                             ApiMaster row.
 *   getCompanyId(authKey)  -> int company id, or -1 if not found /
 *                             archived / empty.
 *   requireAuthKey(req,res,next)  -> express middleware: 403s the
 *                             request if `authKey` header is absent.
 *                             Sets req.authKey for downstream use.
 *   resolveAuth(req,res,next)     -> express middleware: also resolves
 *                             req.authKey into req.isMaster (bool) and
 *                             req.companyId (int|-1). 403s if non-master
 *                             with an unknown authKey.
 *
 * Why two middlewares
 *   Some endpoints only need to know "did the caller send an authKey"
 *   (e.g. /healthz historically would not pass through this layer);
 *   others need the resolved {isMaster, companyId} context. Splitting
 *   keeps the cheap check cheap (one DB hit, not three).
 */

const { sequelize } = require('../config/db.config.js');
const db = require('../config/db.config.js');
const log = require('../config/logger.js');

async function isMaster(authKey) {
    if (!authKey || authKey.length === 0) return false;
    try {
        const r = await db.sequelize.query(
            'SELECT * FROM "dbo"."ApiMaster" WHERE "amKEY" = ? AND "ApiMaster"."amArchive" = false;',
            { replacements: [authKey], type: sequelize.QueryTypes.SELECT },
        );
        if (!r || r.length === 0) return false;
        return typeof r[0].amId === 'number' && r[0].amId > 0;
    } catch (error) {
        log.error({ err: error }, 'auth.isMaster query failed');
        return false;
    }
}

async function getCompanyId(authKey) {
    if (!authKey || authKey.length === 0) return -1;
    try {
        const r = await db.sequelize.query(
            'SELECT * FROM "dbo"."ApiKey" WHERE "akKEY" = ? AND "ApiKey"."akArchive" = false;',
            { replacements: [authKey], type: sequelize.QueryTypes.SELECT },
        );
        if (!r || r.length === 0) return -1;
        const cid = r[0].akCompanyId;
        return typeof cid === 'number' && cid > 0 ? cid : -1;
    } catch (error) {
        log.error({ err: error }, 'auth.getCompanyId query failed');
        return -1;
    }
}

/**
 * Express middleware: ensures the authKey header is present and
 * stashes it on req.authKey. Does NOT validate the key against the
 * database — leaves that to controllers that may have different
 * scoping rules (e.g. master vs company match).
 */
function requireAuthKey(req, res, next) {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: 'Authorization key not sent.' });
    }
    req.authKey = authKey;
    return next();
}

/**
 * Express middleware: resolves the authKey into {isMaster, companyId}
 * context on req, then proceeds. Non-master with unknown authKey
 * returns 403 directly so downstream controllers can assume the
 * key resolved to *something*.
 */
async function resolveAuth(req, res, next) {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: 'Authorization key not sent.' });
    }
    req.authKey = authKey;
    try {
        req.isMaster = await isMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'auth.isMaster failed');
        return res.status(500).json({ message: 'Error!', error: String(error) });
    }
    if (req.isMaster) {
        req.companyId = null; // master keys aren't scoped to a single company
        return next();
    }
    try {
        req.companyId = await getCompanyId(authKey);
    } catch (error) {
        log.error({ err: error }, 'auth.getCompanyId failed');
        return res.status(500).json({ message: 'Error!', error: String(error) });
    }
    if (req.companyId === -1) {
        return res.status(403).json({ message: 'Invalid Authorization Key.' });
    }
    return next();
}

module.exports = {
    isMaster,
    getCompanyId,
    requireAuthKey,
    resolveAuth,
};
