const router = require('express-promise-router')();
const asyncify = require('express-asyncify')
let router = asyncify(express.Router());
 
const customer = require('../controllers/customercontroller.js');

router.get('/v1/customer/:id', await customer.getCustomerById);
router.get('/v1/customer/bycompany/:id', customer.getAllByCompanyId);
module.exports = router;