// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * Shared factory for bulk-create controllers on entities that scope
 * directly to a single company via a *CompId column.
 *
 * What this factory replaces: 6 near-identical controllers
 * (customer/worker/billingtype/inventoryitem/inventorytransaction/
 *  purchaseordervendor) each repeating the same auth-scope-loop-
 *  transaction-bulkCreate-handle-error scaffold. Customer was the
 *  original hand-rolled implementation; the factory replaced 5
 *  later-added clones in P3-H and Customer was migrated to use the
 *  factory in a follow-up.
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

// Normalize the optional `secondaryFk` config — a single
// { field, belongsTo(value, compId), label } object, an array of them, or
// undefined — to an array. A controller may need to tenant-check more than
// one secondary FK per entry (e.g. Worker's billing-type + role).
function normalizeSecondaryFks(secondaryFk) {
    if (!secondaryFk) return [];
    return Array.isArray(secondaryFk) ? secondaryFk : [secondaryFk];
}

function makeBulkCreate({
    Model,
    modelKey,
    compIdField,
    allowedFields,
    archField,
    bodyKey,
    createdKey,
    // Optional secondary FK(s) each entry carries that must belong to the
    // caller's company: { field, belongsTo(value, compId), label } or an array.
    secondaryFk,
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
            return res.status(500).json({ message: "Error!" });
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
                return res.status(500).json({ message: "Error!" });
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
                for (const sfk of normalizeSecondaryFks(secondaryFk)) {
                    if (p[sfk.field] != null
                        && !(await sfk.belongsTo(p[sfk.field], authKeyCompanyId))) {
                        return res.status(400).json({
                            message: `${bodyKey}[${i}]: invalid ${sfk.label || 'reference'}.`,
                        });
                    }
                }
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
            return res.status(500).json({ message: "Error!" });
        }
    };
}

/**
 * Sibling factory for entities that scope auth INDIRECTLY through
 * a parent FK rather than carrying their own *CompId column.
 *
 * Examples:
 *   - Job (jobCustId → Customer.custCompId)
 *   - Invoice (invCustId → Customer.custCompId)
 *   - CustomerPayment (cpayCustId → Customer.custCompId)
 *   - InvoiceJob (injbJobId → Job → Customer.custCompId)
 *   - ProductEntry (pentJobId → Job → Customer.custCompId)
 *   - PurchaseOrderHeader (pohPovId → PurchaseOrderVendor.povCompId)
 *   - PurchaseOrderLine (polpoh → PurchaseOrderHeader → vendor)
 *
 * Config (additions vs makeBulkCreate):
 *   - parentFkField     the column on each entry that names the
 *                       parent row whose scope governs (e.g.
 *                       'jobCustId', 'pohPovId', 'polpoh')
 *   - resolveParentCompanyId(parentId)
 *                       async function returning the int company
 *                       id, or -1 if the parent is missing/archived
 *                       /unresolved (e.g. auth.getCompanyIdByCustomerId).
 *   - compIdField       NOT used here — kept off the signature so
 *                       callers don't confuse this with the direct
 *                       version. If the entity grows its own column
 *                       later, switch to makeBulkCreate.
 *
 * Per-entry contract:
 *   - parentFkField is REQUIRED on every entry. We need it to
 *     resolve scope; absent it we can't authorize the entry
 *     (return 400 with the offending index).
 *   - For non-master keys: the resolved parent company must equal
 *     authKey's company, else 403 with the offending index. Catches
 *     cross-tenant smuggling attempts in a single batch.
 *   - For master keys: the parent must resolve (404-style 400 if
 *     not), but master keys aren't pinned to a company so any
 *     resolved company is fine.
 */
function makeBulkCreateIndirect({
    Model,
    modelKey,
    parentFkField,
    resolveParentCompanyId,
    allowedFields,
    archField,
    bodyKey,
    createdKey,
    // Optional secondary FK(s) each entry carries that must belong to the
    // caller's company: { field, belongsTo(value, compId), label } or an array.
    secondaryFk,
    // Optional per-entry integrity check run for EVERY entry (master too),
    // mirroring a single-create validation the parent/secondary scope can't
    // express (e.g. "cpayInvId must be an invoice for the SAME customer").
    // async (payload) => null | { status, message }.
    perEntryCheck,
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
            return res.status(500).json({ message: "Error!" });
        }

        const input = (req.body && Array.isArray(req.body[bodyKey]))
            ? req.body[bodyKey]
            : [];
        if (input.length === 0) {
            return res.status(400).json({ message: `${bodyKey} array is required and must be non-empty.` });
        }

        let authKeyCompanyId = null;
        if (!isAuthKeyMasterKey) {
            try {
                authKeyCompanyId = await auth.getCompanyId(authKey);
            } catch (error) {
                log.error({ err: error }, `${modelKey}: getCompanyId failed`);
                return res.status(500).json({ message: "Error!" });
            }
            if (authKeyCompanyId === -1) {
                return res.status(403).json({ message: "Invalid Authorization Key." });
            }
        }

        // Whitelist + per-entry parent-FK scope check.
        const payloads = [];
        for (let i = 0; i < input.length; i += 1) {
            const entry = input[i] || {};
            const p = {};
            for (const f of allowedFields) {
                if (entry[f] !== undefined) p[f] = entry[f];
            }
            const parentId = Number(p[parentFkField]);
            if (!Number.isInteger(parentId) || parentId <= 0) {
                return res.status(400).json({
                    message: `${bodyKey}[${i}]: ${parentFkField} is required.`,
                });
            }

            let parentCompId;
            try {
                parentCompId = await resolveParentCompanyId(parentId);
            } catch (error) {
                log.error({ err: error }, `${modelKey}: parent scope resolve failed`);
                return res.status(500).json({ message: "Error!" });
            }
            if (parentCompId === -1) {
                return res.status(400).json({
                    message: `${bodyKey}[${i}]: parent row not found or archived.`,
                });
            }

            if (!isAuthKeyMasterKey && parentCompId !== authKeyCompanyId) {
                return res.status(403).json({
                    message: `${bodyKey}[${i}]: cannot create for a company you do not belong to.`,
                });
            }

            if (!isAuthKeyMasterKey) {
                for (const sfk of normalizeSecondaryFks(secondaryFk)) {
                    if (p[sfk.field] != null
                        && !(await sfk.belongsTo(p[sfk.field], authKeyCompanyId))) {
                        return res.status(400).json({
                            message: `${bodyKey}[${i}]: invalid ${sfk.label || 'reference'}.`,
                        });
                    }
                }
            }

            if (perEntryCheck) {
                let entryErr;
                try {
                    entryErr = await perEntryCheck(p);
                } catch (error) {
                    log.error({ err: error }, `${modelKey}: per-entry check failed`);
                    return res.status(500).json({ message: "Error!" });
                }
                if (entryErr) {
                    return res.status(entryErr.status || 400).json({
                        message: `${bodyKey}[${i}]: ${entryErr.message}`,
                    });
                }
            }

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
            return res.status(500).json({ message: "Error!" });
        }
    };
}

module.exports = { makeBulkCreate, makeBulkCreateIndirect };
