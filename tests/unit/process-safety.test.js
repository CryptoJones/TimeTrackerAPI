// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Unit tests for the process-level safety net (#9). The handlers are
// injectable (exit / proc) so we can assert their effects without actually
// exiting the test runner.

import { describe, test, expect, vi } from 'vitest';

const { onUnhandledRejection, onUncaughtException, installProcessSafetyNet } = require('../../app/config/process-safety.js');
const log = require('../../app/config/logger.js');

describe('process-safety net (#9)', () => {
    test('onUncaughtException logs and exits(1) via the injected exit', () => {
        const exit = vi.fn();
        const spy = vi.spyOn(log, 'error').mockImplementation(() => {});
        onUncaughtException(new Error('boom'), exit);
        expect(exit).toHaveBeenCalledWith(1);
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    test('onUnhandledRejection logs and does NOT exit or throw', () => {
        const spy = vi.spyOn(log, 'error').mockImplementation(() => {});
        expect(() => onUnhandledRejection(new Error('stray'))).not.toThrow();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    test('installProcessSafetyNet registers both handlers; only uncaught exits', () => {
        const handlers = {};
        const proc = { on: (evt, fn) => { handlers[evt] = fn; }, exit: vi.fn() };
        installProcessSafetyNet(proc);
        expect(typeof handlers.unhandledRejection).toBe('function');
        expect(typeof handlers.uncaughtException).toBe('function');

        const spy = vi.spyOn(log, 'error').mockImplementation(() => {});
        handlers.uncaughtException(new Error('x'));
        expect(proc.exit).toHaveBeenCalledWith(1);
        // The rejection handler logs but must not exit.
        handlers.unhandledRejection(new Error('y'));
        expect(proc.exit).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});
