// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * custom-field.js — typed custom-field validation (#409). PURE: no DB, no
 * I/O. `coerceValue` turns a raw input into the canonical value for a
 * field type (or an error); `validateAgainstDefs` checks a whole values
 * object against a set of CustomFieldDefs — coercing knowns, rejecting
 * unknown keys, and enforcing required. Returns `{ values }` on success or
 * `{ errors }` (a field→message map).
 */

const TYPES = ['text', 'number', 'date', 'boolean'];
const ENTITIES = ['customer', 'job', 'timeentry'];

/** Coerce a raw value to its typed form. @returns { value } or { error }. */
function coerceValue(type, raw) {
    switch (type) {
        case 'text':
            return { value: String(raw) };
        case 'number': {
            const n = Number(raw);
            return Number.isFinite(n) ? { value: n } : { error: 'must be a number' };
        }
        case 'boolean': {
            if (typeof raw === 'boolean') return { value: raw };
            if (raw === 'true' || raw === 1 || raw === '1') return { value: true };
            if (raw === 'false' || raw === 0 || raw === '0') return { value: false };
            return { error: 'must be a boolean' };
        }
        case 'date': {
            const s = String(raw);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) {
                return { error: 'must be a YYYY-MM-DD date' };
            }
            return { value: s };
        }
        default:
            return { error: 'unknown field type' };
    }
}

const isEmpty = (v) => v == null || v === '';

/**
 * Validate a values object against the company's defs for an entity.
 * @param defs array of CustomFieldDef ({ cfdName, cfdType, cfdRequired }).
 * @param values a { fieldName: raw } object.
 */
function validateAgainstDefs(defs, values) {
    const list = Array.isArray(defs) ? defs : [];
    const vals = (values && typeof values === 'object') ? values : {};
    const byName = new Map(list.map((d) => [d.cfdName, d]));
    const out = {};
    const errors = {};

    // Reject values for fields that aren't defined.
    for (const key of Object.keys(vals)) {
        if (!byName.has(key)) errors[key] = 'unknown custom field';
    }

    for (const d of list) {
        const raw = vals[d.cfdName];
        if (isEmpty(raw)) {
            if (d.cfdRequired) errors[d.cfdName] = 'is required';
            continue;
        }
        const r = coerceValue(d.cfdType, raw);
        if (r.error) errors[d.cfdName] = r.error;
        else out[d.cfdName] = r.value;
    }

    if (Object.keys(errors).length) return { errors };
    return { values: out };
}

module.exports = { TYPES, ENTITIES, coerceValue, validateAgainstDefs };
