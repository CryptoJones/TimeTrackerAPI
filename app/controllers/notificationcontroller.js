// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { sendMail, currentTransport } = require('../services/mailer.js');
const notifier = require('../services/notifier.js');

// #374: reuse attachAuth's resolved context (req.isMaster / req.companyId)
// instead of a second DB lookup; falls back to a live lookup if absent.
const MasterFromReq = auth.masterFromReq;
const CompanyIdFromReq = auth.companyIdFromReq;

/**
 * POST /v1/notification/test — send a test email to verify the mail
 * transport end to end. MASTER-ONLY (transport config is an admin op).
 * With the default capture transport, nothing is actually sent — the
 * response reports which transport handled it.
 */
exports.test = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isMaster;
    try {
        isMaster = await MasterFromReq(req, authKey);
    } catch (error) {
        log.error({ err: error }, 'notification: IsMaster failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!isMaster) {
        return res.status(403).json({ message: "Notification management requires a master key." });
    }

    const body = req.body || {};
    try {
        await sendMail({
            to: body.to,
            subject: body.subject || 'TimeTrackerAPI test notification',
            text: body.text || 'This is a test notification from TimeTrackerAPI.',
        });
        return res.status(200).json({ message: "Test notification sent.", to: body.to, transport: currentTransport() });
    } catch (error) {
        if (error && error.code === 'EMAIL_INVALID') {
            // Defensive: the schema already validates `to`. Return a fixed
            // message — never echo the raw error (see controller-error-shape).
            return res.status(400).json({ message: "Invalid recipient." });
        }
        log.error({ err: error }, 'notification test send failed');
        return res.status(500).json({ message: "Error!" });
    }
};

/**
 * POST /v1/notification/dispatch — send a Slack/Teams notification (#454).
 * Requires a valid key (master or company). With the default capture
 * transport nothing leaves the process; the response reports the transport.
 */
exports.dispatch = async (req, res) => {
    const authKey = req.get('authKey');
    if (!authKey) {
        return res.status(403).json({ message: "Authorization key not sent." });
    }

    let isMaster;
    try {
        isMaster = await MasterFromReq(req, authKey);
    } catch (error) {
        log.error({ err: error }, 'notification dispatch: IsMaster failed');
        return res.status(500).json({ message: "Error!" });
    }
    if (!isMaster) {
        const companyId = await CompanyIdFromReq(req, authKey);
        if (companyId === -1) {
            return res.status(403).json({ message: "Invalid Authorization Key." });
        }
    }

    const body = req.body || {};
    try {
        const result = await notifier.notify({ channel: body.channel, text: body.text });
        return res.status(200).json({
            message: "Notification dispatched.",
            channel: body.channel,
            transport: notifier.currentTransport(),
            result,
        });
    } catch (error) {
        if (error && error.code === 'NOTIFY_INVALID') {
            // Defensive: the schema already validates channel/text.
            return res.status(400).json({ message: "Invalid notification." });
        }
        log.error({ err: error }, 'notification dispatch failed');
        return res.status(500).json({ message: "Error!" });
    }
};
