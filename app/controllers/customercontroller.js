const db = require('../config/db.config.js');
const Customer = db.Customer;

exports.getCustomerById = (req, res) => {
    // find all Customer information from 
    let customerId = req.params.id;
    Customer.findByPk(customerId)
        .then(customer => {
            res.status(200).json({
                message: " Successfully Get a Customer with id = " + customerId,
                customers: customer
            });
        })
        . catch(error => {
          // log on console
          console.log(error);
  
          res.status(500).json({
              message: "Error!",
              error: error
          });
        });
    }

    exports.getAllByCompanyId = (req, res) => {
        // find all Customer information from company id
        let custCompId = req.params.id;
        Customer.findByPk(custCompId)
            .then(customer => {
                res.status(200).json({
                    message: " Successfully Got Customers with company id = " + custCompId,
                    customers: customer
                });
            })
            . catch(error => {
              // log on console
              console.log(error);
      
              res.status(500).json({
                  message: "Error!",
                  error: error
              });
            });
        }