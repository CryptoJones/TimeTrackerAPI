TimeTrackerAPI

OpenSource re-write of Atbash Services' TimeTrackerAPI on NodeJS / PostgreSQL

Working example at [https://node.timetrackerapi.com:8080](https://node.timetrackerapi.com:8080)

Database file is at db/TimeTracker.sql

Endpoints Completed
 * GET /v1/customer/#
 * GET /v1/customer/bycompany/#


**QuickStart**

#`sudo apt-get install postgresql -y`

#`sudo su - postgres`

#`psql`

postgres=# `CREATE USER timetracker SUPERUSER;`

`pg_restore -f db/TimeTracker.sql`

`node server.js`
