require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : false,

    connectionTimeoutMillis: 10000,
});

if (process.env.DATABASE_URL) {
    try {
        const dbUrl = new URL(process.env.DATABASE_URL);
        console.log("[DATABASE TARGET]", {
            host: dbUrl.hostname,
            port: dbUrl.port,
            user: decodeURIComponent(dbUrl.username),
            database: dbUrl.pathname.slice(1),
        });
    } catch {
        console.error("[DATABASE TARGET] URL tidak valid");
    }
}

pool.on("error", (err) => {
    console.error("[DATABASE] Unexpected PostgreSQL error:", err.message);
});

module.exports = pool;