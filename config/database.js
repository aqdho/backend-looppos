require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : false,

    connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
    console.error("[DATABASE] Unexpected PostgreSQL error:", err.message);
});

module.exports = pool;