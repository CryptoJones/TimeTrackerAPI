// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
//
// Hash ApiKey.akKEY + ApiMaster.amKEY at rest.
//
// Background (audit issue #73, P1-A):
//   The two key columns were UUID-typed and stored the raw token
//   verbatim. Any DB leak or read-replica snapshot meant every
//   active operator's credential was immediately usable. After
//   this migration the columns store a SHA-256 hex digest of the
//   raw token; auth.js hashes the incoming header before lookup,
//   so operator-held tokens keep working without re-issue.
//
// Migration steps:
//   1. Change column types from UUID to TEXT (USING cast() so PG
//      doesn't error on existing rows). Drop NOT NULL temporarily
//      so we can write the hash without race-conditions on length.
//   2. UPDATE each row's <key> to SHA256(<old value>) in JS.
//      Skip rows whose value is already 64 hex chars (operator
//      may have run a partial migration manually).
//   3. Re-apply NOT NULL.
//
// Rollback (down):
//   Cannot recover plaintext from a SHA-256 hash. The down step
//   only reverts the column TYPE to UUID; rows will then need to
//   be manually rotated. Document that operationally.

'use strict';

const crypto = require('crypto');

function sha256(s) {
    return crypto.createHash('sha256').update(String(s)).digest('hex');
}

module.exports = {
    async up(queryInterface, Sequelize) {
        const SCHEMA = 'dbo';
        const sequelize = queryInterface.sequelize;

        // --- ApiKey ---
        await sequelize.query(
            `ALTER TABLE "${SCHEMA}"."ApiKey"
                ALTER COLUMN "akKEY" DROP NOT NULL`,
        );
        await sequelize.query(
            `ALTER TABLE "${SCHEMA}"."ApiKey"
                ALTER COLUMN "akKEY" TYPE TEXT USING "akKEY"::text`,
        );

        const apiKeyRows = await sequelize.query(
            `SELECT "akId", "akKEY" FROM "${SCHEMA}"."ApiKey"`,
            { type: Sequelize.QueryTypes.SELECT },
        );
        for (const r of apiKeyRows) {
            const v = r.akKEY || '';
            // Skip already-hashed rows: SHA-256 hex is exactly 64 chars and
            // matches /^[0-9a-f]+$/. Real UUIDs (36 chars w/ dashes) don't.
            if (v.length === 64 && /^[0-9a-f]+$/.test(v)) continue;
            const hashed = sha256(v);
            await sequelize.query(
                `UPDATE "${SCHEMA}"."ApiKey" SET "akKEY" = :hashed WHERE "akId" = :id`,
                { replacements: { hashed, id: r.akId } },
            );
        }

        await sequelize.query(
            `ALTER TABLE "${SCHEMA}"."ApiKey"
                ALTER COLUMN "akKEY" SET NOT NULL`,
        );
        // Index the hashed key so WHERE "akKEY" = ? lookups stay
        // fast. Non-unique on purpose: archived rows from key
        // rotation may share a hash with their non-archived
        // replacement until they're physically deleted, and uniqueness
        // was never enforced as a constraint pre-migration.
        await sequelize.query(
            `CREATE INDEX IF NOT EXISTS "ApiKey_keyHash_idx" ON "${SCHEMA}"."ApiKey" ("akKEY")`,
        );

        // --- ApiMaster ---
        await sequelize.query(
            `ALTER TABLE "${SCHEMA}"."ApiMaster"
                ALTER COLUMN "amKEY" DROP NOT NULL`,
        );
        await sequelize.query(
            `ALTER TABLE "${SCHEMA}"."ApiMaster"
                ALTER COLUMN "amKEY" TYPE TEXT USING "amKEY"::text`,
        );

        const apiMasterRows = await sequelize.query(
            `SELECT "amId", "amKEY" FROM "${SCHEMA}"."ApiMaster"`,
            { type: Sequelize.QueryTypes.SELECT },
        );
        for (const r of apiMasterRows) {
            const v = r.amKEY || '';
            if (v.length === 64 && /^[0-9a-f]+$/.test(v)) continue;
            const hashed = sha256(v);
            await sequelize.query(
                `UPDATE "${SCHEMA}"."ApiMaster" SET "amKEY" = :hashed WHERE "amId" = :id`,
                { replacements: { hashed, id: r.amId } },
            );
        }

        await sequelize.query(
            `ALTER TABLE "${SCHEMA}"."ApiMaster"
                ALTER COLUMN "amKEY" SET NOT NULL`,
        );
        await sequelize.query(
            `CREATE INDEX IF NOT EXISTS "ApiMaster_keyHash_idx" ON "${SCHEMA}"."ApiMaster" ("amKEY")`,
        );
    },

    async down(queryInterface, Sequelize) {
        const SCHEMA = 'dbo';
        const sequelize = queryInterface.sequelize;

        // Drop the lookup indexes first; can't change column type while
        // an index references it.
        await sequelize.query(`DROP INDEX IF EXISTS "${SCHEMA}"."ApiKey_keyHash_idx"`);
        await sequelize.query(`DROP INDEX IF EXISTS "${SCHEMA}"."ApiMaster_keyHash_idx"`);

        // Convert TYPE back to UUID. Any rows whose current value is a
        // SHA-256 hex string will fail the cast — the operator has to
        // rotate them to fresh UUIDs first.
        await sequelize.query(
            `ALTER TABLE "${SCHEMA}"."ApiKey"
                ALTER COLUMN "akKEY" TYPE uuid USING "akKEY"::uuid`,
        );
        await sequelize.query(
            `ALTER TABLE "${SCHEMA}"."ApiMaster"
                ALTER COLUMN "amKEY" TYPE uuid USING "amKEY"::uuid`,
        );
    },
};
