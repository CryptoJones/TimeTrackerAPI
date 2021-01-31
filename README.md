TimeTrackerAPI

OpenSource re-write of Atbash Services' TimeTrackerAPI on NodeJS / PostgreSQL

Working example at [https://node.timetrackerapi.com:8080](https://node.timetrackerapi.com:8080)

Database file is at db/TimeTracker.sql

Endpoints Completed
 * GET /v1/customer/#
 * GET /v1/customer/bycompany/#

##

**QuickStart**

#`git clone https://github.com/CryptoJones/TimeTrackerAPI.git`

#`cd TimeTrackerAPI`

#`sudo apt-get install postgresql postgresql-client-common -y`

#`npm install --save express cors body-parser pg pg-hstore sequelize`

#`sudo su - postgres`

#`psql`

postgres=#`CREATE USER timetracker SUPERUSER;`

postgres=#`CREATE DATABASE TimeTracker WITH OWNER timetracker;`

postgres=#`ALTER USER timetracker WITH PASSWORD 'Password1';`

postgres=#`\q`

#`psql -f db/TimeTracker.sql -d timetracker`

#

#`node server.js`
