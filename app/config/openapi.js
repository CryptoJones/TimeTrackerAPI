// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * OpenAPI 3.0 specification for TimeTrackerAPI. Hand-written rather
 * than swagger-jsdoc-generated so the spec doesn't drift quietly
 * when controllers change — a missing entry here is a code review
 * concern rather than something the tooling silently lies about.
 *
 * Served at /docs (interactive Swagger UI) and /openapi.json (raw).
 */

const pkg = require('../../package.json');

const securitySchemes = {
    authKey: {
        type: 'apiKey',
        in: 'header',
        name: 'authKey',
        description:
            'API key issued by the operator. Set in the `authKey` HTTP ' +
            'header on every /v1/* request. Master keys see all companies; ' +
            'normal keys are scoped to their owning company.',
    },
};

const errorResponse = {
    type: 'object',
    properties: {
        message: { type: 'string' },
        error: { type: 'string' },
    },
    required: ['message'],
};

const customerSchema = {
    type: 'object',
    properties: {
        custId: { type: 'integer', readOnly: true },
        custCompanyName: { type: 'string' },
        custFName: { type: 'string' },
        custLName: { type: 'string' },
        custAddress1: { type: 'string' },
        custAddress2: { type: 'string' },
        custCity: { type: 'string' },
        custState: { type: 'string' },
        custZip: { type: 'string' },
        custPhone: { type: 'string' },
        custEmail: { type: 'string', format: 'email' },
        custCompId: { type: 'integer' },
        custArch: { type: 'boolean', readOnly: true },
    },
};

const timeEntrySchema = {
    type: 'object',
    properties: {
        teId: { type: 'integer', readOnly: true },
        teCustId: { type: 'integer' },
        teCompId: { type: 'integer', readOnly: true },
        teDescription: { type: 'string' },
        teStartedAt: { type: 'string', format: 'date-time' },
        teEndedAt: { type: 'string', format: 'date-time', nullable: true },
        teMinutes: { type: 'integer', nullable: true, readOnly: true },
        teBillable: { type: 'boolean', default: true },
        teArch: { type: 'boolean', readOnly: true },
    },
};

const spec = {
    openapi: '3.0.3',
    info: {
        title: 'TimeTrackerAPI',
        version: pkg.version || '1.0.0',
        description:
            'Open-source Node.js + PostgreSQL TimeTrackerAPI. Customer and ' +
            'time-entry records, scoped by company via an `authKey` header. ' +
            'Source: https://github.com/CryptoJones/TimeTrackerAPI / ' +
            'https://codeberg.org/CryptoJones/TimeTrackerAPI.',
        license: {
            name: 'Apache 2.0',
            url: 'https://www.apache.org/licenses/LICENSE-2.0',
        },
    },
    servers: [
        { url: 'http://localhost:3000', description: 'Local dev' },
        { url: 'http://node.timetrackerapi.com', description: 'Reference deployment' },
    ],
    components: {
        securitySchemes,
        schemas: {
            Customer: customerSchema,
            TimeEntry: timeEntrySchema,
            Error: errorResponse,
        },
    },
    paths: {
        '/healthz': {
            get: {
                summary: 'Liveness + DB readiness probe',
                description: 'No auth required. Used by orchestrators (Docker, k8s, uptime monitors).',
                responses: {
                    200: {
                        description: 'OK — DB ping succeeded',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', enum: ['ok'] },
                                        db: { type: 'string', enum: ['ok'] },
                                        uptime_s: { type: 'integer' },
                                        version: { type: 'string' },
                                        elapsed_ms: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                    503: { description: 'Degraded — DB unreachable' },
                },
            },
        },
        '/v1/customer/{id}': {
            get: {
                summary: 'Get one customer by id',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                ],
                responses: {
                    200: { description: 'Found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
                    403: { description: 'Missing or invalid authKey', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
                },
            },
        },
        '/v1/customer/bycompany/{id}': {
            get: {
                summary: 'List customers in a company (paginated)',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                    { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
                ],
                responses: {
                    200: { description: 'OK' },
                    403: { description: 'Missing or invalid authKey' },
                },
            },
        },
        '/v1/customer': {
            post: {
                summary: 'Create a customer',
                security: [{ authKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/Customer' } },
                    },
                },
                responses: {
                    201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Customer' } } } },
                    400: { description: 'Bad request' },
                    403: { description: 'Missing or invalid authKey' },
                },
            },
        },
        '/v1/timeentry': {
            post: {
                summary: 'Create a time entry',
                security: [{ authKey: [] }],
                requestBody: {
                    required: true,
                    content: {
                        'application/json': { schema: { $ref: '#/components/schemas/TimeEntry' } },
                    },
                },
                responses: {
                    201: { description: 'Created' },
                    400: { description: 'Bad request — missing teCustId or teStartedAt' },
                    403: { description: 'Missing or invalid authKey' },
                },
            },
        },
        '/v1/timeentry/{id}': {
            get: {
                summary: 'Get one time entry',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Found' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            patch: {
                summary: 'Partial update of a time entry',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/TimeEntry' } } } },
                responses: { 200: { description: 'Updated' }, 400: { description: 'No updatable fields supplied' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
            delete: {
                summary: 'Soft-delete a time entry',
                security: [{ authKey: [] }],
                parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
                responses: { 200: { description: 'Archived' }, 404: { description: 'Not found' }, 403: { description: 'Auth failure' } },
            },
        },
        '/v1/timeentry/bycompany/{id}': {
            get: {
                summary: 'List time entries for a company',
                security: [{ authKey: [] }],
                parameters: [
                    { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
                    { name: 'customerId', in: 'query', schema: { type: 'integer' } },
                    { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
                    { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } },
                ],
                responses: { 200: { description: 'OK' }, 400: { description: 'Invalid company id' }, 403: { description: 'Auth failure' } },
            },
        },
    },
};

module.exports = spec;
