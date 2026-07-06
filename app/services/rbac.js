// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

/**
 * rbac.js — the role/permission model for user accounts (#448). PURE: no
 * DB, no I/O. Roles are ordered most→least privileged; each maps to a set
 * of permission strings. The API-key auth path is unchanged; this model
 * is assigned per-user (User.userRole) and surfaced via /v1/me and
 * /v1/user/:id/permissions so a client (and, later, JWT-guarded routes)
 * can enforce it.
 */

// Ordered highest privilege (index 0) → lowest.
const ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'];
const DEFAULT_ROLE = 'member';

// Cumulative capability tiers.
const VIEWER = ['invoice:read', 'billing:read', 'time:read', 'report:read', 'user:read'];
const MEMBER = VIEWER.concat(['time:write']);
const MANAGER = MEMBER.concat(['invoice:write', 'invoice:send', 'billing:write', 'time:approve']);
const ADMIN = MANAGER.concat(['user:write', 'user:manage-roles']);
const OWNER = ADMIN.concat(['company:manage']);

const PERMISSIONS = {
    owner: OWNER,
    admin: ADMIN,
    manager: MANAGER,
    member: MEMBER,
    viewer: VIEWER,
};

/** Is `role` a known role? */
function isRole(role) {
    return ROLES.includes(role);
}

/** Privilege rank (0 = highest). -1 for unknown roles. */
function roleRank(role) {
    return ROLES.indexOf(role);
}

/** The permission strings granted to `role` (empty for unknown roles). */
function permissionsFor(role) {
    // hasOwnProperty guard: a prototype-named role ('__proto__',
    // 'constructor', 'toString', …) would otherwise resolve PERMISSIONS[role]
    // to an inherited non-array and throw a TypeError on `.slice()`. Treat
    // anything that isn't an OWN role key as unknown → [] (fail-closed),
    // matching the docstring — and keeping hasPermission / canAssignRole
    // robust for the day they are wired to user-supplied input.
    return Object.prototype.hasOwnProperty.call(PERMISSIONS, role)
        ? PERMISSIONS[role].slice()
        : [];
}

/** Does `role` grant `permission`? */
function hasPermission(role, permission) {
    return permissionsFor(role).includes(permission);
}

/**
 * May an actor with `actorRole` assign `targetRole` to someone? Requires
 * the manage-roles permission AND that the target role is not more
 * privileged than the actor's own (no privilege escalation).
 */
function canAssignRole(actorRole, targetRole) {
    if (!isRole(targetRole) || !hasPermission(actorRole, 'user:manage-roles')) return false;
    return roleRank(actorRole) <= roleRank(targetRole);
}

/**
 * May `actorRole` change a user who currently holds `currentRole` to
 * `newRole`? The actor must be able to assign the NEW role AND out-rank (or
 * equal) the target's CURRENT role — otherwise a manager could demote an
 * owner. Both legs go through canAssignRole (which requires manage-roles).
 */
function canChangeRole(actorRole, currentRole, newRole) {
    return canAssignRole(actorRole, newRole) && canAssignRole(actorRole, currentRole);
}

/** May an actor with `actorRole` create/update/remove user accounts? */
function canManageUsers(actorRole) {
    return hasPermission(actorRole, 'user:write');
}

/** May an actor with `actorRole` read user accounts? */
function canReadUsers(actorRole) {
    return hasPermission(actorRole, 'user:read');
}

module.exports = {
    ROLES,
    DEFAULT_ROLE,
    PERMISSIONS,
    isRole,
    roleRank,
    permissionsFor,
    hasPermission,
    canAssignRole,
    canChangeRole,
    canManageUsers,
    canReadUsers,
};
