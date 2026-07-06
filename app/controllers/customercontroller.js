// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { makeBulkCreate } = require('./_bulk-helpers.js');
const { escapeCsvCell } = require('./_csv-escape.js');
const Customer = db.Customer;

// IsMaster / GetCompanyId / GetCustomerCompanyId previously lived inline
// in this file (and were duplicated across controllers). They moved to
// app/middleware/auth.js — these aliases preserve the existing PascalCase
// names used inside this controller body without churning every call site.
// (#378 consolidated the customer→company lookup onto the auth helper,
// dropping a hand-rolled raw-SQL duplicate.)
const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;
const GetCustomerCompanyId = auth.getCompanyIdByCustomerId;

/**
 * Escape the three SQL LIKE/ILIKE metacharacters in a substring so
 * the calling code can wrap it in `%…%` without the user-supplied
 * portion of the pattern doing wildcard work on its own.
 *
 *   %  matches any sequence of characters
 *   _  matches any single character
 *   \  the escape character (must come first in the replacement
 *      regex so we don't double-escape our own escape)
 *
 * Used by exports.search; documented as test-only via _helpers so
 * the unit test can pin the contract without taking a hard
 * dependency on the function reference moving.
 */
function escapeLikeWildcards(s) {
    return String(s).replace(/[\\%_]/g, '\\$&');
}

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
        return res.status(500).json({ message: "Error!" });
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
        return res.status(500).json({ message: "Error!" });
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
        return res.status(500).json({ message: "Error!" });
    }

    // Whitelist of model fields we accept. Anything else in the body
    // is silently dropped — protects against mass-assignment style
    // attacks where a caller posts e.g. `{"custId": 999, ...}` to
    // forge an id.
    const ALLOWED_FIELDS = [
        'custCompanyName', 'custFName', 'custLName',
        'custAddress1', 'custAddress2',
        'custCity', 'custState', 'custZip',
        'custPhone', 'custEmail', 'custCompId', 'custDefaultRate',
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
            return res.status(500).json({ message: "Error!" });
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
        return res.status(500).json({ message: "Error!" });
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
        return res.status(500).json({ message: "Error!" });
    }

    if (!isAuthKeyMasterKey) {
        let authKeyCompanyId;
        try {
            authKeyCompanyId = await GetCompanyId(authKey);
        } catch (error) {
            log.error({ err: error }, 'GetCompanyId failed');
            return res.status(500).json({ message: "Error!" });
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
        return res.status(200).json({
            message: "Successfully retrieved customers with CompanyId " + companyId,
            count,
            limit,
            offset,
            customers: rows,
        });
    } catch (error) {
        log.error({ err: error }, 'Customer.findAndCountAll failed');
        return res.status(500).json({ message: "Error!" });
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
        return res.status(500).json({ message: "Error!" });
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
            return res.status(500).json({ message: "Error!" });
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
        return res.status(500).json({ message: "Error!" });
    }

    const truncated = rows.length > limit;
    if (truncated) rows = rows.slice(0, limit);

    // CSV serialization via the shared helper. Includes RFC 4180
    // quote-wrapping AND the OWASP formula-injection guard — any cell
    // starting with =, +, -, @, tab, or CR is prefixed with a single
    // quote so the spreadsheet engine treats it as text. Customer
    // free-text fields (custCompanyName, custFName, etc.) are
    // user-supplied per-tenant, so an entry like `=HYPERLINK(...)`
    // would otherwise fire when a co-tenant operator opens the
    // export. See _csv-escape.js + the timeentry counterpart (#266).
    const FIELDS = [
        'custId', 'custCompanyName', 'custFName', 'custLName',
        'custAddress1', 'custAddress2',
        'custCity', 'custState', 'custZip',
        'custPhone', 'custEmail', 'custCompId', 'custDefaultRate',
    ];
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
        `attachment; filename="customers-company-${effectiveCompanyId}.csv"`);
    return res.status(200).send(body);
};

/**
 * POST /v1/customer/bulk
 *
 * Transaction-wrapped batch create via the shared
 * `makeBulkCreate` factory. Body: { customers: [{...}, ...] }.
 * All-or-nothing semantics: a single failure rolls the batch back.
 *
 * Auth contract matches POST /v1/customer (and every other
 * direct-compId bulk endpoint):
 *   - missing authKey                                       -> 403
 *   - non-master + entry with custCompId mismatching scope  -> 403
 *   - non-master without custCompId on any entry            -> defaults to scope
 *   - master without custCompId on any entry                -> 400
 */
exports.bulkCreate = makeBulkCreate({
    Model: Customer,
    modelKey: 'Customer',
    compIdField: 'custCompId',
    allowedFields: [
        'custCompanyName', 'custFName', 'custLName',
        'custAddress1', 'custAddress2',
        'custCity', 'custState', 'custZip',
        'custPhone', 'custEmail', 'custCompId',
    ],
    archField: 'custArch',
    bodyKey: 'customers',
    createdKey: 'customers',
});

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
        return res.status(500).json({ message: "Error!" });
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
            return res.status(500).json({ message: "Error!" });
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
        return res.status(500).json({ message: "Error!" });
    }

    // ILIKE on Postgres; the `%` wildcards come from us, not the user.
    // Escape SQL LIKE metacharacters in `q` so a user sending `%` or
    // `_` or `\` doesn't turn the substring search into a pattern
    // search. Without this, `q=%` produces `%%%` which matches every
    // customer in the scope — same security boundary (still
    // company-scoped) but the substring contract is silently broken.
    // Sequelize does NOT auto-escape these for Op.iLike; the
    // package treats the pattern as verbatim user-controlled SQL.
    const pattern = `%${escapeLikeWildcards(q)}%`;
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
        return res.status(500).json({ message: "Error!" });
    }
};

// ---- helpers ----

async function findAndRespond(customerId, res) {
    try {
        const customer = await Customer.findByPk(customerId);
        if (!customer) {
            // The master-key branch in getCustomerById calls
            // findAndRespond without first verifying the row exists,
            // so a non-existent customerId used to land here and
            // return `200 { customers: null }` — a confusing
            // success envelope wrapping an empty body. The scoped
            // (non-master) branch already short-circuits to 403 on
            // `GetCustomerCompanyId(id) === -1`, so it never hit this
            // fallthrough. Make the master path return a proper 404
            // so both paths agree that "no such customer id" is
            // a not-found, not a success.
            //
            // The `defaultScope` on the Customer model filters archived
            // rows, so findByPk also returns null for soft-deleted
            // customers — soft-deletes correctly surface as 404 too.
            return res.status(404).json({ message: "Not found." });
        }
        // The historical key is `customers` (plural) wrapping a single
        // customer — a wart from before the codebase standardized on
        // singular-for-single-row across the other 15 entities. Add
        // the consistent `customer` key alongside it so SDK clients
        // can read the same shape they get from /v1/worker/:id et al.
        // The `customers` key stays for backward compat; remove in a
        // future major version.
        return res.status(200).json({
            message: "Successfully retrieved the customer with CustomerId " + customerId,
            customer,
            customers: customer,
        });
    } catch (error) {
        log.error({ err: error }, 'Customer.findByPk failed');
        return res.status(500).json({ message: "Error!" });
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
exports._helpers = { IsMaster, GetCompanyId, GetCustomerCompanyId, CompaniesMatch, escapeLikeWildcards };
