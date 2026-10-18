const pool = require("../config/database");

// Mengambil identitas pengguna terbaru dari database.
async function getUserContext(userId) {
    const result = await pool.query(
        `SELECT id, role, owner_id, aktif
         FROM users
         WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        return { error: "Pengguna tidak ditemukan.", status: 401 };
    }

    const user = result.rows[0];

    if (user.aktif === false) {
        return { error: "Akun pengguna tidak aktif.", status: 403 };
    }

    const ownerId = user.role === "owner" ? user.id : user.owner_id;

    if (!ownerId) {
        return { error: "Pengguna belum memiliki owner.", status: 403 };
    }

    return {
        userId: user.id,
        role: user.role,
        ownerId,
    };
}

// Melihat shift aktif pengguna.
async function getActiveShift(req, res) {
    try {
        const context = await getUserContext(req.user.id);

        if (context.error) {
            return res.status(context.status).json({
                pesan: context.error,
            });
        }

        const result = await pool.query(
            `SELECT *
             FROM shifts
             WHERE owner_id = $1
               AND cashier_id = $2
               AND status = 'open'
             ORDER BY opened_at DESC
             LIMIT 1`,
            [context.ownerId, context.userId]
        );

        const activeShift = result.rows[0] || null;

        const previousResult = await pool.query(
            `SELECT s.*,
                    COALESCE(
                        to_jsonb(u)->>'nama',
                        to_jsonb(u)->>'name',
                        to_jsonb(u)->>'username',
                        to_jsonb(u)->>'email',
                        'Kasir #' || s.cashier_id::text
                    ) AS cashier_name
             FROM shifts s
             JOIN users u ON u.id = s.cashier_id
             WHERE s.owner_id = $1
               AND ($2::integer IS NULL OR s.id <> $2)
             ORDER BY s.opened_at DESC
             LIMIT 1`,
            [context.ownerId, activeShift?.id ?? null]
        );

        return res.json({
            data: activeShift,
            last_shift: previousResult.rows[0] || null,
        });
    } catch (error) {
        console.error("ERROR GET ACTIVE SHIFT:", error);
        return res.status(500).json({
            pesan: "Gagal mengambil shift aktif.",
        });
    }
}

// Membuka shift baru dengan waktu server dan mencegah shift ganda.
async function openShift(req, res) {
    let client;

    try {
        const context = await getUserContext(req.user.id);

        if (context.error) {
            return res.status(context.status).json({
                pesan: context.error,
            });
        }

        const openingCash = Number(req.body.opening_cash ?? 0);
        const terminalId = String(
            req.body.terminal_id || "default"
        ).trim();

        if (!Number.isFinite(openingCash) || openingCash < 0) {
            return res.status(400).json({
                pesan: "Modal awal harus berupa angka nol atau lebih.",
            });
        }

        if (!terminalId || terminalId.length > 100) {
            return res.status(400).json({
                pesan: "Terminal tidak valid.",
            });
        }

        client = await pool.connect();
        await client.query("BEGIN");

        // Mengunci akun agar permintaan buka shift bersamaan
        // untuk kasir yang sama diproses secara berurutan.
        await client.query(
            `SELECT id
             FROM users
             WHERE id = $1
             FOR UPDATE`,
            [context.userId]
        );

        // Satu kasir hanya boleh memiliki satu shift aktif,
        // termasuk jika terminal_id berbeda.
        const activeResult = await client.query(
            `SELECT id
             FROM shifts
             WHERE owner_id = $1
               AND cashier_id = $2
               AND status = 'open'
             LIMIT 1`,
            [context.ownerId, context.userId]
        );

        if (activeResult.rows.length > 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                pesan: "Kasir masih memiliki shift aktif. Tutup shift sebelumnya terlebih dahulu.",
                shift_id: activeResult.rows[0].id,
            });
        }

        // Ambil shift terakhir sebelum membuat shift baru, termasuk yang masih terbuka.
        const previousResult = await client.query(
            `SELECT s.*,
                    COALESCE(
                        to_jsonb(u)->>'nama',
                        to_jsonb(u)->>'name',
                        to_jsonb(u)->>'username',
                        to_jsonb(u)->>'email',
                        'Kasir #' || s.cashier_id::text
                    ) AS cashier_name
             FROM shifts s
             JOIN users u ON u.id = s.cashier_id
             WHERE s.owner_id = $1
             ORDER BY s.opened_at DESC
             LIMIT 1`,
            [context.ownerId]
        );

        const result = await client.query(
            `INSERT INTO shifts (
                owner_id,
                cashier_id,
                terminal_id,
                opened_at,
                opening_cash,
                status,
                notes
             )
             VALUES (
                $1, $2, $3, NOW(), $4, 'open', $5
             )
             RETURNING *`,
            [
                context.ownerId,
                context.userId,
                terminalId,
                openingCash,
                req.body.notes || null,
            ]
        );

        await client.query("COMMIT");

        return res.status(201).json({
            pesan: "Shift berhasil dibuka.",
            data: result.rows[0],
            previous_shift: previousResult.rows[0] || null,
        });
    } catch (error) {
        if (client) {
            await client.query("ROLLBACK").catch(() => {});
        }

        console.error("ERROR OPEN SHIFT:", error);

        return res.status(500).json({
            pesan: "Gagal membuka shift.",
        });
    } finally {
        if (client) {
            client.release();
        }
    }
}

// Menutup shift.
async function closeShift(req, res) {
    try {
        const context = await getUserContext(req.user.id);

        if (context.error) {
            return res.status(context.status).json({
                pesan: context.error,
            });
        }

        const closingCash = Number(req.body.closing_cash);

        if (!Number.isFinite(closingCash) || closingCash < 0) {
            return res.status(400).json({
                pesan: "Kas akhir harus berupa angka nol atau lebih.",
            });
        }

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            const shiftResult = await client.query(
                `SELECT *
                 FROM shifts
                 WHERE id = $1
                   AND owner_id = $2
                   AND cashier_id = $3
                   AND status = 'open'
                 FOR UPDATE`,
                [req.params.id, context.ownerId, context.userId]
            );

            if (shiftResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({
                    pesan: "Shift aktif tidak ditemukan.",
                });
            }

            const shift = shiftResult.rows[0];

            // Shift tidak boleh ditutup selama ada QRIS yang belum dibayar
            const pendingQrisResult = await client.query(
                `SELECT id
                FROM transaksi
                WHERE shift_id = $1
                AND payment_method = 'qris'
                AND payment_status = 'pending'
                FOR UPDATE`,
                [shift.id]
            );

            if (pendingQrisResult.rows.length > 0) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    pesan: "Shift belum dapat ditutup karena masih ada pembayaran QRIS yang menunggu. Selesaikan atau batalkan pembayaran terlebih dahulu.",
                    jumlah_pending: pendingQrisResult.rows.length
                });
            }

            const cashResult = await client.query(
                `SELECT COALESCE(SUM(
                    CASE
                        WHEN payment_method = 'cash'
                        THEN total
                        ELSE 0
                    END
                ), 0) AS cash_sales
                 FROM transaksi
                 WHERE shift_id = $1
                   AND payment_status = 'paid'`,
                [shift.id]
            );

            const cashSales = Number(cashResult.rows[0].cash_sales) || 0;
            const expectedCash = Number(shift.opening_cash) + cashSales;
            const cashDifference = closingCash - expectedCash;

            const updateResult = await client.query(
                `UPDATE shifts
                 SET status = 'closed',
                     closed_at = NOW(),
                     closing_cash = $1,
                     expected_cash = $2,
                     cash_difference = $3,
                     notes = CASE
                         WHEN $4::text IS NOT NULL THEN $4
                         ELSE notes
                     END
                 WHERE id = $5
                 RETURNING *`,
                [
                    closingCash,
                    expectedCash,
                    cashDifference,
                    req.body.notes || null,
                    shift.id,
                ]
            );

            await client.query("COMMIT");

            return res.json({
                pesan: "Shift berhasil ditutup.",
                data: updateResult.rows[0],
            });
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("ERROR CLOSE SHIFT:", error);
        return res.status(500).json({
            pesan: "Gagal menutup shift.",
        });
    }
}

// Owner melihat semua riwayat shift di tokonya.
// Kasir hanya melihat riwayat shiftnya sendiri.
async function getShiftHistory(req, res) {
    try {
        const context = await getUserContext(req.user.id);

        if (context.error) {
            return res.status(context.status).json({
                pesan: context.error,
            });
        }

        let result;

        if (context.role === "owner") {
            result = await pool.query(
                `SELECT *
                 FROM shifts
                 WHERE owner_id = $1
                 ORDER BY opened_at DESC
                 LIMIT 100`,
                [context.ownerId]
            );
        } else {
            result = await pool.query(
                `SELECT *
                 FROM shifts
                 WHERE owner_id = $1
                   AND cashier_id = $2
                 ORDER BY opened_at DESC
                 LIMIT 100`,
                [context.ownerId, context.userId]
            );
        }

        return res.json({
            data: result.rows,
        });
    } catch (error) {
        console.error("ERROR SHIFT HISTORY:", error);

        return res.status(500).json({
            pesan: "Gagal mengambil riwayat shift.",
        });
    }
}

module.exports = {
    openShift,
    getActiveShift,
    closeShift,
    getShiftHistory,
};