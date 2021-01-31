# TimeTrackerAPI

OpenSource re-write of Atbash Services' TimeTrackerAPI on NodeJS / PostgreSQL

Working example at [https://node.timetrackerapi.com:8080](https://node.timetrackerapi.com:8080)

Database file is at db/TimeTracker.sql

Endpoints Completed
 * GET /v1/customer/#
 * GET /v1/customer/bycompany/#

#

# QuickStart

ubuntu@localhost#~$ `git clone https://github.com/CryptoJones/TimeTrackerAPI.git`

ubuntu@localhost#~$ `cd TimeTrackerAPI`

ubuntu@localhost#~/TimeTrackerAPI$ `sudo apt-get install npm postgresql postgresql-client-common -y`

ubuntu@localhost#~/TimeTrackerAPI$ `npm install --save express cors body-parser pg pg-hstore sequelize`

ubuntu@localhost#~/TimeTrackerAPI$ `sudo su - postgres`

postgres@localhost#~$ `psql`

postgres=#`CREATE USER timetracker SUPERUSER;`

postgres=#`CREATE DATABASE TimeTracker WITH OWNER timetracker;`

postgres=#`ALTER USER timetracker WITH PASSWORD 'Password1';`

postgres=#`\q`

postgres@localhost#~$ `exit`

ubuntu@localhost#~/TimeTrackerAPI$ `psql -f db/TimeTracker.sql -d timetracker`

ubuntu@localhost#~/TimeTrackerAPI$ `node server.js`
