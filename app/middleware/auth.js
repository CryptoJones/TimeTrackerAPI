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
const log = require('../config/logger.js');

/**
 * Late-bound + injectable DB accessor. Returns the db.config module
 * on every call, or a test-supplied substitute set via
 * `_setDbForTesting(stub)`. P5-M.
 *
 * Why injection: vitest's `vi.mock()` does not intercept CJS
 * `require()` in this codebase (the model files use CJS via
 * sequelize-cli's conventions, and vitest's mock layer only patches
 * ESM imports reliably here). Tests that want to drive the
 * "row found" success paths therefore need a way to *explicitly*
 * substitute the db. The setter is hidden behind a leading-underscore
 * name to make it clear it's a test-only seam; production code
 * never calls it.
 *
 * Production performance: Node caches the require by path, so the
 * accessor is effectively a property read on `require.cache` after
 * the first call.
 */
let _dbOverride = null;
function getDb() {
    return _dbOverride || require('../config/db.config.js');
}
function _setDbForTesting(db) {
    // Pass `null` (or omit) to restore the production lookup.
    _dbOverride = db || null;
}

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

/**
 * Why model calls instead of raw `sequelize.query`:
 *
 * P5-M reworked this module to route every DB hit through the
 * Sequelize model layer (`ApiMaster.findOne`, `Customer.findByPk`,
 * etc.) for testability. `vi.mock('../config/db.config.js', ...)`
 * intercepts the module export; the raw `db.sequelize.query` path
 * had a nested CJS-require interplay that often slipped past the
 * mock, leaving tests exercising the real (unreachable in tests) DB.
 * Going through the models means every code path here is testable
 * with the same model-stub fixtures the rest of the api tests use.
 *
 * Performance is no worse — these are single-row primary-key
 * lookups; Sequelize's per-row instantiation overhead is in the
 * sub-millisecond range and dwarfed by the network round-trip.
 *
 * The archive filter (`<arch>: false`) is no longer hand-rolled in
 * the WHERE clause. P2-E added `defaultScope` to every model with
 * an archive column, so the soft-delete filter is implicit.
 */

async function isMaster(authKey) {
    if (!authKey || authKey.length === 0) return false;
    try {
        const row = await getDb().ApiMaster.findOne({
            where: { amKEY: hashKey(authKey) },
            attributes: ['amId'],
        });
        return !!(row && typeof row.amId === 'number' && row.amId > 0);
    } catch (error) {
        log.error({ err: error }, 'auth.isMaster query failed');
        return false;
    }
}

async function getCompanyId(authKey) {
    if (!authKey || authKey.length === 0) return -1;
    try {
        const row = await getDb().ApiKey.findOne({
            where: { akKEY: hashKey(authKey) },
            attributes: ['akCompanyId'],
        });
        if (!row) return -1;
        const cid = row.akCompanyId;
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
        const row = await getDb().Customer.findByPk(customerId, {
            attributes: ['custCompId'],
        });
        if (!row) return -1;
        const cid = row.custCompId;
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
        const row = await getDb().PurchaseOrderVendor.findByPk(povId, {
            attributes: ['povCompId'],
        });
        if (!row) return -1;
        const cid = row.povCompId;
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
 * is the auth boundary. Eager-loaded via the PurchaseOrderHeader →
 * PurchaseOrderVendor association so this stays one round-trip.
 */
async function getCompanyIdByPohId(pohId) {
    const idStr = pohId == null ? '' : String(pohId);
    if (idStr.length === 0 || idStr === '0') return -1;
    try {
        const row = await getDb().PurchaseOrderHeader.findByPk(pohId, {
            attributes: ['pohId'],
            include: [{
                model: getDb().PurchaseOrderVendor,
                attributes: ['povCompId'],
                required: true,
            }],
        });
        if (!row) return -1;
        // Association produces row.PurchaseOrderVendor (singular,
        // belongsTo). defaultScope on PurchaseOrderVendor filters
        // archived vendors automatically.
        const vendor = row.PurchaseOrderVendor || row.purchaseOrderVendor;
        if (!vendor) return -1;
        const cid = vendor.povCompId;
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
        const row = await getDb().Job.findByPk(jobId, {
            attributes: ['jobId'],
            include: [{
                model: getDb().Customer,
                attributes: ['custCompId'],
                required: true,
            }],
        });
        if (!row) return -1;
        const customer = row.Customer || row.customer;
        if (!customer) return -1;
        const cid = customer.custCompId;
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
 * Express middleware: best-effort attach `authKey` + resolved
 * `{ isMaster, companyId }` onto the request. Never rejects — endpoints
 * like /v1/whoami need to distinguish "header missing" from "header
 * present but unknown" themselves, and a strict guard middleware
 * would collapse those into a uniform 403.
 *
 * Always sets:
 *   req.authKey   string | null    (raw header value, or null)
 *   req.isMaster  boolean          (false on unknown / missing key)
 *   req.companyId number           (-1 sentinel for "no scoped key")
 *
 * Use `requireAuth` after this on routes that DO want the 403
 * behavior (every /v1/* route except /v1/whoami).
 */
async function attachAuth(req, res, next) {
    const authKey = req.get('authKey');
    req.authKey = authKey || null;
    req.isMaster = false;
    req.companyId = -1;
    if (!authKey) return next();
    try {
        req.isMaster = await isMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'attachAuth: isMaster failed');
        return res.status(500).json({ message: 'Error!' });
    }
    if (req.isMaster) {
        // Master keys aren't scoped to a single company. Leave
        // companyId at -1; handlers needing a target scope read
        // it from req.params / req.body / req.query.
        return next();
    }
    try {
        req.companyId = await getCompanyId(authKey);
    } catch (error) {
        log.error({ err: error }, 'attachAuth: getCompanyId failed');
        return res.status(500).json({ message: 'Error!' });
    }
    return next();
}

/**
 * Express middleware: 403s requests that aren't authenticated.
 * Assumes attachAuth has already run upstream.
 *
 *   - missing authKey header                  -> 403 "Authorization key not sent."
 *   - present authKey, not master, no scope   -> 403 "Invalid Authorization Key."
 *   - otherwise                               -> next()
 */
function requireAuth(req, res, next) {
    if (!req.authKey) {
        return res.status(403).json({ message: 'Authorization key not sent.' });
    }
    if (!req.isMaster && req.companyId === -1) {
        return res.status(403).json({ message: 'Invalid Authorization Key.' });
    }
    return next();
}

/**
 * Combined middleware kept for backward-compat with anywhere it
 * was mounted directly. New mounts should use attachAuth +
 * requireAuth as two separate middlewares so endpoints can opt
 * out of the strict 403 (like /v1/whoami).
 */
async function resolveAuth(req, res, next) {
    let attachOk = false;
    await new Promise((resolve) => {
        attachAuth(req, res, () => { attachOk = true; resolve(); });
    });
    if (!attachOk) return; // attachAuth already sent a 500
    return requireAuth(req, res, next);
}

module.exports = {
    isMaster,
    getCompanyId,
    getCompanyIdByCustomerId,
    getCompanyIdByJobId,
    getCompanyIdByPovId,
    getCompanyIdByPohId,
    requireAuthKey,
    attachAuth,
    requireAuth,
    resolveAuth,
    hashKey,
    // Test-only seam: call with a stub db to drive auth functions
    // through caller-controlled fixtures; call with no args (or null)
    // to restore the production lookup. Production code MUST NOT call
    // this. P5-M.
    _setDbForTesting,
};
