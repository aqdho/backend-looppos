
const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

const PLANS = [
    { 
        id: "free",
        name: "Free",
        price: 0,
        duration_days: 30,
        limits: { products: 20, cashiers: 1 },
    },
    {
        id: "starter",
        name: "Starter",
        price: 99000,
        duration_days: 30,
        limits: { products: 100, cashiers: 3 },
    },
    {
        id: "pro",
        name: "Pro",
        price: 199000,
        duration_days: 30,
        limits: { products: 1000, cashiers: 10 },
    },
    {
        id: "enterprise",
        name: "Enterprise",
        price: 449000,
        duration_days: 30,
        limits: { products: null, cashiers: 30 },
    },
];

async function ensureTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id BIGSERIAL PRIMARY KEY,
            owner_id INTEGER NOT NULL UNIQUE
                REFERENCES users(id) ON DELETE CASCADE,
            plan VARCHAR(30) NOT NULL DEFAULT 'trial'
                CHECK (plan IN ('trial', 'free', 'starter', 'pro', 'enterprise')),
            status VARCHAR(20) NOT NULL DEFAULT 'trialing'
                CHECK (status IN ('trialing', 'active', 'expired', 'pending')),
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        ALTER TABLE subscriptions
        DROP CONSTRAINT IF EXISTS subscriptions_plan_check
    `);

    await pool.query(`
        ALTER TABLE subscriptions
        ADD CONSTRAINT subscriptions_plan_check
        CHECK (plan IN ('trial', 'free', 'starter', 'pro', 'enterprise'))
    `);
}

// Daftar paket langganan
router.get("/plans", (req, res) => {
    res.json({
        plans: PLANS,
        trial: { duration_days: 14, price: 0 },
    });
});

// Langganan milik owner atau kasir dari owner tersebut
router.get("/me", authMiddleware, async (req, res) => {
    try {
        await ensureTable();

        const ownerId =
            req.user.role === "owner"
                ? req.user.id
                : req.user.owner_id;

        if (!ownerId) {
            return res.status(403).json({
                pesan: "Akun tidak terhubung ke pemilik usaha",
            });
        }

                await pool.query(
            `INSERT INTO subscriptions
                (owner_id, plan, status, started_at, expires_at)
             VALUES
                ($1, 'trial', 'trialing', NOW(),
                 NOW() + INTERVAL '14 days')
             ON CONFLICT (owner_id) DO NOTHING`,
            [ownerId]
        );

        const result = await pool.query(
            `SELECT owner_id, plan, status, started_at, expires_at,
                    created_at, updated_at,
                    (expires_at > NOW()) AS is_current
             FROM subscriptions
             WHERE owner_id = $1
             LIMIT 1`,
            [ownerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Langganan belum tersedia",
                code: "SUBSCRIPTION_NOT_FOUND",
            });
        }

        const subscription = result.rows[0];

        if (!subscription.is_current && subscription.status !== "expired") {
            const updated = await pool.query(
                `UPDATE subscriptions
                 SET status = 'expired', updated_at = NOW()
                 WHERE owner_id = $1
                 RETURNING owner_id, plan, status, started_at, expires_at,
                           created_at, updated_at,
                           false AS is_current`,
                [ownerId]
            );

            if (updated.rows.length > 0) {
                return res.json({ subscription: updated.rows[0] });
            }
        }

        return res.json({ subscription });
    } catch (error) {
        console.error("ERROR SUBSCRIPTION:", error.message);
        return res.status(500).json({
            pesan: "Gagal mengambil data langganan",
        });
    }
});

module.exports = router;
