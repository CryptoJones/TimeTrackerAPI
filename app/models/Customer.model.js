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
        },
        custState: {
            type: Sequelize.STRING
        },
        custArch: {
            type: Sequelize.BOOLEAN
        },
        custPhone: {
            type: Sequelize.STRING
        },
        custEmail: {
            type: Sequelize.STRING
        },
        custCompId: {
            type: Sequelize.INTEGER
        }
    }
    );

    return Customer;
}