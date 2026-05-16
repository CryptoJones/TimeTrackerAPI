-- SPDX-License-Identifier: Apache-2.0
-- Copyright 2026 Aaron K. Clark
--
-- TimeEntry table for the /v1/timeentry endpoints.
-- Apply after the base TimeTracker.sql with:
--   sudo -u postgres psql -d timetracker -f setup/TimeEntry.sql
--
-- The table follows the existing schema conventions:
--   - dbo schema
--   - 2-3 char column prefix (te = TimeEntry)
--   - SERIAL primary key
--   - soft-delete via teArch / teArchiveDate (matches Customer.custArch
--     and ApiKey.akArchive patterns)
--   - timestamps stored as TIMESTAMPTZ

SET search_path TO dbo;

CREATE TABLE IF NOT EXISTS dbo."TimeEntry" (
    "teId"          SERIAL          PRIMARY KEY,
    "teCustId"      INTEGER         NOT NULL REFERENCES dbo."Customer"("custId"),
    "teCompId"      INTEGER         NOT NULL,
    "teDescription" TEXT,
    "teStartedAt"   TIMESTAMPTZ     NOT NULL,
    "teEndedAt"     TIMESTAMPTZ,
    "teMinutes"     INTEGER,
    "teBillable"    BOOLEAN         NOT NULL DEFAULT TRUE,
    "teArch"        BOOLEAN         NOT NULL DEFAULT FALSE,
    "teArchiveDate" TIMESTAMP(3) WITHOUT TIME ZONE
);

ALTER TABLE dbo."TimeEntry" OWNER TO timetracker;

-- Hot-path indexes:
--  * listByCompany: filtered by (teCompId, teArch) with optional
--    teCustId and date-range on teStartedAt.
--  * getById / update / remove: PK lookup is already free.
CREATE INDEX IF NOT EXISTS "TimeEntry_company_started_idx"
    ON dbo."TimeEntry" ("teCompId", "teArch", "teStartedAt" DESC);

CREATE INDEX IF NOT EXISTS "TimeEntry_customer_started_idx"
    ON dbo."TimeEntry" ("teCustId", "teStartedAt" DESC)
    WHERE "teArch" = FALSE;
