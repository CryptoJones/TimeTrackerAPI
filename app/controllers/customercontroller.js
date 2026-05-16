// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { sequelize } = require('../config/db.config.js');
const db = require('../config/db.config.js');
const log = require('../config/logger.js');
const Customer = db.Customer;

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

    try {
        const customers = await Customer.findAll({ where: { custCompId: companyId } });
        return res.status(200).json({
            message: "Successfully retrieved customers with CompanyId " + companyId,
            customers: customers,
        });
    } catch (error) {
        log.error({ err: error }, 'Customer.findAll failed');
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
 * Return true iff the given authKey matches an unarchived row in
 * "dbo"."ApiMaster". Empty / missing keys return false without
 * dereferencing the empty result array (which would throw).
 */
async function IsMaster(authKeyString) {
    if (!authKeyString || authKeyString.length === 0) {
        return false;
    }
    try {
        const masterResult = await db.sequelize.query(
            'SELECT * FROM "dbo"."ApiMaster" WHERE "amKEY" = ? AND "ApiMaster"."amArchive" = false;',
            { replacements: [authKeyString], type: sequelize.QueryTypes.SELECT },
        );
        if (!masterResult || masterResult.length === 0) {
            return false;
        }
        const key = masterResult[0].amId;
        return typeof key === 'number' && key > 0;
    } catch (error) {
        log.error({ err: error }, 'IsMaster query failed');
        return false;
    }
}

/**
 * Resolve an authKey to its owning company id, or -1 if not found.
 * Empty / missing keys return -1 without dereferencing an empty array.
 */
async function GetCompanyId(authKeyString) {
    if (!authKeyString || authKeyString.length === 0) {
        return -1;
    }
    try {
        const apiKeyResult = await db.sequelize.query(
            'SELECT * FROM "dbo"."ApiKey" WHERE "akKEY" = ? AND "ApiKey"."akArchive" = false;',
            { replacements: [authKeyString], type: sequelize.QueryTypes.SELECT },
        );
        if (!apiKeyResult || apiKeyResult.length === 0) {
            return -1;
        }
        const companyId = apiKeyResult[0].akCompanyId;
        if (typeof companyId === 'number' && companyId > 0) {
            return companyId;
        }
        return -1;
    } catch (error) {
        log.error({ err: error }, 'GetCompanyId query failed');
        return -1;
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
