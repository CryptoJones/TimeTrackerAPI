// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

import { describe, test, expect } from 'vitest';
import { ROLES, DEFAULT_ROLE, isRole, roleRank, permissionsFor, hasPermission, canAssignRole, canChangeRole, canManageUsers, canReadUsers } from '../../app/services/rbac.js';

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

    test('prototype-named roles/permissions fail closed (no throw)', () => {
        // PERMISSIONS[role] must not resolve to an inherited object; a
        // prototype key has to read as an unknown role → [] / false, never a
        // TypeError from calling .slice() on Object.prototype.__proto__ etc.
        for (const k of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
            expect(() => permissionsFor(k)).not.toThrow();
            expect(permissionsFor(k)).toEqual([]);
            expect(hasPermission(k, 'time:read')).toBe(false);
            expect(canAssignRole(k, 'owner')).toBe(false);
        }
        // A prototype key as the PERMISSION also grants nothing.
        expect(hasPermission('owner', '__proto__')).toBe(false);
        expect(hasPermission('owner', 'toString')).toBe(false);
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

    test('canChangeRole: needs to assign the new role AND out-rank the current role', () => {
        // Admin promotes a member to manager — allowed.
        expect(canChangeRole('admin', 'member', 'manager')).toBe(true);
        // Admin cannot promote anyone to owner (escalation on the new role).
        expect(canChangeRole('admin', 'member', 'owner')).toBe(false);
        // Admin cannot modify an OWNER at all (target out-ranks the actor).
        expect(canChangeRole('admin', 'owner', 'member')).toBe(false);
        // Owner can do both.
        expect(canChangeRole('owner', 'admin', 'viewer')).toBe(true);
        // Manager lacks manage-roles entirely.
        expect(canChangeRole('manager', 'member', 'viewer')).toBe(false);
    });

    test('time:approve is granted to manager and up, not to member/viewer', () => {
        expect(hasPermission('viewer', 'time:approve')).toBe(false);
        expect(hasPermission('member', 'time:approve')).toBe(false);
        expect(hasPermission('manager', 'time:approve')).toBe(true);
        expect(hasPermission('admin', 'time:approve')).toBe(true);
        expect(hasPermission('owner', 'time:approve')).toBe(true);
    });

    test('canManageUsers / canReadUsers map to user:write / user:read', () => {
        expect(canManageUsers('admin')).toBe(true);
        expect(canManageUsers('owner')).toBe(true);
        expect(canManageUsers('manager')).toBe(false); // manager has no user:write
        expect(canManageUsers('member')).toBe(false);
        // Every role can read users.
        for (const r of ROLES) expect(canReadUsers(r)).toBe(true);
        expect(canReadUsers('nobody')).toBe(false);
    });
});
