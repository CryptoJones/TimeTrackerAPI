// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { escapeCsvCell } = require('./_csv-escape.js');
const rate = require('../services/rate.js');
const TimeEntry = db.TimeEntry;

// Auth helpers used to live inline here — they now share a single
// source of truth in app/middleware/auth.js. PascalCase aliases
// preserve the existing call sites in the controller body.
const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

const ALLOWED_FIELDS_CREATE = [
    'teCustId', 'teWorkerId', 'teJobId', 'teBillTypeId', 'teDescription',
    'teStartedAt', 'teEndedAt', 'teBillable',
];
const ALLOWED_FIELDS_UPDATE = [
    'teWorkerId', 'teJobId', 'teBillTypeId', 'teDescription', 'teStartedAt',
    'teEndedAt', 'teBillable',
];

function computeMinutes(startedAt, endedAt) {
    if (!startedAt || !endedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.round((end - start) / 60000);
}

/**
 * Parse a date-ish query-string value (e.g. ?from=, ?to=) into a Date,
 * or return null if it can't be parsed. The list + export handlers
 * previously plugged the raw string straight into Sequelize's
 * Op.gte/Op.lte, which works for ISO 8601 but causes Postgres to
 * throw on garbage input — which Sequelize then surfaces as a 500
 * from the controller's catch. The doc comment on those handlers
 * claimed bad dates are "silently dropped"; this helper makes that
 * comment true.
 */
function parseDateOrNull(s) {
    if (typeof s !== 'string' || s.length === 0) return null;
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * Return true when both bounds are non-empty AND parse cleanly AND
 * endedAt is strictly before startedAt. Used by the PATCH handler to
 * reject single-bound updates whose merged interval would invert.
 *
 * The schema-layer refinement on updateTimeEntryBody (#130) catches
 * the both-bounds-in-body case; this helper covers the half the
 * schema can't see — a PATCH that supplies only one of the two
 * bounds and merges against the row's existing value.
 *
 * Equality is NOT inverted (zero-minute entries are legitimate).
 * Unparseable input is NOT inverted (computeMinutes will surface
 * the null-result via its own NaN guard; flagging it here would
 * be a false positive on garbage we'd 400 elsewhere anyway).
 */
function isInvertedRange(startedAt, endedAt) {
    if (!startedAt || !endedAt) return false;
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return end < start;
}

/**
 * Validate the optional worker / job / billtype links against the
 * entry's company and customer. Each is optional; a `null` value
 * (update-only, to unlink) is skipped. Returns `null` when the links are
 * legal, or a `{ status, message }` object the caller sends as-is.
 *
 *   - teWorkerId:   must reference a Worker in `companyId`.
 *   - teJobId:      must reference a Job whose customer sits in
 *     `companyId` AND — when `custId` is known — whose customer IS
 *     `custId`, so time for one client can't be booked against another
 *     client's job.
 *   - teBillTypeId: must reference a BillingType in `companyId` (the
 *     per-entry rate override).
 *
 * Archived rows are filtered by defaultScope and therefore read as
 * "not found" → 400.
 */
async function checkEntryLinks({ teWorkerId, teJobId, teBillTypeId }, companyId, custId) {
    if (teWorkerId !== undefined && teWorkerId !== null) {
        const worker = await db.Worker.findByPk(Number(teWorkerId), {
            attributes: ['workerCompId'],
        });
        if (!worker || worker.workerCompId !== companyId) {
            return { status: 400, message: 'teWorkerId must reference a worker in your company.' };
        }
    }
    if (teJobId !== undefined && teJobId !== null) {
        const job = await db.Job.findByPk(Number(teJobId), {
            attributes: ['jobCustId'],
            include: [{
                model: db.Customer,
                as: 'customer',
                attributes: ['custCompId'],
                required: true,
            }],
        });
        if (!job || !job.customer || job.customer.custCompId !== companyId) {
            return { status: 400, message: 'teJobId must reference a job in your company.' };
        }
        if (custId !== undefined && custId !== null && job.jobCustId !== Number(custId)) {
            return {
                status: 400,
                message: 'teJobId must belong to the same customer as the time entry (teCustId).',
            };
        }
    }
    if (teBillTypeId !== undefined && teBillTypeId !== null) {
        const bt = await db.BillingType.findByPk(Number(teBillTypeId), {
            attributes: ['btCompId'],
        });
        if (!bt || bt.btCompId !== companyId) {
            return { status: 400, message: 'teBillTypeId must reference a billing type in your company.' };
        }
    }
    return null;
}

/**
 * POST /v1/timeentry
 *
 * Create a new time entry for a customer in the auth'd company.
 * Master keys may set teCompId; non-master keys' entries are
 * scoped to their own company.
 */
exports.create = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const isMaster = await IsMaster(authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.body && req.body.teCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify teCompId." });
        }
    } else {
        companyId = await GetCompanyId(authKey);
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (req.body && req.body.teCompId !== undefined &&
            Number(req.body.teCompId) !== companyId) {
            return res.status(403).json({
                message: "Cannot create a time entry for a company you do not belong to.",
            });
        }
    }

    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (body[f] !== undefined) payload[f] = body[f];
    }
    if (!payload.teCustId || !Number.isInteger(Number(payload.teCustId))) {
        return res.status(400).json({ message: "teCustId is required and must be an integer." });
    }
    if (!payload.teStartedAt) {
        return res.status(400).json({ message: "teStartedAt is required (ISO 8601)." });
    }
    payload.teCompId = companyId;
    payload.teArch = false;
    payload.teMinutes = computeMinutes(payload.teStartedAt, payload.teEndedAt);

    let linkError;
    try {
        linkError = await checkEntryLinks(payload, companyId, payload.teCustId);
    } catch (error) {
        log.error({ err: error }, 'TimeEntry worker/job link validation failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (linkError) {
        return res.status(linkError.status).json({ message: linkError.message });
    }

    try {
        const created = await TimeEntry.create(payload);
        return res.status(201).json({ message: "Time entry created.", timeEntry: created });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

const START_FIELDS = [
    'teCustId', 'teWorkerId', 'teJobId', 'teBillTypeId', 'teDescription', 'teBillable',
];

/**
 * POST /v1/timeentry/start — begin an in-flight timer (#396).
 *
 * The server stamps teStartedAt = now and leaves teEndedAt null
 * (teMinutes null) — a live entry to be closed later by /stop. Company
 * scoping and worker/job/billtype link validation mirror create. If a
 * worker is named and already has a running timer, this 409s so a
 * worker never has two clocks going at once.
 */
exports.start = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const isMaster = await IsMaster(authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.body && req.body.teCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify teCompId." });
        }
    } else {
        companyId = await GetCompanyId(authKey);
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (req.body && req.body.teCompId !== undefined &&
            Number(req.body.teCompId) !== companyId) {
            return res.status(403).json({
                message: "Cannot start a timer for a company you do not belong to.",
            });
        }
    }

    const body = req.body || {};
    const payload = {};
    for (const f of START_FIELDS) {
        if (body[f] !== undefined) payload[f] = body[f];
    }
    if (!payload.teCustId || !Number.isInteger(Number(payload.teCustId))) {
        return res.status(400).json({ message: "teCustId is required and must be an integer." });
    }
    payload.teCompId = companyId;
    payload.teArch = false;
    payload.teStartedAt = new Date(); // server clock; timer is now running
    payload.teEndedAt = null;
    payload.teMinutes = null;

    let linkError;
    try {
        linkError = await checkEntryLinks(payload, companyId, payload.teCustId);
    } catch (error) {
        log.error({ err: error }, 'timer start: link validation failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (linkError) {
        return res.status(linkError.status).json({ message: linkError.message });
    }

    // One running timer per worker: reject a second concurrent clock.
    if (payload.teWorkerId != null) {
        let running;
        try {
            running = await TimeEntry.findOne({
                where: { teCompId: companyId, teWorkerId: Number(payload.teWorkerId), teEndedAt: null },
            });
        } catch (error) {
            log.error({ err: error }, 'timer start: running-timer check failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (running) {
            return res.status(409).json({
                message: "This worker already has a running timer.",
                runningId: running.teId,
            });
        }
    }

    try {
        const created = await TimeEntry.create(payload);
        return res.status(201).json({ message: "Timer started.", timeEntry: created });
    } catch (error) {
        log.error({ err: error }, 'timer start: TimeEntry.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/timeentry/:id/stop — stop a running timer (#396).
 *
 * Stamps teEndedAt = now and computes teMinutes. Secure-404 scoped like
 * the other single-entry routes. A timer that's already stopped
 * (teEndedAt set) 409s rather than silently re-clocking.
 */
exports.stop = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let entry;
    try {
        entry = await TimeEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'timer stop: TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!entry || entry.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || entry.teCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    if (entry.teEndedAt) {
        return res.status(409).json({ message: "Timer is already stopped." });
    }

    const endedAt = new Date();
    const minutes = computeMinutes(entry.teStartedAt, endedAt);
    try {
        await entry.update({ teEndedAt: endedAt, teMinutes: minutes });
        return res.status(200).json({ message: "Timer stopped.", timeEntry: entry });
    } catch (error) {
        log.error({ err: error }, 'timer stop: TimeEntry.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/timeentry/:id — fetch a single time entry by id.
 *
 * Scoped: non-master keys may only read entries in their own company.
 */
exports.getById = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let entry;
    try {
        // Eager-load the rate sources so the response can carry the
        // resolved rate + billable amount without extra round-trips:
        // the entry's own BillingType (override) and the worker's
        // default BillingType. required:false — any of these may be
        // absent (nullable FKs) or archived (defaultScope hides them).
        entry = await TimeEntry.findByPk(req.params.id, {
            include: [
                { model: db.BillingType, as: 'billingType', required: false },
                {
                    model: db.Worker,
                    as: 'worker',
                    required: false,
                    include: [{ model: db.BillingType, as: 'defaultBillingType', required: false }],
                },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!entry || entry.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        // Cross-tenant access is reported as 404, not 403 — otherwise
        // a scoped caller can enumerate which TimeEntry ids are
        // populated across the whole tenant table by status code.
        // Same secure-404 pattern as the prior 13 entities (#174
        // through #234).
        if (companyId === -1 || entry.teCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }
    // Computed billing view: the resolved hourly rate and the billable
    // amount (rate × hours, or 0 for non-billable, or null when a rate
    // can't be resolved yet). Derived, not stored — see money.js/rate.js.
    const resolvedRate = rate.resolveHourlyRate(entry);
    return res.status(200).json({
        message: "Found.",
        timeEntry: entry,
        billing: {
            rate: resolvedRate,
            billableAmount: rate.billableAmount(entry, resolvedRate),
        },
    });
};

/**
 * GET /v1/timeentry/bycompany/:id — list time entries for a company.
 *
 * Honors `?customerId=<int>` filter, `?from=<iso>` / `?to=<iso>`
 * date-range filter, and `?limit=<int>` (default 100, max 500).
 */
exports.listByCompany = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const targetCompanyId = Number(req.params.id);
    if (!Number.isInteger(targetCompanyId) || targetCompanyId <= 0) {
        return res.status(400).json({ message: "Invalid company id." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || companyId !== targetCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const where = { teCompId: targetCompanyId };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) {
        where.teCustId = customerId;
    }
    // Date range — use Sequelize.Op.gte/lte. Keep it permissive: bad
    // dates are silently dropped rather than 400'd, so a typo in the
    // query string doesn't break the call. parseDateOrNull guards
    // against `from=not-a-date` reaching Postgres (which would throw
    // and produce a 500); the silent-drop behavior matches the
    // documented contract.
    const Op = db.Sequelize && db.Sequelize.Op;
    const fromDate = parseDateOrNull(req.query.from);
    const toDate = parseDateOrNull(req.query.to);
    if (Op && fromDate) {
        where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.gte]: fromDate });
    }
    if (Op && toDate) {
        where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.lte]: toDate });
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset
        : 0;

    try {
        // Switched to findAndCountAll so the body carries a true total
        // (previously `count` was just the page length — misleading on
        // anything past the first page). Link header builds off the
        // total too.
        const { count, rows } = await TimeEntry.findAndCountAll({
            where,
            limit,
            offset,
            order: [['teStartedAt', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Found.",
            count,
            limit,
            offset,
            timeEntries: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/worker/:id/timeentries — list one worker's time entries (#397).
 *
 * Secure-404 scoped through the worker: a missing / archived /
 * cross-tenant worker id reads the same 404, so a scoped caller can't
 * probe which worker ids exist across the tenant table. Honors
 * ?customerId, ?from / ?to (date range), and pagination — same shape as
 * listByCompany.
 */
exports.listByWorker = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const workerId = Number(req.params.id);
    if (!Number.isInteger(workerId) || workerId <= 0) {
        return res.status(400).json({ message: "Invalid worker id." });
    }

    let worker;
    try {
        // defaultScope hides archived workers → they read as "not found".
        worker = await db.Worker.findByPk(workerId, { attributes: ['workerId', 'workerCompId'] });
    } catch (error) {
        log.error({ err: error }, 'listByWorker: Worker.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!worker) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        if (companyId === -1 || worker.workerCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const where = { teWorkerId: workerId, teCompId: worker.workerCompId };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) {
        where.teCustId = customerId;
    }
    const Op = db.Sequelize && db.Sequelize.Op;
    const fromDate = parseDateOrNull(req.query.from);
    const toDate = parseDateOrNull(req.query.to);
    if (Op && fromDate) {
        where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.gte]: fromDate });
    }
    if (Op && toDate) {
        where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.lte]: toDate });
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset
        : 0;

    try {
        const { count, rows } = await TimeEntry.findAndCountAll({
            where,
            limit,
            offset,
            order: [['teStartedAt', 'DESC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Found.",
            workerId,
            count,
            limit,
            offset,
            timeEntries: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'listByWorker: TimeEntry.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * PATCH /v1/timeentry/:id — partial update.
 *
 * Only ALLOWED_FIELDS_UPDATE may be patched. teCompId / teCustId /
 * teArch / teMinutes are server-managed and not user-settable here.
 */
exports.update = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let entry;
    try {
        entry = await TimeEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!entry || entry.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        // Secure-404 on PATCH for the same reason as GET.
        if (companyId === -1 || entry.teCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const body = req.body || {};
    const updates = {};
    for (const f of ALLOWED_FIELDS_UPDATE) {
        if (body[f] !== undefined) updates[f] = body[f];
    }
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No updatable fields supplied." });
    }
    // Recompute minutes if either bound changed.
    if (updates.teStartedAt !== undefined || updates.teEndedAt !== undefined) {
        const mergedStart = updates.teStartedAt !== undefined
            ? updates.teStartedAt : entry.teStartedAt;
        const mergedEnd = updates.teEndedAt !== undefined
            ? updates.teEndedAt : entry.teEndedAt;
        // Inverted-range guard for the single-bound PATCH case. The
        // schema-layer refinement in updateTimeEntryBody (#130) only
        // sees fields present in the request body, so a PATCH that
        // supplies only one bound can't be validated there — the
        // row's existing value lives in the DB. Reject merged
        // end < start at 400 instead of silently dropping `teMinutes`
        // to null and storing a row whose clocked-out-before-clocked-
        // in timestamps look correct but whose duration column is
        // blank.
        if (isInvertedRange(mergedStart, mergedEnd)) {
            return res.status(400).json({
                message: 'teEndedAt must be at or after teStartedAt.',
            });
        }
        updates.teMinutes = computeMinutes(mergedStart, mergedEnd);
    }

    let linkError;
    try {
        linkError = await checkEntryLinks(updates, entry.teCompId, entry.teCustId);
    } catch (error) {
        log.error({ err: error }, 'TimeEntry worker/job link validation failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (linkError) {
        return res.status(linkError.status).json({ message: linkError.message });
    }

    try {
        await entry.update(updates);
        return res.status(200).json({ message: "Updated.", timeEntry: entry });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * DELETE /v1/timeentry/:id — soft-delete (sets teArch = true).
 *
 * Time entries are never physically removed via the API.
 */
exports.remove = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let entry;
    try {
        entry = await TimeEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!entry || entry.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await IsMaster(authKey);
    if (!isMaster) {
        const companyId = await GetCompanyId(authKey);
        // Secure-404 on DELETE for the same reason as GET / PATCH.
        if (companyId === -1 || entry.teCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    try {
        await entry.update({ teArch: true });
        return res.status(200).json({ message: "Archived.", id: entry.teId });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry archive failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/timeentry/export.csv?companyId=&customerId=&from=&to=
 *
 * CSV dump of time entries. The natural invoicing flow:
 *   - filter by customer + date range
 *   - export rows
 *   - feed into spreadsheet / accounting tool
 *
 * Auth shape mirrors /v1/customer/export.csv: master must specify
 * companyId, non-master is auto-scoped. Same 5000-row cap with the
 * trailing `# truncated` comment if exceeded.
 *
 * Date range is permissive on bad input (silent drop) to match the
 * existing listByCompany behavior — a typo'd `from` query param
 * shouldn't 400 a long-running export script.
 */
exports.exportCsv = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isMasterKey;
    try {
        isMasterKey = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!" });
    }

    let effectiveCompanyId;
    if (isMasterKey) {
        const qCompanyId = Number(req.query.companyId);
        if (!Number.isInteger(qCompanyId) || qCompanyId <= 0) {
            return res.status(400).json({
                message: "Master keys must specify companyId on export.csv.",
            });
        }
        effectiveCompanyId = qCompanyId;
    } else {
        let authKeyCompanyId;
        try {
            authKeyCompanyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (authKeyCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        const qCompanyId = req.query.companyId !== undefined ? Number(req.query.companyId) : null;
        if (qCompanyId !== null && qCompanyId !== authKeyCompanyId) {
            return res.status(403).json({
                message: "Cannot export time entries for a company you do not belong to.",
            });
        }
        effectiveCompanyId = authKeyCompanyId;
    }

    const where = { teCompId: effectiveCompanyId };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) {
        where.teCustId = customerId;
    }
    const Op = db.Sequelize && db.Sequelize.Op;
    // Same parseDateOrNull guard as listByCompany — silent-drop on
    // bad input rather than 500 from Postgres.
    const fromDate = parseDateOrNull(req.query.from);
    const toDate = parseDateOrNull(req.query.to);
    if (Op && fromDate) {
        where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.gte]: fromDate });
    }
    if (Op && toDate) {
        where.teStartedAt = Object.assign(where.teStartedAt || {}, { [Op.lte]: toDate });
    }

    const HARD_CAP = 5000;
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, HARD_CAP)
        : HARD_CAP;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset
        : 0;

    let rows;
    try {
        rows = await TimeEntry.findAll({
            where,
            limit: limit + 1,
            offset,
            order: [['teStartedAt', 'DESC']],
        });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findAll for CSV export failed');
        return res.status(500).json({ message: "Error!" });
    }

    const truncated = rows.length > limit;
    if (truncated) rows = rows.slice(0, limit);

    const FIELDS = [
        'teId', 'teCustId', 'teCompId',
        'teStartedAt', 'teEndedAt', 'teMinutes',
        'teBillable', 'teDescription',
    ];
    // CSV-formula-injection mitigation lives in the shared helper —
    // see app/controllers/_csv-escape.js. Both export endpoints
    // (timeentry + customer) call into it, so the OWASP mitigation
    // stays in lockstep across the API; future export endpoints
    // get the same guardrail by default.
    const escape = escapeCsvCell;
    const lines = [];
    lines.push(FIELDS.join(','));
    for (const r of rows) {
        lines.push(FIELDS.map((f) => escape(r[f])).join(','));
    }
    if (truncated) {
        lines.push(`# truncated at ${limit} rows; re-call with offset=${offset + limit} to continue`);
    }
    const body = lines.join('\r\n') + '\r\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',
        `attachment; filename="timeentries-company-${effectiveCompanyId}.csv"`);
    return res.status(200).send(body);
};

// Exposed for unit testing.
exports._internals = { computeMinutes, isInvertedRange, parseDateOrNull, IsMaster, GetCompanyId };
