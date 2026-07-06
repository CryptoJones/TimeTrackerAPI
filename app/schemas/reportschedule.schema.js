// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const { z } = require('zod');
const { REPORTS } = require('../services/report-email.js');
const { CADENCES } = require('../services/recurring-schedule.js');

const intIdParam = z.object({
    id: z.coerce.number().int().positive(),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date.');

/** POST /v1/reportschedule body (#57). rptschCompId optional (non-master defaults to own; master required). */
const createReportScheduleBody = z.object({
    rptschReport: z.enum(REPORTS),
    rptschTo: z.string().email().max(320),
    rptschCadence: z.enum(CADENCES),
    rptschNextRun: isoDate,
    rptschCompId: z.coerce.number().int().positive().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: rptschReport, rptschTo, rptschCadence, rptschNextRun, rptschCompId.',
});

/** PATCH /v1/reportschedule/:id — rptschCompId is not patchable. */
const updateReportScheduleBody = z.object({
    rptschReport: z.enum(REPORTS).optional(),
    rptschTo: z.string().email().max(320).optional(),
    rptschCadence: z.enum(CADENCES).optional(),
    rptschNextRun: isoDate.optional(),
    rptschActive: z.boolean().optional(),
}).strict({
    message: 'Unexpected field in body. Whitelist: rptschReport, rptschTo, rptschCadence, rptschNextRun, rptschActive.',
});

const listByCompanyQuery = z.object({
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: limit, offset.',
});

/** GET /v1/reportschedule/due query. companyId required for master keys. */
const dueQuery = z.object({
    companyId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
    offset: z.coerce.number().int().nonnegative().optional(),
}).strict({
    message: 'Unexpected query parameter. Allowed: companyId, limit, offset.',
});

module.exports = {
    intIdParam,
    createReportScheduleBody,
    updateReportScheduleBody,
    listByCompanyQuery,
    dueQuery,
};
