// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark
"use strict";

const log = require('../config/logger.js');
const auth = require('../middleware/auth.js');
const { sendMail, currentTransport } = require('../services/mailer.js');

const IsMaster = auth.isMaster;

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
        isMaster = await IsMaster(authKey);
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
