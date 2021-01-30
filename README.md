TimeTrackerAPI

OpenSource re-write of Atbash Services' TimeTrackerAPI on NodeJS / PostgreSQL

Working example at [https://node.timetrackerapi.com:8080](https://node.timetrackerapi.com:8080)

Database file is at db/TimeTracker.sql

Endpoints Completed
 * GET /v1/customer/#
 * GET /v1/customer/bycompany/#


**QuickStart**

pg_restore db/TimeTracker.sql
node server.js
