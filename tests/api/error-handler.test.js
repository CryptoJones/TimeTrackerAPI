// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Tests for the global error handler + 404 fallthrough.

import { describe, test, expect, beforeAll } from 'vitest';
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
        // 4xx WITHOUT expose=true: message should NOT pass through
        // (it could leak internals from an internal middleware /
        // library that throws with detail).
        const err = new Error('Sensitive internal detail');
        err.status = 418;
        next(err);
    });
    app.get('/explode/exposed', (req, res, next) => {
        // 4xx WITH expose=true (http-errors convention): message
        // is safe to surface to the client.
        const err = new Error('I am a teapot');
        err.status = 418;
        err.expose = true;
        next(err);
    });
    app.get('/explode/payload-too-large', (req, res, next) => {
        // Simulates body-parser's PayloadTooLargeError shape.
        const err = new Error('request entity too large');
        err.status = 413;
        err.expose = true;  // body-parser sets this
        next(err);
    });
    app.get('/explode/sequelize-style-4xx', (req, res, next) => {
        // 4xx-status from an internal library (Sequelize, pg driver,
        // etc.) — these set a status but DON'T set expose. We must
        // NOT echo their .message.
        const err = new Error('SequelizeValidationError: column "X" cannot be null');
        err.status = 400;
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
    });

    test('4xx without err.expose returns a generic message (no detail leak)', async () => {
        const res = await request(app).get('/explode/with-status');
        // Status echoed; sensitive .message NOT echoed.
        expect(res.body.message).not.toMatch(/sensitive internal detail/i);
        // We use a per-status generic, or fall back to "Request error."
        // for non-canonical statuses (like 418).
        expect(typeof res.body.message).toBe('string');
        expect(res.body.message.length).toBeGreaterThan(0);
    });

    test('4xx WITH err.expose=true echoes the message (http-errors convention)', async () => {
        const res = await request(app).get('/explode/exposed');
        expect(res.status).toBe(418);
        expect(res.body.message).toBe('I am a teapot');
    });

    test('PayloadTooLargeError-style 413 (expose=true) passes the message through', async () => {
        const res = await request(app).get('/explode/payload-too-large');
        expect(res.status).toBe(413);
        expect(res.body.message).toMatch(/request entity too large/i);
    });

    test('Sequelize-style 4xx (no expose) gets a generic 400 message', async () => {
        const res = await request(app).get('/explode/sequelize-style-4xx');
        expect(res.status).toBe(400);
        const text = JSON.stringify(res.body);
        expect(text).not.toMatch(/Sequelize/);
        expect(text).not.toMatch(/column.*X/);
        expect(res.body.message).toMatch(/bad request/i);
    });

    test('5xx response carries requestId when one is available', async () => {
        // The OpenAPI Error schema (#336) declares `requestId` as an
        // optional field. The handler reads it from `req.id` or
        // `req.log.bindings().reqId` (pino-http's binding). Stand up
        // a minimal app where the middleware order matches server.js
        // — id-tagging middleware FIRST, then the explosion route —
        // and assert the value lands in the 500 body verbatim so
        // operators can correlate it to the structured log line.
        const idApp = express();
        idApp.use(express.json());
        idApp.use((req, res, next) => {
            req.id = 'test-req-id-correlator-1234';
            next();
        });
        idApp.get('/boom', (req, res, next) => {
            next(new Error('something failed deep inside'));
        });
        idApp.use(errorHandler);
        const res = await request(idApp).get('/boom');
        expect(res.status).toBe(500);
        expect(res.body.message).toBe('Error!');
        expect(res.body.requestId).toBe('test-req-id-correlator-1234');
    });

    test('5xx response omits requestId when none is available (no synthetic empty string)', async () => {
        // The original /explode/500 route doesn't set req.id, so the
        // handler should leave the field off entirely rather than
        // emit `requestId: ""` or `requestId: null` — clients can
        // distinguish "no correlator" from "empty correlator".
        const res = await request(app).get('/explode/500');
        expect(res.status).toBe(500);
        expect(res.body.requestId).toBeUndefined();
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

    test('redacts sensitive query params in the echoed path', async () => {
        // SDK bugs that put authKey in the query string instead of the
        // header would otherwise have their secret echoed back in the
        // 404 response body. Pin the redaction so any proxy / client
        // error-logger capturing the body cannot persist the secret.
        const res = await request(app).get('/no/such/path?authKey=super-secret&q=ok');
        expect(res.status).toBe(404);
        expect(res.body.path).toBe('/no/such/path?authKey=<REDACTED>&q=ok');
        expect(res.body.path).not.toContain('super-secret');
    });
});
