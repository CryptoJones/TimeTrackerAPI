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

module.exports = db;
