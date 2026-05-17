// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aaron K. Clark

const env = require('./env.js');
const Sequelize = require('sequelize');

const sequelize = new Sequelize(env.database, env.username, env.password, {
    host: env.host,
    port: env.port,
    dialect: 'postgres',
    define: {
        schema: 'dbo',
        timestamps: false,
    },
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.Customer = require('../models/customer.model.js')(sequelize, Sequelize);
db.ApiMaster = require('../models/apimaster.model.js')(sequelize, Sequelize);
db.ApiKey = require('../models/apikey.model.js')(sequelize, Sequelize);
db.TimeEntry = require('../models/timeentry.model.js')(sequelize, Sequelize);
db.Worker = require('../models/worker.model.js')(sequelize, Sequelize);
db.BillingType = require('../models/billingtype.model.js')(sequelize, Sequelize);
db.InventoryItem = require('../models/inventoryitem.model.js')(sequelize, Sequelize);
db.Company = require('../models/company.model.js')(sequelize, Sequelize);
db.Job = require('../models/job.model.js')(sequelize, Sequelize);
db.Invoice = require('../models/invoice.model.js')(sequelize, Sequelize);
db.CustomerPayment = require('../models/customerpayment.model.js')(sequelize, Sequelize);
db.InvoiceJob = require('../models/invoicejob.model.js')(sequelize, Sequelize);
db.ProductEntry = require('../models/productentry.model.js')(sequelize, Sequelize);
db.VersionInfo = require('../models/versioninfo.model.js')(sequelize, Sequelize);

module.exports = db;
