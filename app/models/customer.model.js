'use strict';
module.exports = (sequelize, Sequelize) => {
    const Customer = sequelize.define('Customer', {
        custId: {
            field: 'custId',
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        custCompanyName: {
            field: 'custCompanyName',
            type: Sequelize.STRING
            
        },
        custFName: {
            field: 'custFName',
            type: Sequelize.STRING
            
        },
        custLName: {
            field: 'custLName',
            type: Sequelize.STRING
            
        },
        custAddress1: {
            field: 'custAddress1',
            type: Sequelize.STRING
            
        },
        custAddress2: {
            field: 'custAddress2',
            type: Sequelize.STRING
            
        },
        custCity: {
            field: 'custCity',
            type: Sequelize.STRING
            
        },
        custState: {
            field: 'custState',
            type: Sequelize.STRING
            
        },
        custZip: {
            field: 'custZip',
            type: Sequelize.STRING
        },
        custArch: {
            field: 'custArch',
            type: Sequelize.BOOLEAN,
        },
        custPhone: {
            field: 'custPhone',
            type: Sequelize.STRING
            
        },
        custEmail: {
            field: 'custEmail',
            type: Sequelize.STRING
        },
        custCompId: {
            field: 'custCompId',
            type: Sequelize.INTEGER
        }
    },
        {
            tableName: 'Customer',
            timestamps: false
        }
    );



    return Customer;
}