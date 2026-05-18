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

const crypto = require('crypto');
const { sequelize } = require('../config/db.config.js');
const db = require('../config/db.config.js');
const log = require('../config/logger.js');

/**
 * Hash an authKey for lookup. Migration 20260518000000 converted
 * ApiKey.akKEY / ApiMaster.amKEY columns from UUID to TEXT and
 * replaced row values with SHA-256 hex digests. Operator tokens
 * issued before the migration keep working because the API hashes
 * the incoming header here before the SQL lookup.
 *
 * SHA-256 unsalted (vs bcrypt/argon2id) because API tokens are
 * high-entropy (UUID v4 = 122 bits); brute force against a leaked
 * hash table is impractical. Hashing is to prevent direct replay
 * if the DB leaks, not to protect a low-entropy password.
 */
function hashKey(rawKey) {
    return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

async function isMaster(authKey) {
    if (!authKey || authKey.length === 0) return false;
    try {
        const r = await db.sequelize.query(
            'SELECT * FROM "dbo"."ApiMaster" WHERE "amKEY" = ? AND "ApiMaster"."amArchive" = false;',
            { replacements: [hashKey(authKey)], type: sequelize.QueryTypes.SELECT },
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
            { replacements: [hashKey(authKey)], type: sequelize.QueryTypes.SELECT },
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
 * Resolve a customer id to its owning company id.
 *
 * Used by entities that don't have their own *CompId column and instead
 * scope auth through their Customer relation (Job, Invoice,
 * CustomerPayment). Returns -1 on missing / archived / lookup failure
 * so callers can use the same `=== -1` sentinel as getCompanyId().
 */
async function getCompanyIdByCustomerId(customerId) {
    const idStr = customerId == null ? '' : String(customerId);
    if (idStr.length === 0 || idStr === '0') return -1;
    try {
        const r = await db.sequelize.query(
            'SELECT "custCompId" FROM "dbo"."Customer" WHERE "custId" = ? AND "custArch" = false;',
            { replacements: [customerId], type: sequelize.QueryTypes.SELECT },
        );
        if (!r || r.length === 0) return -1;
        const cid = r[0].custCompId;
        return typeof cid === 'number' && cid > 0 ? cid : -1;
    } catch (error) {
        log.error({ err: error }, 'auth.getCompanyIdByCustomerId query failed');
        return -1;
    }
}

/**
 * Resolve a PO vendor id to its owning company id. Used by
 * PurchaseOrderHeader to scope auth — headers reference a vendor
 * (pohPovId), and the vendor's povCompId is the auth boundary.
 */
async function getCompanyIdByPovId(povId) {
    const idStr = povId == null ? '' : String(povId);
    if (idStr.length === 0 || idStr === '0') return -1;
    try {
        const r = await db.sequelize.query(
            'SELECT "povCompId" FROM "dbo"."PurchaseOrderVendors" WHERE "povId" = ? AND "povArch" = false;',
            { replacements: [povId], type: sequelize.QueryTypes.SELECT },
        );
        if (!r || r.length === 0) return -1;
        const cid = r[0].povCompId;
        return typeof cid === 'number' && cid > 0 ? cid : -1;
    } catch (error) {
        log.error({ err: error }, 'auth.getCompanyIdByPovId query failed');
        return -1;
    }
}

/**
 * Resolve a PO header id to its owning company id. Used by
 * PurchaseOrderLine — lines reference a header (polpoh), and the
 * header references a vendor (pohPovId), and the vendor's povCompId
 * is the auth boundary. Single query via JOIN keeps the lookup cheap.
 */
async function getCompanyIdByPohId(pohId) {
    const idStr = pohId == null ? '' : String(pohId);
    if (idStr.length === 0 || idStr === '0') return -1;
    try {
        const r = await db.sequelize.query(
            `SELECT v."povCompId"
             FROM "dbo"."PurchaseOrderHeaders" h
             JOIN "dbo"."PurchaseOrderVendors" v ON v."povId" = h."pohPovId"
             WHERE h."pohId" = ? AND h."pohArch" = false AND v."povArch" = false;`,
            { replacements: [pohId], type: sequelize.QueryTypes.SELECT },
        );
        if (!r || r.length === 0) return -1;
        const cid = r[0].povCompId;
        return typeof cid === 'number' && cid > 0 ? cid : -1;
    } catch (error) {
        log.error({ err: error }, 'auth.getCompanyIdByPohId query failed');
        return -1;
    }
}

/**
 * Resolve a job id to its owning company id.
 *
 * Job has no direct *CompId — it scopes through Customer
 * (Job.jobCustId → Customer.custCompId). Used by InvoiceJob and
 * ProductEntry whose own FKs point into Job.
 */
async function getCompanyIdByJobId(jobId) {
    const idStr = jobId == null ? '' : String(jobId);
    if (idStr.length === 0 || idStr === '0') return -1;
    try {
        const r = await db.sequelize.query(
            `SELECT c."custCompId"
             FROM "dbo"."Job" j
             JOIN "dbo"."Customer" c ON c."custId" = j."jobCustId"
             WHERE j."jobId" = ? AND j."jobArch" = false AND c."custArch" = false;`,
            { replacements: [jobId], type: sequelize.QueryTypes.SELECT },
        );
        if (!r || r.length === 0) return -1;
        const cid = r[0].custCompId;
        return typeof cid === 'number' && cid > 0 ? cid : -1;
    } catch (error) {
        log.error({ err: error }, 'auth.getCompanyIdByJobId query failed');
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
    getCompanyIdByCustomerId,
    getCompanyIdByJobId,
    getCompanyIdByPovId,
    getCompanyIdByPohId,
    requireAuthKey,
    resolveAuth,
    hashKey,
};
