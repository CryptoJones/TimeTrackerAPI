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

// Classifying "the database is UNREACHABLE" (an outage → 503) vs anything
// else (a logical miss, or a config error like wrong credentials, which
// keep the existing sentinel behaviour). The base `SequelizeConnectionError`
// name is intentionally NOT trusted on its own — Sequelize also wraps a
// bad-password failure (pg SQLSTATE 28P01) in it, which is a
// misconfiguration, not a transient outage. So we match the SPECIFIC
// connectivity subclasses by name, plus socket / pg-connection codes. The
// auth lookups re-throw these so attachAuth answers 503 instead of letting
// an outage masquerade as a bad key (403) — see attachAuth / #377.
const DB_UNAVAILABLE_NAMES = new Set([
    'SequelizeConnectionRefusedError',
    'SequelizeHostNotFoundError',
    'SequelizeHostNotReachableError',
    'SequelizeInvalidConnectionError',
    'SequelizeConnectionTimedOutError',
    'SequelizeConnectionAcquireTimeoutError',
]);
const DB_UNAVAILABLE_CODES = new Set([
    // socket-level
    'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNRESET', 'EPIPE',
    // pg connection-class SQLSTATEs (08xxx) + admin shutdown / overload
    '08000', '08001', '08003', '08004', '08006', '57P01', '57P03', '53300',
]);

/** True when `err` indicates the database is unreachable (not a logical/config error). */
function isDbUnavailable(err) {
    if (!err) return false;
    if (typeof err.name === 'string' && DB_UNAVAILABLE_NAMES.has(err.name)) return true;
    const code = (err.original && err.original.code) || (err.parent && err.parent.code) || err.code;
    return typeof code === 'string' && DB_UNAVAILABLE_CODES.has(code);
}

async function isMaster(authKey) {
    if (!authKey || authKey.length === 0) return false;
    try {
        const row = await getDb().ApiMaster.findOne({
            where: { amKEY: hashKey(authKey) },
            attributes: ['amId'],
        });
        return !!(row && typeof row.amId === 'number' && row.amId > 0);
    } catch (error) {
        // A DB outage is not "not a master" — re-throw so attachAuth can
        // surface 503 (#377). Logical failures still collapse to false.
        if (isDbUnavailable(error)) throw error;
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
        // A DB outage is not "no scoped key" — re-throw so attachAuth can
        // surface 503 (#377). Logical failures still collapse to -1.
        if (isDbUnavailable(error)) throw error;
        log.error({ err: error }, 'auth.getCompanyId query failed');
        return -1;
    }
}

/**
 * Reuse the auth context attachAuth already resolved onto the request
 * (req.isMaster / req.companyId) instead of issuing a second identical DB
 * lookup per handler (#374). Falls back to a fresh lookup when the context
 * is absent — e.g. a handler invoked directly, outside the /v1 middleware
 * chain (as some unit tests do). PURE optimization: with the context
 * present the result is identical to calling isMaster / getCompanyId, just
 * without the extra round-trip. Controllers pass both `req` and the raw
 * `authKey` so the fallback has what it needs.
 */
async function masterFromReq(req, authKey) {
    if (req && typeof req.isMaster === 'boolean') return req.isMaster;
    return isMaster(authKey);
}

async function companyIdFromReq(req, authKey) {
    if (req && typeof req.companyId === 'number') return req.companyId;
    return getCompanyId(authKey);
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
                // db.config.js registers this association with
                // `as: 'vendor'`. Without the alias the include
                // silently matches nothing — was a latent bug in
                // P5-M caught by the cascade integration suite.
                model: getDb().PurchaseOrderVendor,
                as: 'vendor',
                attributes: ['povCompId'],
                required: true,
            }],
        });
        if (!row) return -1;
        // defaultScope on PurchaseOrderVendor filters archived
        // vendors automatically.
        const vendor = row.vendor;
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
                // db.config.js registers this association with
                // `as: 'customer'`. Without the alias the include
                // silently matches nothing — was a latent bug in
                // P5-M caught by the cascade integration suite.
                model: getDb().Customer,
                as: 'customer',
                attributes: ['custCompId'],
                required: true,
            }],
        });
        if (!row) return -1;
        const customer = row.customer;
        if (!customer) return -1;
        const cid = customer.custCompId;
        return typeof cid === 'number' && cid > 0 ? cid : -1;
    } catch (error) {
        log.error({ err: error }, 'auth.getCompanyIdByJobId query failed');
        return -1;
    }
}

/**
 * Resolve an inventory-item id to its owning company id (invitCompId).
 * Used to tenant-check the SECONDARY inventory FK carried by a
 * PurchaseOrderLine (polInvtId), InventoryTransaction (invtInitId), and
 * ProductEntry (pentInvtId): each already scopes on its PARENT FK, but the
 * item FK was unchecked, so a scoped caller could point it at another
 * tenant's item (or a dangling id). Returns -1 for missing/archived.
 */
async function getCompanyIdByInvitId(invitId) {
    const idStr = invitId == null ? '' : String(invitId);
    if (idStr.length === 0 || idStr === '0') return -1;
    try {
        const row = await getDb().InventoryItem.findByPk(invitId, {
            attributes: ['invitCompId'],
        });
        if (!row) return -1;
        const cid = row.invitCompId;
        return typeof cid === 'number' && cid > 0 ? cid : -1;
    } catch (error) {
        log.error({ err: error }, 'auth.getCompanyIdByInvitId query failed');
        return -1;
    }
}

/**
 * For a scoped (non-master) caller, an OPTIONAL secondary inventory-item
 * FK must resolve to the caller's own company. Returns true when it is safe
 * to proceed (the FK is absent/null, or the item belongs to `companyId`),
 * false when it must be rejected (missing item OR cross-tenant). One boolean
 * for both reject cases so callers surface a single generic 400 and the
 * endpoint can't be used to probe another tenant's item ids. Master callers
 * are trusted and should skip this check (as they do the parent-FK check).
 */
async function inventoryFkBelongsTo(invitIdValue, companyId) {
    if (invitIdValue == null) return true;
    const owner = await getCompanyIdByInvitId(invitIdValue);
    return owner === companyId;
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
    // isMaster / getCompanyId swallow LOGICAL failures into a false / -1
    // sentinel (a genuinely unknown key), but re-throw when the DATABASE
    // is unreachable (#377). We catch that here and answer 503 — so a DB
    // outage is reported as an outage, not mistaken for a bad key (403).
    try {
        req.isMaster = await isMaster(authKey);
        if (req.isMaster) {
            // Master keys aren't scoped to a single company. Leave
            // companyId at -1; handlers needing a target scope read
            // it from req.params / req.body / req.query.
            return next();
        }
        req.companyId = await getCompanyId(authKey);
        return next();
    } catch (error) {
        log.error({ err: error }, 'attachAuth: database unavailable');
        return res.status(503).json({ message: 'Service temporarily unavailable.' });
    }
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
    await new Promise((resolve) => {
        attachAuth(req, res, () => resolve());
    });
    return requireAuth(req, res, next);
}

module.exports = {
    isMaster,
    getCompanyId,
    getCompanyIdByCustomerId,
    getCompanyIdByJobId,
    getCompanyIdByPovId,
    getCompanyIdByPohId,
    getCompanyIdByInvitId,
    inventoryFkBelongsTo,
    requireAuthKey,
    attachAuth,
    requireAuth,
    resolveAuth,
    hashKey,
    isDbUnavailable,
    masterFromReq,
    companyIdFromReq,
    // Test-only seam: call with a stub db to drive auth functions
    // through caller-controlled fixtures; call with no args (or null)
    // to restore the production lookup. Production code MUST NOT call
    // this. P5-M.
    _setDbForTesting,
};
