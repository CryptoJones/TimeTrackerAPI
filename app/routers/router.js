let express = require('express');
let router = express.Router();
 
const customer = require('../controllers/customercontroller.js');

router.get('/v1/customer/:id', customer.getCustomerById);
router.get('/v1/customer/bycompany/:id', customer.getAllByCompanyId);
module.exports = router;