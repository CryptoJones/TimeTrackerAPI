let express = require('express');
let router = express.Router();
 
const customer = require('../controllers/customercontroller.js');

router.get('/api/customers/onebyid/:id', customer.getCustomerById);
module.exports = router;