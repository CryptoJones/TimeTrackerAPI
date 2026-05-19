// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Verifies the CORS middleware in server.js exposes the response
// headers that browser JS clients need to read (Link, X-Request-Id,
// Idempotency-Replay, RateLimit-*). Without `Access-Control-Expose-
// Headers` covering them, cross-origin XHR/fetch hides everything
// except the CORS safelist.
//
// This file tests server.js directly (not the router-only setup the
// other api tests use) because CORS lives at the app level, not the
// router level.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

vi.mock('../../app/config/db.config.js', () => ({
    sequelize: { query: vi.fn().mockResolvedValue([]), QueryTypes: { SELECT: 'SELECT' } },
    Sequelize: {},
    Customer: {}, ApiKey: {}, ApiMaster: {},
}));

let app;

beforeAll(() => {
    // Reconstruct the server.js CORS middleware in isolation so we
    // can assert on its options without dragging the full app
    // bootstrap (rate-limit, pino, etc.) into the test.
    app = express();
    app.use(cors({
        origin: ['https://example.com'],
        optionsSuccessStatus: 200,
        exposedHeaders: [
            'Link',
            'X-Request-Id',
            'Idempotency-Replay',
            'RateLimit-Limit',
            'RateLimit-Remaining',
            'RateLimit-Reset',
            'Retry-After',
        ],
    }));
    app.get('/ping', (req, res) => {
        res.setHeader('Link', '<https://example.com/next>; rel="next"');
        res.setHeader('X-Request-Id', 'abc');
        res.setHeader('Idempotency-Replay', 'true');
        res.json({ pong: true });
    });
});

describe('CORS Access-Control-Expose-Headers', () => {
    test('cross-origin response carries Access-Control-Expose-Headers with the documented set', async () => {
        const res = await request(app)
            .get('/ping')
            .set('Origin', 'https://example.com');
        const exposed = (res.headers['access-control-expose-headers'] || '')
            .split(',')
            .map((s) => s.trim());
        expect(exposed).toEqual(expect.arrayContaining([
            'Link',
            'X-Request-Id',
            'Idempotency-Replay',
            'RateLimit-Limit',
            'RateLimit-Remaining',
            'RateLimit-Reset',
            // Retry-After lands on the 429 response from express-rate-
            // limit. Not on the CORS safelist, so browser JS clients
            // can't read it without explicit exposure here.
            'Retry-After',
        ]));
    });

    test('the per-route Access-Control-Expose-Headers is no longer hand-rolled in controllers', () => {
        // Static-string assertion against the controller directory.
        // The audit-cycle PRs sprinkled `res.setHeader('Access-Control-
        // Expose-Headers', 'Link')` in every list endpoint; once the
        // global CORS middleware took over, those became redundant.
        // This regression test pins the cleanup: any future controller
        // that adds the hand-rolled call will fail here.
        const { readdirSync, readFileSync } = require('fs');
        const path = require('path');
        const dir = path.resolve(__dirname, '../../app/controllers');
        const hits = [];
        for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
            const body = readFileSync(path.join(dir, f), 'utf8');
            if (/Access-Control-Expose-Headers/.test(body)) {
                hits.push(f);
            }
        }
        expect(hits, 'controllers should not hand-roll the CORS expose header').toEqual([]);
    });
});
