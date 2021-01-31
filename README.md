# TimeTrackerAPI

OpenSource re-write of Atbash Services' TimeTrackerAPI on NodeJS / PostgreSQL

Working example at [http://node.timetrackerapi.com](http://node.timetrackerapi.com)

Database file is at db/TimeTracker.sql

Endpoints Completed
 * GET /v1/customer/#
 * GET /v1/customer/bycompany/#

#

# QuickStart

ubuntu@localhost:~$ `git clone https://github.com/CryptoJones/TimeTrackerAPI.git`

ubuntu@localhost:~$ `sudo apt-get update`

ubuntu@localhost:~$ `sudo apt-get install npm postgresql postgresql-client-common -y`

ubuntu@localhost:~$ `npm install --save express cors body-parser pg pg-hstore sequelize`

ubuntu@localhost:~$ `sudo su - postgres`

postgres@localhost:~$ `psql`

postgres=# `CREATE USER timetracker SUPERUSER;`

postgres=# `CREATE DATABASE TimeTracker WITH OWNER timetracker;`

postgres=# `ALTER USER timetracker WITH PASSWORD 'Password1';`

postgres=# `\q`

postgres@localhost:~$ `psql -f /home/ubuntu/TimeTrackerAPI/db/TimeTracker.sql -d timetracker`

postgres@localhost:~$ `exit`

ubuntu@localhost:~$ `cd TimeTrackerAPI`

ubuntu@localhost:~/TimeTrackerAPI$ `sudo node server.js`
