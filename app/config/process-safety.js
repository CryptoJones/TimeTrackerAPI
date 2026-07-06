// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * process-safety.js — a process-level net for escaped async errors (audit
 * item #9). The codebase awaits/catches its async, so neither handler is
 * expected to fire in practice; this is defense-in-depth so an escaped error
 * is never silent.
 *
 * Policy (adjustable by an operator):
 *   - unhandledRejection → LOG and continue. A single stray missed `.catch`
 *     shouldn't drop every in-flight connection; Node's default (crash) is the
 *     more aggressive alternative if fail-fast is preferred.
 *   - uncaughtException  → LOG then exit(1). After an uncaught throw the
 *     process may be in a corrupt state, so hand off to a supervisor
 *     (systemd / k8s / docker) to restart a clean one rather than resume.
 */

const log = require('./logger.js');

/** Log an escaped promise rejection. Deliberately does NOT exit. */
function onUnhandledRejection(reason) {
    log.error({ err: reason }, 'unhandledRejection (no known live escape path; logged as defense-in-depth)');
}

/** Log an uncaught exception, then exit non-zero for a clean supervised restart. */
function onUncaughtException(err, exit) {
    log.error({ err }, 'uncaughtException — exiting(1) for a clean restart');
    (typeof exit === 'function' ? exit : process.exit)(1);
}

/**
 * Register both handlers on `proc` (defaults to the real process). Call once
 * at startup. Kept out of module top-level so importing this file for tests
 * does not mutate the global process.
 */
function installProcessSafetyNet(proc) {
    const p = proc || process;
    p.on('unhandledRejection', onUnhandledRejection);
    p.on('uncaughtException', (err) => onUncaughtException(err, p.exit ? p.exit.bind(p) : undefined));
}

module.exports = { onUnhandledRejection, onUncaughtException, installProcessSafetyNet };
