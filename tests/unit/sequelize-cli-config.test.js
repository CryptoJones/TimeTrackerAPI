// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Pin that `app/config/sequelize-cli.config.js` and
// `app/config/db.config.js` agree on the global Sequelize `define`
// defaults that affect schema-shape decisions (schema, timestamps).
// Drift between them is a silent bug source — npm start vs.
// npm run migrate could otherwise inherit different defaults.
// PR #148 flipped db.config.js's `timestamps` from false to true and
// missed sequelize-cli.config.js; this guards against a recurrence.

import { describe, test, expect } from 'vitest';

const dbConfig = require('../../app/config/db.config.js');
const cliConfig = require('../../app/config/sequelize-cli.config.js');

describe('sequelize-cli.config.js stays in sync with db.config.js', () => {
    const runtimeDefine = dbConfig.sequelize.options.define;

    test('cli `development` env mirrors runtime `define.timestamps`', () => {
        expect(cliConfig.development.define.timestamps).toBe(runtimeDefine.timestamps);
    });
    test('cli `test` env mirrors runtime `define.timestamps`', () => {
        expect(cliConfig.test.define.timestamps).toBe(runtimeDefine.timestamps);
    });
    test('cli `production` env mirrors runtime `define.timestamps`', () => {
        expect(cliConfig.production.define.timestamps).toBe(runtimeDefine.timestamps);
    });

    test('cli `development` env mirrors runtime `define.schema`', () => {
        expect(cliConfig.development.define.schema).toBe(runtimeDefine.schema);
    });
    test('cli `test` env mirrors runtime `define.schema`', () => {
        expect(cliConfig.test.define.schema).toBe(runtimeDefine.schema);
    });
    test('cli `production` env mirrors runtime `define.schema`', () => {
        expect(cliConfig.production.define.schema).toBe(runtimeDefine.schema);
    });
});
