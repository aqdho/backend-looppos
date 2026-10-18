// routes/notifikasiRoutes.js

const express = require("express");
const router = express.Router();

const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

const BATAS_STOK_RENDAH = 5;
const BATAS_RIWAYAT = 50;

router.use(authMiddleware);

async function getUserContext(userId) {
    const result = await pool.query(
        `SELECT id, role, owner_id
         FROM users
         WHERE id = $1 AND aktif = true`,
        [userId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const user = result.rows[0];
    const ownerId = user.role === "owner" ? user.id : user.owner_id;

    if (!ownerId) {
        return null;
    }

    return { user, ownerId };
}

// Membuat notifikasi hanya jika belum pernah dihapus.
// Membuat notifikasi hanya jika belum pernah dihapus.
async function simpanNotifikasi(data) {
    await pool.query(
        `INSERT INTO notifikasi (
            owner_id,
            recipient_user_id,
            tipe,
            judul,
            pesan,
            status,
            href,
            event_key,
            metadata
        )
        SELECT
            $1, $2, $3, $4, $5, 'unread', $6, $7::varchar(200), $8
        WHERE NOT EXISTS (
            SELECT 1
            FROM notifikasi_dihapus nd
            WHERE nd.owner_id = $1
              AND nd.event_key = $7::varchar(200)
        )
        ON CONFLICT (owner_id, event_key)
        WHERE event_key IS NOT NULL
        DO UPDATE SET
            judul = EXCLUDED.judul,
            pesan = EXCLUDED.pesan,
            href = EXCLUDED.href,
            metadata = EXCLUDED.metadata`,
        [
            data.ownerId,
            data.recipientUserId || null,
            data.tipe,
            data.judul,
            data.pesan,
            data.href || null,
            data.eventKey,
            JSON.stringify(data.metadata || {})
        ]
    );
}

// GET /api/notifikasi
router.get("/", async (req, res) => {
    try {
        const context = await getUserContext(req.user.id);

        if (!context) {
            return res.status(403).json({
                pesan: "Pengguna tidak ditemukan atau belum memiliki owner."
            });
        }

        const { user, ownerId } = context;

        const settingsResult = await pool.query(
            `SELECT notifikasi_transaksi, notifikasi_stok
             FROM settings
             WHERE user_id = $1`,
            [ownerId]
        );

        const settings = settingsResult.rows[0] || {};

        // Notifikasi transaksi menggunakan nama produk.
        if (settings.notifikasi_transaksi === true) {
            const transaksiResult = await pool.query(
                `SELECT
                    t.id,
                    t.total,
                    t.payment_status,
                    t.payment_method,
                    COALESCE(
                        string_agg(
                            DISTINCT p.nama,
                            ', ' ORDER BY p.nama
                        ),
                        'Transaksi #' || t.id::text
                    ) AS nama_produk
                 FROM transaksi t
                 LEFT JOIN transaksi_detail td
                    ON td.transaksi_id = t.id
                 LEFT JOIN products p
                    ON p.id = td.produk_id
                 WHERE t.user_id = $1
                 GROUP BY t.id
                 ORDER BY t.tanggal DESC, t.id DESC
                 LIMIT 10`,
                [ownerId]
            );

            await Promise.all(
                transaksiResult.rows.map((item) =>
                    simpanNotifikasi({
                        ownerId,
                        tipe: "transaksi",
                        judul: item.nama_produk,
                        pesan:
                            `Total Rp ${Number(item.total || 0).toLocaleString("id-ID")} · ` +
                            `${item.payment_method || "Pembayaran"}`,
                        href: "/laporan",
                        eventKey: `transaksi:${item.id}`,
                        metadata: {
                            transaksiId: item.id,
                            paymentStatus: item.payment_status || "paid",
                            paymentMethod: item.payment_method || "cash"
                        }
                    })
                )
            );
        }

        // Notifikasi stok menipis atau habis.
        if (settings.notifikasi_stok === true) {
            const produkResult = await pool.query(
                `SELECT id, nama, qty
                 FROM products
                 WHERE user_id = $1
                   AND aktif = true
                   AND qty <= $2
                 ORDER BY qty ASC, nama ASC
                 LIMIT 10`,
                [ownerId, BATAS_STOK_RENDAH]
            );

            await Promise.all(
                produkResult.rows.map((item) => {
                    const qty = Number(item.qty);

                    const tingkat =
                        qty <= 0
                            ? "habis"
                            : qty <= 2
                                ? "kritis"
                                : "menipis";

                    return simpanNotifikasi({
                        ownerId,
                        tipe: "stok",
                        judul:
                            tingkat === "habis"
                                ? "Produk habis — restok segera"
                                : tingkat === "kritis"
                                    ? "Stok kritis — restok segera"
                                    : "Stok produk menipis",
                        pesan: `${item.nama} tersisa ${qty} unit`,
                        href: "/produk",
                        eventKey: `stok:${item.id}:${tingkat}`,
                        metadata: {
                            produkId: item.id,
                            qty,
                            tingkat
                        }
                    });
                })
            );
        }

        // Kasir hanya melihat notifikasi umum atau miliknya.
        const values = [ownerId];
        let filterPenerima = "";

        if (user.role !== "owner") {
            values.push(user.id);
            filterPenerima =
                "AND (recipient_user_id IS NULL OR recipient_user_id = $2)";
        }

        const [dataResult, countResult] = await Promise.all([
            pool.query(
                `SELECT
                    id,
                    tipe,
                    judul,
                    pesan,
                    status,
                    href,
                    metadata,
                    created_at,
                    read_at
                 FROM notifikasi
                 WHERE owner_id = $1
                 ${filterPenerima}
                 ORDER BY created_at DESC, id DESC
                 LIMIT ${BATAS_RIWAYAT}`,
                values
            ),

            pool.query(
                `SELECT COUNT(*)::integer AS jumlah
                 FROM notifikasi
                 WHERE owner_id = $1
                   AND status = 'unread'
                 ${filterPenerima}`,
                values
            )
        ]);

        return res.json({
            data: dataResult.rows.map((item) => ({
                id: item.id,
                tipe: item.tipe,
                judul: item.judul,
                pesan: item.pesan,
                status: item.status,
                sudahDibaca: item.status === "read",
                href: item.href,
                metadata: item.metadata,
                waktu: item.created_at,
                readAt: item.read_at
            })),
            unreadCount: countResult.rows[0].jumlah
        });
    } catch (error) {
        console.error("ERROR NOTIFIKASI:", error);

        return res.status(500).json({
            pesan: "Gagal mengambil notifikasi"
        });
    }
});

// POST /api/notifikasi/:id/read
router.post("/:id/read", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            pesan: "ID notifikasi tidak valid."
        });
    }

    try {
        const context = await getUserContext(req.user.id);

        if (!context) {
            return res.status(403).json({
                pesan: "Pengguna tidak memiliki akses."
            });
        }

        const { user, ownerId } = context;
        const values = [id, ownerId];
        let filterPenerima = "";

        if (user.role !== "owner") {
            values.push(user.id);
            filterPenerima =
                "AND (recipient_user_id IS NULL OR recipient_user_id = $3)";
        }

        const result = await pool.query(
            `UPDATE notifikasi
             SET status = 'read',
                 read_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND owner_id = $2
               ${filterPenerima}
             RETURNING id`,
            values
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                pesan: "Notifikasi tidak ditemukan."
            });
        }

        return res.json({
            pesan: "Notifikasi ditandai sudah dibaca."
        });
    } catch (error) {
        console.error("ERROR BACA NOTIFIKASI:", error);

        return res.status(500).json({
            pesan: "Gagal memperbarui notifikasi."
        });
    }
});

// POST /api/notifikasi/read-all
router.post("/read-all", async (req, res) => {
    try {
        const context = await getUserContext(req.user.id);

        if (!context) {
            return res.status(403).json({
                pesan: "Pengguna tidak memiliki akses."
            });
        }

        const { user, ownerId } = context;
        const values = [ownerId];
        let filterPenerima = "";

        if (user.role !== "owner") {
            values.push(user.id);
            filterPenerima =
                "AND (recipient_user_id IS NULL OR recipient_user_id = $2)";
        }

        const result = await pool.query(
            `UPDATE notifikasi
             SET status = 'read',
                 read_at = CURRENT_TIMESTAMP
             WHERE owner_id = $1
               AND status = 'unread'
               ${filterPenerima}`,
            values
        );

        return res.json({
            pesan: "Semua notifikasi ditandai sudah dibaca.",
            jumlah: result.rowCount
        });
    } catch (error) {
        console.error("ERROR BACA SEMUA NOTIFIKASI:", error);

        return res.status(500).json({
            pesan: "Gagal memperbarui notifikasi."
        });
    }
});

// DELETE /api/notifikasi/:id
router.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            pesan: "ID notifikasi tidak valid."
        });
    }

    const client = await pool.connect();

    try {
        const context = await getUserContext(req.user.id);

        if (!context) {
            return res.status(403).json({
                pesan: "Pengguna tidak memiliki akses."
            });
        }

        const { user, ownerId } = context;
        const values = [id, ownerId];
        let filterPenerima = "";

        if (user.role !== "owner") {
            values.push(user.id);
            filterPenerima =
                "AND (recipient_user_id IS NULL OR recipient_user_id = $3)";
        }

        await client.query("BEGIN");

        const existing = await client.query(
            `SELECT event_key
             FROM notifikasi
             WHERE id = $1
               AND owner_id = $2
               ${filterPenerima}
             FOR UPDATE`,
            values
        );

        if (existing.rowCount === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                pesan: "Notifikasi tidak ditemukan."
            });
        }

        const eventKey = existing.rows[0].event_key;

        if (eventKey) {
            await client.query(
                `INSERT INTO notifikasi_dihapus (owner_id, event_key)
                 VALUES ($1, $2)
                 ON CONFLICT (owner_id, event_key) DO NOTHING`,
                [ownerId, eventKey]
            );
        }

        await client.query(
            `DELETE FROM notifikasi
             WHERE id = $1
               AND owner_id = $2
               ${filterPenerima}`,
            values
        );

        await client.query("COMMIT");

        return res.json({
            pesan: "Notifikasi berhasil dihapus."
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("ERROR HAPUS NOTIFIKASI:", error);

        return res.status(500).json({
            pesan: "Gagal menghapus notifikasi."
        });
    } finally {
        client.release();
    }
});

// DELETE /api/notifikasi
router.delete("/", async (req, res) => {
    const client = await pool.connect();

    try {
        const context = await getUserContext(req.user.id);

        if (!context) {
            return res.status(403).json({
                pesan: "Pengguna tidak memiliki akses."
            });
        }

        const { user, ownerId } = context;
        const values = [ownerId];
        let filterPenerima = "";

        if (user.role !== "owner") {
            values.push(user.id);
            filterPenerima =
                "AND (recipient_user_id IS NULL OR recipient_user_id = $2)";
        }

        await client.query("BEGIN");

        await client.query(
            `INSERT INTO notifikasi_dihapus (owner_id, event_key)
             SELECT owner_id, event_key
             FROM notifikasi
             WHERE owner_id = $1
               ${filterPenerima}
               AND event_key IS NOT NULL
             ON CONFLICT (owner_id, event_key) DO NOTHING`,
            values
        );

        const result = await client.query(
            `DELETE FROM notifikasi
             WHERE owner_id = $1
             ${filterPenerima}`,
            values
        );

        await client.query("COMMIT");

        return res.json({
            pesan: "Notifikasi berhasil dihapus.",
            jumlah: result.rowCount
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("ERROR HAPUS SEMUA NOTIFIKASI:", error);

        return res.status(500).json({
            pesan: "Gagal menghapus semua notifikasi."
        });
    } finally {
        client.release();
    }
});

module.exports = router;