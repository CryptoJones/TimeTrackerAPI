// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Shared factory for bulk-create controllers on entities that scope
 * directly to a single company via a *CompId column. Customer's
 * bulkCreate predates this helper and has the same shape baked in;
 * we don't migrate it here to keep the diff focused on the new
 * endpoints (P3-H), but a follow-up should consolidate them.
 *
 * What this factory replaces: 5 near-identical controllers
 * (worker/billingtype/inventoryitem/inventorytransaction/
 *  purchaseordervendor) each repeating the same auth-scope-loop-
 *  transaction-bulkCreate-handle-error scaffold.
 *
 * What varies between entities — passed as config:
 *   - Model         the sequelize model (db.Worker etc.)
 *   - modelKey      string label for logs ("Worker", "BillingType")
 *   - compIdField   the company-scope column ("workerCompId", "btCompId",
 *                   "invitCompId", "invtCompanyId", "povCompId")
 *   - allowedFields whitelist for each entry (the same list the
 *                   single-create endpoint accepts, minus the *Arch
 *                   column which the controller sets to false)
 *   - archField     soft-delete column ("workerArch", "btArch", etc.)
 *   - bodyKey       JSON key the array hangs off ("workers",
 *                   "billingTypes", etc.) — matches the zod schema's
 *                   outer key.
 *   - createdKey    response key for the inserted rows ("workers", ...)
 */

const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');

function makeBulkCreate({
    Model,
    modelKey,
    compIdField,
    allowedFields,
    archField,
    bodyKey,
    createdKey,
}) {
    return async function bulkCreate(req, res) {
        const authKey = req.get('authKey');
        if (!authKey) {
            return res.status(403).json({ message: "Authorization key not sent." });
        }

        let isAuthKeyMasterKey;
        try {
            isAuthKeyMasterKey = await auth.isMaster(authKey);
        } catch (error) {
            log.error({ err: error }, `${modelKey}: isMaster failed`);
            return res.status(500).json({ message: "Error!", error: String(error) });
        }

        const input = (req.body && Array.isArray(req.body[bodyKey]))
            ? req.body[bodyKey]
            : [];
        if (input.length === 0) {
            return res.status(400).json({ message: `${bodyKey} array is required and must be non-empty.` });
        }

        // Resolve authKey's company once for non-master path.
        let authKeyCompanyId = null;
        if (!isAuthKeyMasterKey) {
            try {
                authKeyCompanyId = await auth.getCompanyId(authKey);
            } catch (error) {
                log.error({ err: error }, `${modelKey}: getCompanyId failed`);
                return res.status(500).json({ message: "Error!", error: String(error) });
            }
            if (authKeyCompanyId === -1) {
                return res.status(403).json({ message: "Invalid Authorization Key." });
            }
        }

        // Whitelist + auth-scope each entry.
        const payloads = [];
        for (let i = 0; i < input.length; i += 1) {
            const entry = input[i] || {};
            const p = {};
            for (const f of allowedFields) {
                if (entry[f] !== undefined) p[f] = entry[f];
            }
            if (isAuthKeyMasterKey) {
                if (p[compIdField] === undefined || Number(p[compIdField]) <= 0) {
                    return res.status(400).json({
                        message: `${bodyKey}[${i}]: master-key requests must specify ${compIdField}.`,
                    });
                }
            } else {
                if (p[compIdField] !== undefined && Number(p[compIdField]) !== authKeyCompanyId) {
                    return res.status(403).json({
                        message: `${bodyKey}[${i}]: cannot create for a company you do not belong to.`,
                    });
                }
                p[compIdField] = authKeyCompanyId;
            }
            // archField intentionally defaulted to false here so
            // partially-archived bulk inserts can't be smuggled in.
            p[archField] = false;
            payloads.push(p);
        }

        const t = await db.sequelize.transaction();
        try {
            const created = await Model.bulkCreate(payloads, {
                transaction: t,
                validate: true,
                returning: true,
            });
            await t.commit();
            const responseBody = {
                message: `Created ${created.length} ${modelKey}(s).`,
                count: created.length,
            };
            responseBody[createdKey] = created;
            return res.status(201).json(responseBody);
        } catch (error) {
            try { await t.rollback(); } catch (_) { /* swallow */ }
            log.error({ err: error }, `${modelKey}.bulkCreate failed`);
            return res.status(500).json({ message: "Error!", error: String(error) });
        }
    };
}

module.exports = { makeBulkCreate };
