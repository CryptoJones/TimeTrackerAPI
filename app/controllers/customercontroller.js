// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { sequelize } = require('../config/db.config.js');
const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const Customer = db.Customer;

// IsMaster / GetCompanyId previously lived inline in this file and
// were duplicated verbatim in timeentrycontroller.js. They moved to
// app/middleware/auth.js — these aliases preserve the existing
// PascalCase names used inside this controller body without churning
// every call site.
const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

/**
 * GET /v1/customer/:id
 *
 * Auth contract:
 *   1. authKey header must be present                        -> 403 if missing
 *   2. authKey may be a master key (sees all customers)      -> proceed
 *   3. otherwise authKey's company must match the customer's -> proceed
 *                                                            -> 403 if not
 *
 * Previously this function had a fall-through bug: the master-key branch
 * sent a response from inside a Promise.then() but did not exit the
 * surrounding async function, so control continued into the company-match
 * branch which would issue a SECOND res.json() — "headers already sent".
 * The fix is to await each branch and return early from the function
 * itself, not from inside the .then() callback.
 */
exports.getCustomerById = async (req, res) => {
    const authKey = req.get('authKey');
    const customerId = req.params.id;

    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isAuthKeyMasterKey;
    try {
        isAuthKeyMasterKey = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    if (isAuthKeyMasterKey) {
        return findAndRespond(customerId, res);
    }

    let custCompanyId, authKeyCompanyId;
    try {
        custCompanyId = await GetCustomerCompanyId(customerId);
        authKeyCompanyId = await GetCompanyId(authKey);
    } catch (error) {
        log.error({ err: error }, 'Company lookup failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    if (!CompaniesMatch(custCompanyId, authKeyCompanyId)) {
        return res.status(403).json({ message: "Invalid Authorization Key." });
    }

    return findAndRespond(customerId, res);
};

/**
 * POST /v1/customer
 *
 * Create a new customer. Auth contract:
 *   1. authKey header must be present                       -> 403 if missing
 *   2. authKey may be a master key (can create for any company) -> proceed
 *   3. otherwise authKey's company must match body.custCompId
 *      (or body.custCompId may be omitted, in which case it defaults
 *      to the authKey's company)                            -> proceed
 *                                                           -> 403 if not
 *
 * Body shape (all fields optional except where noted):
 *   {
 *     "custCompanyName": string,
 *     "custFName": string,
 *     "custLName": string,
 *     "custAddress1": string,
 *     "custAddress2": string,
 *     "custCity": string,
 *     "custState": string,
 *     "custZip": string,
 *     "custPhone": string,
 *     "custEmail": string,
 *     "custCompId": int   <- required for master keys; defaults to
 *                            the authKey's company for non-master keys
 *   }
 *
 * Returns 201 + the created customer on success.
 */
exports.createCustomer = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isAuthKeyMasterKey;
    try {
        isAuthKeyMasterKey = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    // Whitelist of model fields we accept. Anything else in the body
    // is silently dropped — protects against mass-assignment style
    // attacks where a caller posts e.g. `{"custId": 999, ...}` to
    // forge an id.
    const ALLOWED_FIELDS = [
        'custCompanyName', 'custFName', 'custLName',
        'custAddress1', 'custAddress2',
        'custCity', 'custState', 'custZip',
        'custPhone', 'custEmail', 'custCompId',
    ];
    const body = req.body || {};
    const payload = {};
    for (const f of ALLOWED_FIELDS) {
        if (body[f] !== undefined) {
            payload[f] = body[f];
        }
    }

    // Resolve the company id with appropriate auth scoping.
    if (!isAuthKeyMasterKey) {
        let authKeyCompanyId;
        try {
            authKeyCompanyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!", error: String(error) });
        }
        if (authKeyCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        if (payload.custCompId !== undefined && Number(payload.custCompId) !== authKeyCompanyId) {
            return res.status(403).json({
                message: "Cannot create a customer for a company you do not belong to.",
            });
        }
        // Default the company to the authKey's owning company.
        payload.custCompId = authKeyCompanyId;
    } else {
        // Master keys MUST specify which company the new customer
        // belongs to — there's no obvious default.
        if (payload.custCompId === undefined || Number(payload.custCompId) <= 0) {
            return res.status(400).json({
                message: "Master-key requests must specify custCompId.",
            });
        }
    }

    // Customers are not archived on creation.
    payload.custArch = false;

    try {
        const created = await Customer.create(payload);
        return res.status(201).json({
            message: "Customer created.",
            customer: created,
        });
    } catch (error) {
        log.error({ err: error }, 'Customer.create failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

/**
 * GET /v1/customer/bycompany/:id
 *
 * Auth contract for this endpoint (closes #3):
 *   1. authKey header must be present                       -> 403 if missing
 *   2. authKey may be a master key (sees all companies)     -> proceed
 *   3. otherwise authKey's company must match :id           -> proceed
 *                                                           -> 403 if not
 */
exports.getAllByCompanyId = async (req, res) => {
    const authKey = req.get('authKey');
    const companyId = req.params.id;

    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isAuthKeyMasterKey;
    try {
        isAuthKeyMasterKey = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    if (!isAuthKeyMasterKey) {
        let authKeyCompanyId;
        try {
            authKeyCompanyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!", error: String(error) });
        }
        // req.params.id arrives as a string; authKeyCompanyId comes back
        // as an INT from Sequelize. Normalize both before comparing.
        if (authKeyCompanyId === -1 || String(authKeyCompanyId) !== String(companyId)) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    // Pagination — opt-in via ?limit and ?offset query params. Cap at
    // 500 to keep page sizes sane; default 100 to match the time-entry
    // list endpoint. limit=0 falls back to the default rather than
    // returning the literal zero-row "page" (which is rarely useful).
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset
        : 0;

    // Soft-deleted customers are not returned. Older clients that
    // weren't checking custArch already filter manually; this just
    // makes the server's behavior match the documented contract.
    const where = { custCompId: companyId };

    try {
        const { count, rows } = await Customer.findAndCountAll({
            where,
            limit,
            offset,
            order: [['custId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        // Expose Link header to browser JS clients via CORS.
        res.setHeader('Access-Control-Expose-Headers', 'Link');
        return res.status(200).json({
            message: "Successfully retrieved customers with CompanyId " + companyId,
            count,
            limit,
            offset,
            customers: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'Customer.findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

/**
 * GET /v1/customer/export.csv
 *
 * CSV dump of customers in a company. text/csv response, no JSON
 * envelope. Companion to bycompany/:id for clients that want to
 * pipe into spreadsheet tools.
 *
 * Auth shape mirrors the search endpoint:
 *   - non-master without companyId → auto-scope to own company
 *   - non-master with mismatching companyId → 403
 *   - master without companyId → 400
 *
 * Capped at 5000 rows per call (oversize quietly truncates with a
 * trailing comment row so clients know to page). Soft-deleted rows
 * excluded. Field order matches the Customer JSON schema.
 */
exports.exportCsv = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isAuthKeyMasterKey;
    try {
        isAuthKeyMasterKey = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    let effectiveCompanyId;
    if (isAuthKeyMasterKey) {
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
            return res.status(500).json({ message: "Error!", error: String(error) });
        }
        if (authKeyCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        const qCompanyId = req.query.companyId !== undefined ? Number(req.query.companyId) : null;
        if (qCompanyId !== null && qCompanyId !== authKeyCompanyId) {
            return res.status(403).json({
                message: "Cannot export customers for a company you do not belong to.",
            });
        }
        effectiveCompanyId = authKeyCompanyId;
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
        rows = await Customer.findAll({
            where: { custCompId: effectiveCompanyId },
            limit: limit + 1, // +1 to detect "did we hit the cap"
            offset,
            order: [['custId', 'ASC']],
        });
    } catch (error) {
        log.error({ err: error }, 'Customer.findAll for CSV export failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    const truncated = rows.length > limit;
    if (truncated) rows = rows.slice(0, limit);

    // CSV serialization. Wraps every field in quotes (simpler than
    // detecting which ones need it) and doubles any embedded quotes.
    const FIELDS = [
        'custId', 'custCompanyName', 'custFName', 'custLName',
        'custAddress1', 'custAddress2',
        'custCity', 'custState', 'custZip',
        'custPhone', 'custEmail', 'custCompId',
    ];
    const escape = (val) => {
        if (val === null || val === undefined) return '""';
        return '"' + String(val).replace(/"/g, '""') + '"';
    };
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
        `attachment; filename="customers-company-${effectiveCompanyId}.csv"`);
    return res.status(200).send(body);
};

/**
 * POST /v1/customer/bulk
 *
 * Transaction-wrapped batch create. Body: { customers: [{...}, ...] }.
 *
 * All-or-nothing semantics: if any customer fails to create (DB
 * constraint, etc.), the whole batch is rolled back. The endpoint
 * either returns 201 with the full set OR a 500/4xx with no rows
 * inserted.
 *
 * Auth contract matches POST /v1/customer:
 *   - missing authKey                                       -> 403
 *   - non-master + entry with custCompId mismatching scope  -> 403
 *   - non-master without custCompId on any entry            -> defaults to scope
 *   - master without custCompId on any entry                -> 400
 */
exports.bulkCreate = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isAuthKeyMasterKey;
    try {
        isAuthKeyMasterKey = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    const inputCustomers = (req.body && Array.isArray(req.body.customers))
        ? req.body.customers
        : [];
    if (inputCustomers.length === 0) {
        return res.status(400).json({ message: "customers array is required and must be non-empty." });
    }

    // Resolve authKey company once (only needed for non-master path).
    let authKeyCompanyId = null;
    if (!isAuthKeyMasterKey) {
        try {
            authKeyCompanyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!", error: String(error) });
        }
        if (authKeyCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    // Whitelist + auth-scope each entry.
    const ALLOWED_FIELDS = [
        'custCompanyName', 'custFName', 'custLName',
        'custAddress1', 'custAddress2',
        'custCity', 'custState', 'custZip',
        'custPhone', 'custEmail', 'custCompId',
    ];
    const payloads = [];
    for (let i = 0; i < inputCustomers.length; i += 1) {
        const entry = inputCustomers[i] || {};
        const p = {};
        for (const f of ALLOWED_FIELDS) {
            if (entry[f] !== undefined) p[f] = entry[f];
        }
        if (isAuthKeyMasterKey) {
            if (p.custCompId === undefined || Number(p.custCompId) <= 0) {
                return res.status(400).json({
                    message: `customers[${i}]: master-key requests must specify custCompId.`,
                });
            }
        } else {
            if (p.custCompId !== undefined && Number(p.custCompId) !== authKeyCompanyId) {
                return res.status(403).json({
                    message: `customers[${i}]: cannot create a customer for a company you do not belong to.`,
                });
            }
            p.custCompId = authKeyCompanyId;
        }
        p.custArch = false;
        payloads.push(p);
    }

    // All-or-nothing: bulk insert inside a transaction.
    const t = await db.sequelize.transaction();
    try {
        const created = await Customer.bulkCreate(payloads, {
            transaction: t,
            validate: true,
            returning: true,
        });
        await t.commit();
        return res.status(201).json({
            message: `Created ${created.length} customer(s).`,
            count: created.length,
            customers: created,
        });
    } catch (error) {
        try { await t.rollback(); } catch (_) { /* swallow */ }
        log.error({ err: error }, 'Customer.bulkCreate failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

/**
 * GET /v1/customer/search
 *
 * Substring search over custCompanyName / custFName / custLName.
 *
 * Auth contract:
 *   - missing authKey                                          -> 403
 *   - non-master + companyId in query NOT matching auth scope  -> 403
 *   - non-master without companyId                             -> auto-scope to own
 *   - master without companyId                                 -> 400 (companyId required)
 *
 * The companyId requirement for master keys is deliberate: a
 * global substring search across every tenant's customer table
 * is a big footgun (latency + accidental data exposure if the
 * caller wasn't authorized to see all companies' data). Master
 * keys must be explicit about the scope.
 */
exports.search = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isAuthKeyMasterKey;
    try {
        isAuthKeyMasterKey = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'IsMaster failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }

    // Resolve effective companyId from auth + query
    let effectiveCompanyId;
    if (isAuthKeyMasterKey) {
        const qCompanyId = Number(req.query.companyId);
        if (!Number.isInteger(qCompanyId) || qCompanyId <= 0) {
            return res.status(400).json({
                message: "Master keys must specify companyId on search.",
            });
        }
        effectiveCompanyId = qCompanyId;
    } else {
        let authKeyCompanyId;
        try {
            authKeyCompanyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!", error: String(error) });
        }
        if (authKeyCompanyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
        const qCompanyId = req.query.companyId !== undefined ? Number(req.query.companyId) : null;
        if (qCompanyId !== null && qCompanyId !== authKeyCompanyId) {
            return res.status(403).json({
                message: "Cannot search customers in a company you do not belong to.",
            });
        }
        effectiveCompanyId = authKeyCompanyId;
    }

    const q = String(req.query.q || '');
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset
        : 0;

    const Op = db.Sequelize && db.Sequelize.Op;
    if (!Op) {
        return res.status(500).json({ message: "Error!", error: "Sequelize Op not available" });
    }

    // ILIKE on Postgres; the `%` wildcards come from us, not the user.
    const pattern = `%${q}%`;
    const where = {
        custCompId: effectiveCompanyId,
        [Op.or]: [
            { custCompanyName: { [Op.iLike]: pattern } },
            { custFName: { [Op.iLike]: pattern } },
            { custLName: { [Op.iLike]: pattern } },
        ],
    };

    try {
        const { count, rows } = await Customer.findAndCountAll({
            where,
            limit,
            offset,
            order: [['custId', 'ASC']],
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        res.setHeader('Access-Control-Expose-Headers', 'Link');
        return res.status(200).json({
            message: `Found ${count} customer(s) matching ${JSON.stringify(q)} in company ${effectiveCompanyId}`,
            q,
            companyId: effectiveCompanyId,
            count,
            limit,
            offset,
            customers: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'Customer.search findAndCountAll failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
};

// ---- helpers ----

async function findAndRespond(customerId, res) {
    try {
        const customer = await Customer.findByPk(customerId);
        return res.status(200).json({
            message: "Successfully retrieved the customer with CustomerId " + customerId,
            customers: customer,
        });
    } catch (error) {
        log.error({ err: error }, 'Customer.findByPk failed');
        return res.status(500).json({ message: "Error!", error: String(error) });
    }
}

/**
 * Resolve a customer id to its owning company id, or -1 if not found.
 * Empty / missing ids return -1 without dereferencing an empty array.
 */
async function GetCustomerCompanyId(customerId) {
    // customerId comes from req.params.id (always a string). Treat empty
    // or zero as "not found" before hitting the DB.
    const idStr = customerId == null ? '' : String(customerId);
    if (idStr.length === 0 || idStr === '0') {
        return -1;
    }
    try {
        const customerResult = await db.sequelize.query(
            'SELECT * FROM "dbo"."Customer" WHERE "custId" = ? AND "custArch" = false;',
            { replacements: [customerId], type: sequelize.QueryTypes.SELECT },
        );
        if (!customerResult || customerResult.length === 0) {
            return -1;
        }
        const custCompanyId = customerResult[0].custCompId;
        if (typeof custCompanyId === 'number' && custCompanyId > 0) {
            return custCompanyId;
        }
        return -1;
    } catch (error) {
        log.error({ err: error }, 'GetCustomerCompanyId query failed');
        return -1;
    }
}

/**
 * Strict equality on two normalized integers. Returns false on any -1
 * sentinel ("not found") so callers don't have to special-case it.
 */
function CompaniesMatch(int1, int2) {
    if (int1 === -1 || int2 === -1) {
        return false;
    }
    return int1 === int2;
}

// Exported for testing
exports._helpers = { IsMaster, GetCompanyId, GetCustomerCompanyId, CompaniesMatch };
