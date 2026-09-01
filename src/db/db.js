const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config();

// TODO: Ensure the following env vars are set in .env:
//   DB_HOST     — e.g. "localhost" or your RDS endpoint
//   DB_USER     — database username
//   DB_PASSWORD — database password
//   DB_NAME     — name of the database/schema
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
});

// Export as promise-based pool so all queries can use async/await
module.exports = pool.promise();
