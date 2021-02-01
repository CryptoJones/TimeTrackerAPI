const express = require('express');
const asyncify = require('express-asyncify');
var app = asyncify(express());

var bodyParser = require('body-parser');

const db = require('./app/config/db.config.js');

let router = require('./app/routers/router.js');

const cors = require('cors')
const corsOptions = {
    origin: 'http://localhost:4200',
    optionsSuccessStatus: 200
}
app.use(cors(corsOptions));

app.use(bodyParser.json());
app.use('/', router);

// Create a Server
const server = app.listen(80, function () {

    let host = server.address().address

    let port = server.address().port

    console.log("Server is listening at http://%s:%s", host, port);
})
