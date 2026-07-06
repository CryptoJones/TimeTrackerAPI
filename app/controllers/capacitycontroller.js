// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { buildCapacity, weeksBetween } = require('../services/capacity.js');

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

/** GET /v1/capacity/summary — per-worker capacity/utilization over a period. */
exports.summary = async (req, res) => {
    const companyId = await resolveCompany(req, res);
    if (companyId === null) return undefined;
    const { from, to } = req.query;
    const Op = db.Sequelize.Op;

    try {
        const [entries, workers] = await Promise.all([
            db.TimeEntry.findAll({
                where: {
                    teCompId: companyId,
                    teArch: false,
                    teEndedAt: { [Op.ne]: null },
                    teStartedAt: { [Op.gte]: `${from}T00:00:00.000Z`, [Op.lte]: `${to}T23:59:59.999Z` },
                },
                attributes: ['teWorkerId', 'teMinutes'],
            }),
            db.Worker.findAll({
                where: { workerCompId: companyId },
                attributes: ['workerId', 'workerFName', 'workerLName', 'workerTargetMinsPerWeek'],
            }),
        ]);
        const weeks = weeksBetween(from, to);
        const capacity = buildCapacity(entries, workers, { from, to, weeks });
        return res.status(200).json({ message: "Capacity summary.", companyId, ...capacity });
    } catch (error) {
        log.error({ err: error }, 'capacity summary failed');
        return res.status(500).json({ message: "Error!" });
    }
};
