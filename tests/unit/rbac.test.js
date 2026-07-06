// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { ROLES, DEFAULT_ROLE, isRole, roleRank, permissionsFor, hasPermission, canAssignRole } from '../../app/services/rbac.js';

describe('rbac (#448)', () => {
    test('ROLES ordered highest→lowest; default is member', () => {
        expect(ROLES).toEqual(['owner', 'admin', 'manager', 'member', 'viewer']);
        expect(DEFAULT_ROLE).toBe('member');
        expect(roleRank('owner')).toBeLessThan(roleRank('viewer'));
        expect(roleRank('nope')).toBe(-1);
    });

    test('isRole validates membership', () => {
        expect(isRole('admin')).toBe(true);
        expect(isRole('superuser')).toBe(false);
    });

    test('permissions are cumulative down the hierarchy', () => {
        // Everything a viewer can do, a member (and up) can too.
        for (const p of permissionsFor('viewer')) {
            expect(hasPermission('member', p)).toBe(true);
            expect(hasPermission('owner', p)).toBe(true);
        }
        expect(hasPermission('viewer', 'time:write')).toBe(false);
        expect(hasPermission('member', 'time:write')).toBe(true);
        expect(hasPermission('member', 'invoice:write')).toBe(false);
        expect(hasPermission('manager', 'invoice:write')).toBe(true);
        expect(hasPermission('manager', 'user:manage-roles')).toBe(false);
        expect(hasPermission('admin', 'user:manage-roles')).toBe(true);
        expect(hasPermission('admin', 'company:manage')).toBe(false);
        expect(hasPermission('owner', 'company:manage')).toBe(true);
    });

    test('unknown role grants nothing', () => {
        expect(permissionsFor('ghost')).toEqual([]);
        expect(hasPermission('ghost', 'time:read')).toBe(false);
    });

    test('canAssignRole: needs manage-roles and no privilege escalation', () => {
        // Admin can assign member/viewer/manager/admin, but NOT owner.
        expect(canAssignRole('admin', 'member')).toBe(true);
        expect(canAssignRole('admin', 'admin')).toBe(true);
        expect(canAssignRole('admin', 'owner')).toBe(false);
        // Owner can assign anything.
        expect(canAssignRole('owner', 'owner')).toBe(true);
        // Manager lacks manage-roles entirely.
        expect(canAssignRole('manager', 'viewer')).toBe(false);
        // Unknown target rejected.
        expect(canAssignRole('owner', 'wizard')).toBe(false);
    });
});
