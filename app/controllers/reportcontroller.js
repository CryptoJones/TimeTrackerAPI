// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Reporting endpoints — read-only, company-scoped projections that join
 * across the domain tables. The first is `invoice-list`, which restores
 * the source database's `v_InvoiceList` view (which had no API surface):
 * one row per invoice line, carrying the invoice date/number, the line
 * amount, and the customer id.
 *
 * The join walks InvoiceJob -> Invoice -> Customer. Scoping is enforced
 * at the Customer leaf (custCompId) since Invoice has no direct *CompId;
 * this is the same auth boundary the invoice controller uses. The
 * default scopes on all three models filter archived rows automatically.
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildLinkHeader } = require('../middleware/pagination.js');
const { escapeCsvCell } = require('./_csv-escape.js');

const InvoiceJob = db.InvoiceJob;
const Invoice = db.Invoice;
const Customer = db.Customer;

const IsMaster = auth.isMaster;
const GetCompanyId = auth.getCompanyId;

/**
 * Resolve the effective company scope for a report request, mirroring
 * the export.csv auth shape: master keys must specify ?companyId;
 * non-master keys are auto-scoped to their own company (and may pass
 * their own id, but not another). Returns either { companyId } or
 * { status, message } describing the rejection.
 */
async function resolveScope(req) {
    const authKey = req.get('authKey');
    if (!authKey) {
        return { status: 403, message: "Authorization key not sent." };
    }
    let isMasterKey;
    try {
        isMasterKey = await IsMaster(authKey);
    } catch (error) {
        log.error({ err: error }, 'report.resolveScope IsMaster failed');
        return { status: 500, message: "Error!" };
    }
    if (isMasterKey) {
        const q = Number(req.query.companyId);
        if (!Number.isInteger(q) || q <= 0) {
            return { status: 400, message: "Master keys must specify companyId." };
        }
        return { companyId: q };
    }
    let own;
    try {
        own = await GetCompanyId(authKey);
    } catch (error) {
        log.error({ err: error }, 'report.resolveScope GetCompanyId failed');
        return { status: 500, message: "Error!" };
    }
    if (own === -1) {
        return { status: 403, message: "Invalid Authorization Key." };
    }
    const q = req.query.companyId !== undefined ? Number(req.query.companyId) : null;
    if (q !== null && q !== own) {
        return { status: 403, message: "Cannot read reports for a company you do not belong to." };
    }
    return { companyId: own };
}

/**
 * Build the Sequelize query options shared by the JSON + CSV handlers.
 * `customerId` (optional) narrows to a single customer within the
 * already-scoped company.
 */
function buildQuery(companyId, customerId, limit, offset) {
    const invoiceWhere = {};
    if (Number.isInteger(customerId) && customerId > 0) {
        invoiceWhere.invCustId = customerId;
    }
    return {
        attributes: ['injbId', 'injbAmount'],
        include: [{
            model: Invoice,
            as: 'invoice',
            required: true,
            where: invoiceWhere,
            attributes: ['invId', 'invDate', 'invCustId'],
            include: [{
                // Scoping leaf: only lines whose invoice's customer is in
                // the caller's company. attributes:[] — used purely for
                // the join/filter, not returned.
                model: Customer,
                as: 'customer',
                required: true,
                attributes: [],
                where: { custCompId: companyId },
            }],
        }],
        limit,
        offset,
        // Newest invoices first, then stable by line id.
        order: [[{ model: Invoice, as: 'invoice' }, 'invDate', 'DESC'], ['injbId', 'ASC']],
        subQuery: false,
    };
}

/**
 * Flatten an InvoiceJob row (with its eager-loaded invoice) into the
 * v_InvoiceList shape.
 */
function mapRow(r) {
    const inv = r.invoice || {};
    return {
        invoiceDate: inv.invDate,
        invoiceNumber: inv.invId,
        invoiceAmount: r.injbAmount,
        customerId: inv.invCustId,
    };
}

/**
 * GET /v1/report/invoice-list — paginated JSON projection of the
 * source v_InvoiceList view.
 */
exports.invoiceList = async (req, res) => {
    const scope = await resolveScope(req);
    if (scope.status) return res.status(scope.status).json({ message: scope.message });

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 500)
        : 100;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset
        : 0;
    const customerId = Number(req.query.customerId);

    try {
        const { count, rows } = await InvoiceJob.findAndCountAll({
            ...buildQuery(scope.companyId, customerId, limit, offset),
            distinct: true,
            col: 'injbId',
        });
        const link = buildLinkHeader({ req, limit, offset, count });
        if (link) res.setHeader('Link', link);
        return res.status(200).json({
            message: "Found.",
            count,
            limit,
            offset,
            invoiceList: rows.map(mapRow),
        });
    } catch (error) {
        log.error({ err: error }, 'report.invoiceList query failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * GET /v1/report/invoice-list.csv — same projection as a CSV download.
 * Same 5000-row hard cap + trailing `# truncated` comment as the other
 * export endpoints, and the same OWASP formula-injection guard.
 */
exports.invoiceListCsv = async (req, res) => {
    const scope = await resolveScope(req);
    if (scope.status) return res.status(scope.status).json({ message: scope.message });

    const HARD_CAP = 5000;
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, HARD_CAP)
        : HARD_CAP;
    const requestedOffset = parseInt(req.query.offset, 10);
    const offset = Number.isInteger(requestedOffset) && requestedOffset >= 0
        ? requestedOffset
        : 0;
    const customerId = Number(req.query.customerId);

    let rows;
    try {
        // Fetch one extra row to detect truncation, mirroring the other
        // export.csv handlers.
        rows = await InvoiceJob.findAll(
            buildQuery(scope.companyId, customerId, limit + 1, offset),
        );
    } catch (error) {
        log.error({ err: error }, 'report.invoiceListCsv query failed');
        return res.status(500).json({ message: "Error!" });
    }

    const truncated = rows.length > limit;
    if (truncated) rows = rows.slice(0, limit);

    const FIELDS = ['invoiceDate', 'invoiceNumber', 'invoiceAmount', 'customerId'];
    const lines = [];
    lines.push(FIELDS.join(','));
    for (const r of rows) {
        const row = mapRow(r);
        lines.push(FIELDS.map((f) => escapeCsvCell(row[f])).join(','));
    }
    if (truncated) {
        lines.push(`# truncated at ${limit} rows; re-call with offset=${offset + limit} to continue`);
    }
    const body = lines.join('\r\n') + '\r\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',
        `attachment; filename="invoice-list-company-${scope.companyId}.csv"`);
    return res.status(200).send(body);
};

// Exposed for unit testing.
exports._internals = { resolveScope, buildQuery, mapRow, IsMaster, GetCompanyId };
