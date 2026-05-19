// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// HTTP tests for /v1/timeentry endpoints.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
// body-parser dropped; express has it built-in since 4.16

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: {
        query: vi.fn().mockResolvedValue([]),
        QueryTypes: { SELECT: 'SELECT' },
    },
    Sequelize: { Op: { gte: Symbol('gte'), lte: Symbol('lte') } },
    Customer: { findByPk: vi.fn(), findAll: vi.fn() },
    ApiKey: {},
    ApiMaster: {},
    TimeEntry: {
        findByPk: vi.fn().mockResolvedValue(null),
        findAll: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ teId: 1 }),
    },
}));

let app;

beforeAll(async () => {
    const router = (await import('../../app/routers/router.js')).default
        || require('../../app/routers/router.js');
    app = express();
    app.use(express.json());
    app.use('/', router);
});

describe('/v1/timeentry routing', () => {
    test('POST /v1/timeentry route is mounted', async () => {
        const res = await request(app).post('/v1/timeentry').send({});
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });

    test('GET /v1/timeentry/:id route is mounted', async () => {
        const res = await request(app).get('/v1/timeentry/1');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });

    test('GET /v1/timeentry/bycompany/:id route is mounted', async () => {
        const res = await request(app).get('/v1/timeentry/bycompany/1');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });

    test('PATCH /v1/timeentry/:id route is mounted', async () => {
        const res = await request(app).patch('/v1/timeentry/1').send({});
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });

    test('DELETE /v1/timeentry/:id route is mounted', async () => {
        const res = await request(app).delete('/v1/timeentry/1');
        expect(res.body).toBeTypeOf('object');
        expect(res.body.message).toBeDefined();
    });
});

describe('POST /v1/timeentry auth contract', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app)
            .post('/v1/timeentry')
            .send({ teCustId: 1, teStartedAt: '2026-05-16T00:00:00Z' });
        expect(res.status).toBe(403);
    });

    test('unknown authKey returns 403', async () => {
        const res = await request(app)
            .post('/v1/timeentry')
            .set('authKey', 'unknown-key')
            .send({ teCustId: 1, teStartedAt: '2026-05-16T00:00:00Z' });
        expect(res.status).toBe(403);
    });
});

describe('POST /v1/timeentry body validation', () => {
    test('400 when teEndedAt is strictly before teStartedAt', async () => {
        // Inverted range. Schema runs before auth — this should 400
        // with a refinement issue on teEndedAt, never reaching the
        // controller where the silent `teMinutes = null` fallback
        // would otherwise accept the bad write.
        const res = await request(app)
            .post('/v1/timeentry')
            .send({
                teCustId: 1,
                teStartedAt: '2026-05-16T10:00:00Z',
                teEndedAt:   '2026-05-16T09:00:00Z',
            });
        expect(res.status).toBe(400);
        expect(res.body.issues).toBeDefined();
        const issue = res.body.issues.find((i) => i.path === 'teEndedAt');
        expect(issue).toBeDefined();
        expect(issue.message).toMatch(/at or after teStartedAt/i);
    });

    test('201-path (schema passes) when teEndedAt equals teStartedAt', async () => {
        // Exact equality is allowed: a zero-minute entry is a valid
        // edge case (someone clocking a meeting that ran 0 minutes).
        // Schema accepts; auth/controller is what decides the final
        // status — without an authKey it'll 403, but the point is
        // the schema didn't 400.
        const res = await request(app)
            .post('/v1/timeentry')
            .send({
                teCustId: 1,
                teStartedAt: '2026-05-16T09:00:00Z',
                teEndedAt:   '2026-05-16T09:00:00Z',
            });
        expect(res.status).not.toBe(400);
    });

    test('passes when teEndedAt is omitted (in-flight entry)', async () => {
        // Open-ended entry is the canonical "clock in but not out yet"
        // path. Refinement must not fire when teEndedAt is undefined.
        const res = await request(app)
            .post('/v1/timeentry')
            .send({
                teCustId: 1,
                teStartedAt: '2026-05-16T09:00:00Z',
            });
        expect(res.status).not.toBe(400);
    });
});

describe('PATCH /v1/timeentry/:id body validation', () => {
    test('400 when both bounds are sent and teEndedAt is before teStartedAt', async () => {
        const res = await request(app)
            .patch('/v1/timeentry/1')
            .send({
                teStartedAt: '2026-05-16T10:00:00Z',
                teEndedAt:   '2026-05-16T09:00:00Z',
            });
        expect(res.status).toBe(400);
        expect(res.body.issues).toBeDefined();
        const issue = res.body.issues.find((i) => i.path === 'teEndedAt');
        expect(issue).toBeDefined();
    });

    test('single-bound PATCH (only teEndedAt) is not blocked by the schema', async () => {
        // The cross-field refinement can't validate a single-bound
        // PATCH without seeing the existing row, so the schema must
        // not reject it; the controller's `computeMinutes` is the
        // only thing that sees the merged value. (Tightening that
        // path is a separate, controller-layer change.)
        const res = await request(app)
            .patch('/v1/timeentry/1')
            .send({ teEndedAt: '2026-05-16T09:00:00Z' });
        expect(res.status).not.toBe(400);
    });
});

describe('GET /v1/timeentry/:id auth contract', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app).get('/v1/timeentry/1');
        expect(res.status).toBe(403);
    });
});

describe('GET /v1/timeentry/bycompany/:id auth contract', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app).get('/v1/timeentry/bycompany/1');
        expect(res.status).toBe(403);
    });

    test('returns 400 for non-integer company id', async () => {
        const res = await request(app)
            .get('/v1/timeentry/bycompany/not-a-number')
            .set('authKey', 'whatever');
        expect(res.status).toBe(400);
    });
});

describe('PATCH /v1/timeentry/:id auth contract', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app).patch('/v1/timeentry/1').send({ teDescription: 'x' });
        expect(res.status).toBe(403);
    });
});

describe('DELETE /v1/timeentry/:id auth contract', () => {
    test('returns 403 when authKey header is missing', async () => {
        const res = await request(app).delete('/v1/timeentry/1');
        expect(res.status).toBe(403);
    });
});

describe('computeMinutes helper', () => {
    // Import dynamically so vi.mock has been applied.
    let computeMinutes;
    beforeAll(async () => {
        const ctrl = await import('../../app/controllers/timeentrycontroller.js');
        computeMinutes = ctrl._internals.computeMinutes;
    });

    test('returns null when either bound is missing', () => {
        expect(computeMinutes(null, '2026-01-01T00:00:00Z')).toBe(null);
        expect(computeMinutes('2026-01-01T00:00:00Z', null)).toBe(null);
        expect(computeMinutes(null, null)).toBe(null);
    });

    test('returns minutes rounded for a simple range', () => {
        expect(computeMinutes('2026-05-16T09:00:00Z', '2026-05-16T10:00:00Z')).toBe(60);
        expect(computeMinutes('2026-05-16T09:00:00Z', '2026-05-16T09:30:00Z')).toBe(30);
    });

    test('returns null when end is before start (operator error)', () => {
        expect(computeMinutes('2026-05-16T10:00:00Z', '2026-05-16T09:00:00Z')).toBe(null);
    });

    test('returns null for unparseable dates', () => {
        expect(computeMinutes('not-a-date', 'also-not')).toBe(null);
    });
});
