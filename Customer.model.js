module.exports = (sequelize, Sequelize) => {
    const Customer = sequelize.define('Customer', {
        custid: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        custCompanyName: {
            type: Sequelize.STRING
        },
        custFName: {
            type: Sequelize.STRING
        },
        custLName: {
            type: Sequelize.STRING
        },
        custAddress1: {
            type: Sequelize.STRING
        },
        custAddress2: {
            type: Sequelize.STRING
        },
        custCity: {
            type: Sequelize.STRING
        }
    }
    );

    return Customer;
}