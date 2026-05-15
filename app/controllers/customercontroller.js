"use strict";
const { sequelize } = require('../config/db.config.js');
const db = require('../config/db.config.js');
const Customer = db.Customer;

exports.getCustomerById = async (req, res) => {
    // find all Customer information from
    var authKey = req.get('authKey');
    let customerId = req.params.id;

    if (!authKey) {
        res.status(403).json({
            message: "Authorization key not sent."
        });
        return;
    }

    var isAuthKeyMasterKey = await IsMaster(authKey)
    if (isAuthKeyMasterKey) {
        Customer.findByPk(customerId)
            .then(customer => {
                res.status(200).json({
                    message: "Successfully retrieved the customer with CustomerId " + customerId,
                    customers: customer
                });
                return;
            })
            .catch(error => {
                // log on console
                console.log(error);

                res.status(500).json({
                    message: "Error!",
                    error: error
                });
                return;
            });
    }

    var custCompanyId = await GetCustomerCompanyId(customerId);
    var companyIdReturned = await GetCompanyId(authKey);
    var companiesMatch = await CompaniesMatch(custCompanyId, companyIdReturned);

    if (companiesMatch) {
        Customer.findByPk(customerId)
            .then(customer => {
                res.status(200).json({
                    message: "Successfully retrieved the customer with CustomerId " + customerId,
                    customers: customer
                });
                return;
            })
            .catch(error => {
                // log on console
                console.log(error);

                res.status(500).json({
                    message: "Error!",
                    error: error
                });
                return;
            });
    } else {
        res.status(403).json({
            message: "Invalid Authorization Key."
        });
        return;
    }
}

exports.getAllByCompanyId = async (req, res) => {
    // Auth contract for this endpoint (closes #3):
    //   1. authKey header must be present                       -> 403 if missing
    //   2. authKey may be a master key (sees all companies)     -> proceed
    //   3. otherwise authKey's company must match :id           -> proceed
    //                                                           -> 403 if not
    const authKey = req.get('authKey');
    const companyId = req.params.id;

    if (!authKey) {
        res.status(403).json({ message: "Authorization key not sent." });
        return;
    }

    const isAuthKeyMasterKey = await IsMaster(authKey);
    if (!isAuthKeyMasterKey) {
        const authKeyCompanyId = await GetCompanyId(authKey);
        // Use loose equality only to permit numeric string ↔ integer comparison
        // (req.params.id arrives as a string; akCompanyId comes back as an INT
        // from Sequelize). Both sides have already been narrowed to numerics.
        if (authKeyCompanyId === -1 || String(authKeyCompanyId) !== String(companyId)) {
            res.status(403).json({ message: "Invalid Authorization Key." });
            return;
        }
    }

    Customer.findAll({
        where: { custCompId: companyId }
    })
        .then(customerInfo => {
            res.status(200).json({
                message: "Successfully retrieved customers with CompanyId " + companyId,
                customers: customerInfo
            });
        })
        .catch(error => {
            console.log(error);
            res.status(500).json({ message: "Error!", error: error });
        });
};

async function IsMaster(authKeyString) {
    try {
        if (authKeyString.length > 0) {
            var masterResult = await db.sequelize.query('SELECT * FROM "dbo"."ApiMaster" WHERE "amKEY" = ? AND "ApiMaster"."amArchive" = false;', {
                replacements: [authKeyString], type: sequelize.QueryTypes.SELECT
            });
            var key = masterResult[0].amId;
            if (key > 0) {
                return true;
            } else {
                return false;
            }
        }
    } catch (error) {
        console.log(error);
        return false;
    }
    return false;
}

async function GetCompanyId(authKeyString) {
    try {
        if (authKeyString.length > 0) {
            var apiKeyResult = await db.sequelize.query('SELECT * FROM "dbo"."ApiKey" WHERE "akKEY" = ? AND "ApiKey"."akArchive" = false;', {
                replacements: [authKeyString], type: sequelize.QueryTypes.SELECT
            });
            var companyId = apiKeyResult[0].akCompanyId;
            if (companyId > 0) {
                return companyId;
            } else {
                return -1;
            }
        }
    } catch (error) {
        console.log(error);
        return -1;
    }
    return -1;
}

async function GetCustomerCompanyId(customerId) {
    try {
        if (customerId.length > 0) {
            var apiKeyResult = await db.sequelize.query('SELECT * FROM "dbo"."Customer" WHERE "custId" = ? AND "custArch" = false;', {
                replacements: [customerId], type: sequelize.QueryTypes.SELECT
            });
            var custCompanyId = apiKeyResult[0].custCompId;
            if (custCompanyId > 0) {
                return custCompanyId;
            } else {
                return -1;
            }
        }
    } catch (error) {
        console.log(error);
        return -1;
    }
    return -1;
}

async function CompaniesMatch(int1, int2) {
    if (int1 === int2) {
        return true;
    }

    return false;
}