// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * rate-source-include.js — the Sequelize `include` that eager-loads exactly
 * the associations `rate.js#resolveHourlyRate` reads (billingType, task, job,
 * customer, worker + its defaultBillingType/role). Shared by the invoice
 * rollup and the create-time rate snapshot (#10) so both resolve a rate from
 * an identical source set. Takes `db` as an argument to avoid importing the
 * model registry here (keeps it dependency-light + testable).
 */
function rateSourceInclude(db) {
    return [
        { model: db.BillingType, as: 'billingType', required: false },
        { model: db.Job, as: 'job', required: false, attributes: ['jobId', 'jobFlatRate'] },
        {
            model: db.Worker, as: 'worker', required: false,
            include: [
                { model: db.BillingType, as: 'defaultBillingType', required: false },
                { model: db.Role, as: 'role', required: false },
            ],
        },
        { model: db.Customer, as: 'customer', required: false, attributes: ['custId', 'custDefaultRate'] },
        { model: db.Task, as: 'task', required: false, attributes: ['taskId', 'taskRate'] },
    ];
}

module.exports = { rateSourceInclude };
