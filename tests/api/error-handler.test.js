// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Tests for the global error handler + 404 fallthrough.

import { describe, test, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { errorHandler, notFound } from '../../app/middleware/error-handler.js';

let app;

beforeAll(() => {
    app = express();
    app.use(express.json());

    // Routes that intentionally throw / next(err) so we can exercise
    // the error handler from inside a test, without depending on the
    // whole router.
    app.get('/explode/500', (req, res, next) => {
        next(new Error('boom'));
    });
    app.get('/explode/with-status', (req, res, next) => {
        const err = new Error('I am a teapot');
        err.status = 418;
        next(err);
    });
    app.get('/explode/leaky', (req, res, next) => {
        // Simulates a Sequelize-style error whose .message would leak
        // a hostname or stack frame if we passed it straight through.
        const err = new Error('SequelizeConnectionRefusedError: connect ECONNREFUSED 10.0.0.42:5432');
        err.status = 500;
        next(err);
    });
    app.use(notFound);
    app.use(errorHandler);
});

describe('global error handler', () => {
    test('500 errors return JSON {message: "Error!"} not HTML', async () => {
        const res = await request(app).get('/explode/500');
        expect(res.status).toBe(500);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body.message).toBe('Error!');
    });

    test('500 errors never leak the original message (no stack info)', async () => {
        const res = await request(app).get('/explode/leaky');
        const text = JSON.stringify(res.body);
        expect(text).not.toMatch(/ECONNREFUSED/);
        expect(text).not.toMatch(/10\.0\.0\.42/);
        expect(text).not.toMatch(/Sequelize/);
    });

    test('honors a numeric err.status in 4xx range', async () => {
        const res = await request(app).get('/explode/with-status');
        expect(res.status).toBe(418);
        // For 4xx the message goes through (it's a client error, not a server one)
        expect(res.body.message).toBe('I am a teapot');
    });
});

describe('404 fallthrough', () => {
    test('unmatched route returns JSON 404 (not HTML)', async () => {
        const res = await request(app).get('/no/such/path');
        expect(res.status).toBe(404);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.body.message).toMatch(/not found/i);
        expect(res.body.path).toBe('/no/such/path');
        expect(res.body.method).toBe('GET');
    });

    test('unmatched method on a known path returns 404 (Express convention)', async () => {
        // We don't have an OPTIONS handler so this should fall to notFound.
        const res = await request(app).post('/explode/500');
        expect(res.status).toBe(404);
    });
});
