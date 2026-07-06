// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { buildCsv } = require('./_csv-escape.js');
const rate = require('../services/rate.js');
const { applyAction } = require('../services/approval.js');
const { lockReason } = require('../services/time-lock.js');
const rbac = require('../services/rbac.js');
const { nextStep, canApproveAt } = require('../services/approval-chain.js');
const { buildApprovalDigest } = require('../services/approval-reminders.js');
const { sendMail } = require('../services/mailer.js');
const { createTimeEntryBody } = require('../schemas/timeentry.schema.js');
const TimeEntry = db.TimeEntry;

// Auth helpers used to live inline here — they now share a single
// source of truth in app/middleware/auth.js. PascalCase aliases
// preserve the existing call sites in the controller body.
const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
// #374: prefer attachAuth's resolved context in the handlers below; the
// raw IsMaster / GetCompanyId above are retained only for the _internals
// test seam. (Every call site is inside an exported handler with req in
// scope; the req-less helpers — createOneEntry etc. — take companyId as a
// param and never call these.)
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

const ALLOWED_FIELDS_CREATE = [
    'teCustId', 'teWorkerId', 'teJobId', 'teBillTypeId', 'teDescription',
    'teStartedAt', 'teEndedAt', 'teBillable', 'teTags', 'teTaskId',
];
const ALLOWED_FIELDS_UPDATE = [
    'teWorkerId', 'teJobId', 'teBillTypeId', 'teDescription', 'teStartedAt',
    'teEndedAt', 'teBillable', 'teTags', 'teTaskId',
];

function computeMinutes(startedAt, endedAt) {
    if (!startedAt || !endedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = new Date(endedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.round((end - start) / 60000);
}

/** The company's locked-period cutoff (#441), or null. */
async function companyLockDate(companyId) {
    if (!Number.isInteger(companyId) || companyId <= 0) return null;
    if (!db.Company || typeof db.Company.findByPk !== 'function') return null;
    const company = await db.Company.findByPk(companyId, { attributes: ['compTimeLockDate'] });
    return company ? company.compTimeLockDate : null;
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
async function checkEntryLinks({ teWorkerId, teJobId, teBillTypeId, teTaskId }, companyId, custId) {
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
    if (teTaskId !== undefined && teTaskId !== null) {
        const task = await db.Task.findByPk(Number(teTaskId), {
            attributes: ['taskJobId'],
            include: [{
                model: db.Job, as: 'job', attributes: ['jobCustId'], required: true,
                include: [{ model: db.Customer, as: 'customer', attributes: ['custCompId'], required: true }],
            }],
        });
        if (!task || !task.job || !task.job.customer || task.job.customer.custCompId !== companyId) {
            return { status: 400, message: 'teTaskId must reference a task in your company.' };
        }
        // If the entry also names a job, the task must be under that job.
        if (teJobId !== undefined && teJobId !== null && task.taskJobId !== Number(teJobId)) {
            return { status: 400, message: 'teTaskId must belong to the job (teJobId).' };
        }
    }
    return null;
}

/**
 * Create one time entry for a resolved company (#379). Returns
 * { created } on success or { error: { status, message } } on a business
 * validation failure; throws on a DB error (the caller maps to 500).
 * Shared by the single-create handler and the bulk importer so both apply
 * identical validation, link checks, and the locked-period guard.
 */
async function createOneEntry(companyId, body) {
    const src = body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS_CREATE) {
        if (src[f] !== undefined) payload[f] = src[f];
    }
    if (!payload.teCustId || !Number.isInteger(Number(payload.teCustId))) {
        return { error: { status: 400, message: "teCustId is required and must be an integer." } };
    }
    if (!payload.teStartedAt) {
        return { error: { status: 400, message: "teStartedAt is required (ISO 8601)." } };
    }
    payload.teCompId = companyId;
    payload.teArch = false;
    payload.teMinutes = computeMinutes(payload.teStartedAt, payload.teEndedAt);

    // Multi-tenant scope (#373): the customer MUST belong to the effective
    // company — otherwise a scoped key could book time against another
    // tenant's customer. (Archived customers read as not-found via
    // defaultScope → 400.)
    const customer = await db.Customer.findByPk(Number(payload.teCustId), { attributes: ['custCompId'] });
    if (!customer || customer.custCompId !== companyId) {
        return { error: { status: 400, message: "teCustId must reference a customer in your company." } };
    }

    const linkError = await checkEntryLinks(payload, companyId, payload.teCustId);
    if (linkError) {
        return { error: { status: linkError.status, message: linkError.message } };
    }

    // Locked-period guard (#441): can't create time in a closed period.
    const lockDate = await companyLockDate(companyId);
    const createLock = lockReason({ approvalStatus: 'open', startedAt: payload.teStartedAt, lockDate });
    if (createLock) {
        return { error: { status: 409, message: createLock } };
    }

    const created = await TimeEntry.create(payload);
    return { created };
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

    const isMaster = await MasterFromReq(req, authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.body && req.body.teCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify teCompId." });
        }
    } else {
        companyId = await CompanyIdFromReq(req, authKey);
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

    let result;
    try {
        result = await createOneEntry(companyId, req.body || {});
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.create failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (result.error) {
        return res.status(result.error.status).json({ message: result.error.message });
    }
    return res.status(201).json({ message: "Time entry created.", timeEntry: result.created });
};

/**
 * POST /v1/timeentry/bulk — import many entries in one call (#379). Each
 * row is validated + created independently, so a bad row fails on its own
 * without aborting the rest. Returns a per-row result array and counts.
 * Status: 201 all-ok, 207 partial, 400 all-failed.
 */
exports.bulk = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.body && req.body.teCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify teCompId." });
        }
    } else {
        companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const entries = (req.body && Array.isArray(req.body.entries)) ? req.body.entries : [];
    const results = [];
    let created = 0;
    let failed = 0;

    for (let i = 0; i < entries.length; i++) {
        const parsed = createTimeEntryBody.safeParse(entries[i]);
        if (!parsed.success) {
            failed += 1;
            results.push({ index: i, ok: false, status: 400, message: "Validation error." });
            continue;
        }
        if (!isMaster && parsed.data.teCompId !== undefined && Number(parsed.data.teCompId) !== companyId) {
            failed += 1;
            results.push({ index: i, ok: false, status: 403, message: "Cannot create a time entry for a company you do not belong to." });
            continue;
        }

        let r;
        try {
            r = await createOneEntry(companyId, parsed.data);
        } catch (error) {
            log.error({ err: error, index: i }, 'bulk: create failed');
            r = { error: { status: 500, message: "Error!" } };
        }
        if (r.error) {
            failed += 1;
            results.push({ index: i, ok: false, status: r.error.status, message: r.error.message });
        } else {
            created += 1;
            results.push({ index: i, ok: true, teId: r.created.teId });
        }
    }

    const status = failed === 0 ? 201 : (created === 0 ? 400 : 207);
    return res.status(status).json({ message: "Bulk import processed.", requested: entries.length, created, failed, results });
};

const START_FIELDS = [
    'teCustId', 'teWorkerId', 'teJobId', 'teBillTypeId', 'teDescription', 'teBillable', 'teTags', 'teTaskId',
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

    const isMaster = await MasterFromReq(req, authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(req.body && req.body.teCompId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify teCompId." });
        }
    } else {
        companyId = await CompanyIdFromReq(req, authKey);
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

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
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
 * POST /v1/timeentry/:id/approval — advance an entry through the
 * approval workflow (#440). Body { action: submit|approve|reject }.
 * Secure-404 scoped; 409 on an illegal transition from the current state.
 */
exports.approval = async (req, res) => {
    if (!req.user && !req.get('authKey')) {
        return res.status(403).json({ message: "Authorization required." });
    }

    let entry;
    try {
        entry = await TimeEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'approval: TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!entry || entry.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    if (req.user) {
        // A signed-in user acts within its own company (secure-404) and needs
        // the `time:approve` permission (manager+).
        if (entry.teCompId !== req.user.userCompId) {
            return res.status(404).json({ message: "Not found." });
        }
        if (!rbac.hasPermission(req.user.userRole, 'time:approve')) {
            return res.status(403).json({ message: "Insufficient role to approve time entries." });
        }
        // Separation of duties: a user may not approve their OWN logged time
        // (the worker the entry belongs to is linked to this user, #448).
        if (entry.teWorkerId != null) {
            let worker;
            try {
                worker = await db.Worker.findByPk(entry.teWorkerId, { attributes: ['workerUserId'] });
            } catch (error) {
                log.error({ err: error }, 'approval: Worker lookup failed');
                return res.status(500).json({ message: "Error!" });
            }
            if (worker && worker.workerUserId === req.user.userId) {
                return res.status(403).json({ message: "You cannot approve your own time entry." });
            }
        }
    } else {
        const authKey = req.get('authKey');
        const isMaster = await MasterFromReq(req, authKey);
        if (!isMaster) {
            const companyId = await CompanyIdFromReq(req, authKey);
            if (companyId === -1 || entry.teCompId !== companyId) {
                return res.status(404).json({ message: "Not found." });
            }
        }
    }

    const action = req.body && req.body.action;
    const result = applyAction(entry.teApprovalStatus, action);
    if (result.error) {
        return res.status(409).json({ message: result.error });
    }

    const updates = { teApprovalStatus: result.status };

    if (action === 'approve') {
        // Multi-level approval-chain enforcement (#443/#6). A signed-in user
        // must clear each configured level IN ORDER — one `approve` advances
        // the entry by a single level, and it only becomes 'approved' once the
        // final level is cleared. An API key keeps full authority (one approve
        // → approved, marking the chain fully cleared).
        let chain = null;
        try {
            chain = await db.ApprovalChain.findOne({
                where: { apchCompId: entry.teCompId, apchActive: true },
                order: [['apchId', 'ASC']],
            });
        } catch (error) {
            log.error({ err: error }, 'approval: ApprovalChain lookup failed');
            return res.status(500).json({ message: "Error!" });
        }
        if (chain && req.user) {
            if (!canApproveAt(chain.apchLevels, entry.teApprovalLevel, req.user.userRole)) {
                return res.status(403).json({
                    message: "Your role cannot approve the next required level of this timesheet.",
                });
            }
            const newLevel = entry.teApprovalLevel + 1;
            updates.teApprovalLevel = newLevel;
            // Stay 'submitted' until every level is cleared.
            updates.teApprovalStatus = nextStep(chain.apchLevels, newLevel).done ? 'approved' : 'submitted';
        } else if (chain) {
            // API key / master: full authority — record the chain as fully cleared.
            updates.teApprovalLevel = chain.apchLevels.length;
        }
    } else if (action === 'submit' || action === 'reject') {
        // Restart the chain: the next review begins at level 0.
        updates.teApprovalLevel = 0;
    }

    try {
        await entry.update(updates);
        return res.status(200).json({ message: "Approval updated.", timeEntry: entry });
    } catch (error) {
        log.error({ err: error }, 'approval: TimeEntry.update failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/timeentry/:id/copy — duplicate an entry's "what" into a fresh
 * entry (#399): same customer / worker / job / billtype / description /
 * billable / tags, but a new time. The optional body sets teStartedAt /
 * teEndedAt (defaults: start now, in-flight). The copy is always open /
 * un-invoiced. Secure-404 scoped; 409 if the copy lands in a locked
 * period.
 */
exports.copy = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let src;
    try {
        src = await TimeEntry.findByPk(req.params.id);
    } catch (error) {
        log.error({ err: error }, 'copy: TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!src || src.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || src.teCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const body = req.body || {};
    const startedAt = body.teStartedAt || new Date();
    const endedAt = body.teEndedAt !== undefined ? body.teEndedAt : null;
    if (isInvertedRange(startedAt, endedAt)) {
        return res.status(400).json({ message: 'teEndedAt must be at or after teStartedAt.' });
    }

    let lock;
    try {
        const lockDate = await companyLockDate(src.teCompId);
        lock = lockReason({ approvalStatus: 'open', startedAt, lockDate });
    } catch (error) {
        log.error({ err: error }, 'copy: lock check failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (lock) {
        return res.status(409).json({ message: lock });
    }

    const payload = {
        teCustId: src.teCustId,
        teCompId: src.teCompId,
        teWorkerId: src.teWorkerId,
        teJobId: src.teJobId,
        teBillTypeId: src.teBillTypeId,
        teDescription: src.teDescription,
        teBillable: src.teBillable,
        teTags: src.teTags,
        teStartedAt: startedAt,
        teEndedAt: endedAt,
        teMinutes: computeMinutes(startedAt, endedAt),
        teArch: false,
        // teApprovalStatus defaults 'open'; teInvJobId stays null (unbilled).
    };
    try {
        const created = await TimeEntry.create(payload);
        return res.status(201).json({ message: "Time entry copied.", timeEntry: created });
    } catch (error) {
        log.error({ err: error }, 'copy: TimeEntry.create failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/timeentry/approval-reminders — email a digest of time entries
 * stuck in "submitted" past a threshold to an approver (#442). Bridges
 * the approval workflow (#440) to the mail service (#68). Company-scoped
 * (master keys pass companyId); the recipient is the request's `to`.
 */
exports.approvalReminders = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    const body = req.body || {};
    const isMaster = await MasterFromReq(req, authKey);
    let companyId;
    if (isMaster) {
        companyId = Number(body.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            return res.status(400).json({ message: "Master-key requests must specify companyId." });
        }
    } else {
        companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const olderThanDays = Number.isInteger(body.olderThanDays) && body.olderThanDays > 0 ? body.olderThanDays : 7;
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - olderThanDays);
    const cutoff = cutoffDate.toISOString().slice(0, 10);
    const Op = db.Sequelize && db.Sequelize.Op;

    let entries;
    try {
        const where = { teCompId: companyId, teApprovalStatus: 'submitted' };
        if (Op) where.teStartedAt = { [Op.lte]: cutoff };
        entries = await db.TimeEntry.findAll({
            where,
            attributes: ['teId', 'teStartedAt', 'teMinutes', 'teWorkerId', 'teApprovalStatus'],
            include: [{ model: db.Worker, as: 'worker', required: false, attributes: ['workerId', 'workerFName', 'workerLName'] }],
            order: [['teStartedAt', 'ASC']],
        });
    } catch (error) {
        log.error({ err: error }, 'approval reminders: TimeEntry.findAll failed');
        return res.status(500).json({ message: "Error!" });
    }

    const digest = buildApprovalDigest(entries, { olderThanDays });
    let reminded = false;
    if (digest.count > 0) {
        try {
            await sendMail({ to: body.to, subject: digest.subject, text: digest.text });
            reminded = true;
        } catch (error) {
            log.error({ err: error }, 'approval reminders: sendMail failed');
            return res.status(500).json({ message: "Error!" });
        }
    }
    return res.status(200).json({
        message: reminded ? "Approval reminder sent." : "No pending approvals over the threshold.",
        companyId,
        pending: digest.count,
        reminded,
        to: body.to,
    });
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
                // Job carries the per-project flat rate (#410) — the middle
                // tier of rate resolution.
                { model: db.Job, as: 'job', required: false, attributes: ['jobId', 'jobFlatRate'] },
                {
                    model: db.Worker,
                    as: 'worker',
                    required: false,
                    include: [{ model: db.BillingType, as: 'defaultBillingType', required: false }, { model: db.Role, as: 'role', required: false }],
                },
                // Client rate card (#413) — resolveHourlyRate reads entry.customer.
                { model: db.Customer, as: 'customer', required: false, attributes: ['custId', 'custDefaultRate'] },
                // Task rate (#411) — the most-specific rate tier.
                { model: db.Task, as: 'task', required: false, attributes: ['taskId', 'taskRate'] },
            ],
        });
    } catch (error) {
        log.error({ err: error }, 'TimeEntry.findByPk failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!entry || entry.teArch) {
        return res.status(404).json({ message: "Not found." });
    }

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
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

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || companyId !== targetCompanyId) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const where = { teCompId: targetCompanyId };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) {
        where.teCustId = customerId;
    }
    // Tag filter (#406): entries whose teTags JSONB array contains the tag.
    if (db.Sequelize && db.Sequelize.Op && typeof req.query.tag === 'string' && req.query.tag) {
        where.teTags = { [db.Sequelize.Op.contains]: [req.query.tag] };
    }
    // Approval-status filter (#440).
    if (typeof req.query.approvalStatus === 'string' && req.query.approvalStatus) {
        where.teApprovalStatus = req.query.approvalStatus;
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

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1 || worker.workerCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    const where = { teWorkerId: workerId, teCompId: worker.workerCompId };
    const customerId = Number(req.query.customerId);
    if (Number.isInteger(customerId) && customerId > 0) {
        where.teCustId = customerId;
    }
    // Tag filter (#406): entries whose teTags JSONB array contains the tag.
    if (db.Sequelize && db.Sequelize.Op && typeof req.query.tag === 'string' && req.query.tag) {
        where.teTags = { [db.Sequelize.Op.contains]: [req.query.tag] };
    }
    // Approval-status filter (#440).
    if (typeof req.query.approvalStatus === 'string' && req.query.approvalStatus) {
        where.teApprovalStatus = req.query.approvalStatus;
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

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        // Secure-404 on PATCH for the same reason as GET.
        if (companyId === -1 || entry.teCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    // Locked-period / approved guard (#441): a frozen entry can't be
    // edited, nor moved into a closed period.
    let updateLock;
    try {
        const lockDate = await companyLockDate(entry.teCompId);
        updateLock = lockReason({ approvalStatus: entry.teApprovalStatus, startedAt: entry.teStartedAt, lockDate })
            || (req.body && req.body.teStartedAt
                ? lockReason({ approvalStatus: 'open', startedAt: req.body.teStartedAt, lockDate })
                : null);
    } catch (error) {
        log.error({ err: error }, 'update: lock check failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (updateLock) {
        return res.status(409).json({ message: updateLock });
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

    const isMaster = await MasterFromReq(req, authKey);
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        // Secure-404 on DELETE for the same reason as GET / PATCH.
        if (companyId === -1 || entry.teCompId !== companyId) {
            return res.status(404).json({ message: "Not found." });
        }
    }

    // Locked-period / approved guard (#441): frozen entries can't be deleted.
    let removeLock;
    try {
        const lockDate = await companyLockDate(entry.teCompId);
        removeLock = lockReason({ approvalStatus: entry.teApprovalStatus, startedAt: entry.teStartedAt, lockDate });
    } catch (error) {
        log.error({ err: error }, 'remove: lock check failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (removeLock) {
        return res.status(409).json({ message: removeLock });
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
        isMasterKey = await MasterFromReq(req, authKey);
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
            authKeyCompanyId = await CompanyIdFromReq(req, authKey);
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
    const note = truncated
        ? `# truncated at ${limit} rows; re-call with offset=${offset + limit} to continue`
        : null;
    const body = buildCsv(FIELDS, rows, note);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',
        `attachment; filename="timeentries-company-${effectiveCompanyId}.csv"`);
    return res.status(200).send(body);
};

// Exposed for unit testing.
exports._internals = { computeMinutes, isInvertedRange, parseDateOrNull, IsMaster, GetCompanyId };
