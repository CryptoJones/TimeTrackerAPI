// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { escapeCsvCell } = require('./_csv-escape.js');
const { buildPayroll } = require('../services/payroll.js');

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

/** Resolve the target company (or null after responding). Master keys pass ?companyId. */
async function resolveCompany(req, res) {
    const authKey = req.get('authKey');
    if (!authKey) {
        res.status(403).json({ message: "Authorization key not sent." });
        return null;
    }
    const isMaster = await MasterFromReq(req, authKey);
    if (isMaster) {
        const companyId = Number(req.query.companyId);
        if (!Number.isInteger(companyId) || companyId <= 0) {
            res.status(400).json({ message: "Master-key requests must specify companyId." });
            return null;
        }
        return companyId;
    }
    const companyId = await CompanyIdFromReq(req, authKey);
    if (companyId === -1) {
        res.status(403).json({ message: "Invalid Authorization Key." });
        return null;
    }
    return companyId;
}

/** Aggregate completed time entries + workers for a company over [from, to]. */
async function aggregate(companyId, from, to) {
    const Op = db.Sequelize.Op;
    const [entries, workers] = await Promise.all([
        db.TimeEntry.findAll({
            where: {
                teCompId: companyId,
                teArch: false,
                teEndedAt: { [Op.ne]: null },
                teStartedAt: { [Op.gte]: `${from}T00:00:00.000Z`, [Op.lte]: `${to}T23:59:59.999Z` },
            },
            attributes: ['teWorkerId', 'teMinutes', 'teBillable'],
        }),
        db.Worker.findAll({
            where: { workerCompId: companyId },
            attributes: ['workerId', 'workerFName', 'workerLName', 'workerCostRate'],
        }),
    ]);
    return buildPayroll(entries, workers, { from, to });
}

/** GET /v1/payroll/summary — per-worker payroll totals as JSON. */
exports.summary = async (req, res) => {
    const companyId = await resolveCompany(req, res);
    if (companyId === null) return undefined;
    const { from, to } = req.query;
    try {
        const payroll = await aggregate(companyId, from, to);
        return res.status(200).json({ message: "Payroll summary.", companyId, ...payroll });
    } catch (error) {
        log.error({ err: error }, 'payroll summary failed');
        return res.status(500).json({ message: "Error!" });
    }
};

const CSV_FIELDS = [
    ['workerId', 'Worker ID'],
    ['workerName', 'Worker Name'],
    ['periodStart', 'Period Start'],
    ['periodEnd', 'Period End'],
    ['totalHours', 'Total Hours'],
    ['billableHours', 'Billable Hours'],
    ['nonBillableHours', 'Non-Billable Hours'],
    ['costRate', 'Cost Rate'],
    ['costTotal', 'Labor Cost'],
];

/** GET /v1/payroll/export — per-worker payroll totals as a payroll-ready CSV. */
exports.exportCsv = async (req, res) => {
    const companyId = await resolveCompany(req, res);
    if (companyId === null) return undefined;
    const { from, to } = req.query;

    let payroll;
    try {
        payroll = await aggregate(companyId, from, to);
    } catch (error) {
        log.error({ err: error }, 'payroll export failed');
        return res.status(500).json({ message: "Error!" });
    }

    const lines = [];
    lines.push(CSV_FIELDS.map(([, header]) => escapeCsvCell(header)).join(','));
    for (const r of payroll.rows) {
        const row = { ...r, periodStart: payroll.periodStart, periodEnd: payroll.periodEnd };
        lines.push(CSV_FIELDS.map(([key]) => escapeCsvCell(row[key])).join(','));
    }
    const body = `${lines.join('\r\n')}\r\n`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-company-${companyId}-${from}_${to}.csv"`);
    return res.status(200).send(body);
};
