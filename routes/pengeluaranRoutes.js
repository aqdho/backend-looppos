const express = require("express");
const router = express.Router();

const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

//GET ALL PENGELUARAN

router.get("/", authMiddleware, async (req, res) => {
    try {
        const userResult = await pool.query(
            `SELECT id, role, owner_id
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                pesan: "User tidak ditemukan."
            });
        }

        const user = userResult.rows[0];

        const ownerId =
            user.role === "owner"
                ? user.id
                : user.owner_id;

            if (!ownerId) {
                return res.status(403).json({
                    pesan: "User belum memiliki owner."
                });
            }

            const result = await pool.query(
                `SELECT
                    id,
                    user_id,
                    tanggal,
                    kategori,
                    keterangan,
                    jumlah,
                    created_at
                FROM pengeluaran
                WHERE user_id = $1
                ORDER BY tanggal DESC, id DESC`,
                [ownerId]
            );

            res.json({
                pesan: "Data pengeluaran berhasil diambil.",
                data: result.rows
            });

    } catch (error) {
        console.error("ERROR GET PENGELUARAN:", error);

        res.status(500).json({
            pesan: "Gagal mengambil data pengeluaran.",
            error: error.message
        });
    }
});

// TAMBAH PENGELUARAN
// ===============================
router.post("/", authMiddleware, async (req, res) => {
    try {
        const userResult = await pool.query(
            `SELECT id, role, owner_id
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                pesan: "User tidak ditemukan."
            });
        }

        const user = userResult.rows[0];

        // Pengeluaran dibuat oleh owner
        if (user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat menambahkan pengeluaran."
            });
        }

        const ownerId = user.id;

        const {
            tanggal,
            kategori,
            keterangan,
            jumlah
        } = req.body;

        if (!kategori || !kategori.trim()) {
            return res.status(400).json({
                pesan: "Kategori pengeluaran wajib diisi."
            });
        }

        if (
            jumlah === undefined ||
            jumlah === null ||
            Number(jumlah) < 0
        ) {
            return res.status(400).json({
                pesan: "Jumlah pengeluaran tidak valid."
            });
        }

        const result = await pool.query(
            `INSERT INTO pengeluaran (
                user_id,
                tanggal,
                kategori,
                keterangan,
                jumlah
            )
            VALUES (
                $1,
                COALESCE($2, CURRENT_TIMESTAMP),
                $3,
                $4,
                $5
            )
            RETURNING *`,
            [
                ownerId,
                tanggal || null,
                kategori.trim(),
                keterangan || "",
                Number(jumlah)
            ]
        );

        res.status(201).json({
            pesan: "Pengeluaran berhasil ditambahkan.",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("ERROR POST PENGELUARAN:", error);

        res.status(500).json({
            pesan: "Gagal menambahkan pengeluaran.",
            error: error.message
        });
    }
});


// ===============================
// UPDATE PENGELUARAN
// ===============================
router.put("/:id", authMiddleware, async (req, res) => {
    try {
        const userResult = await pool.query(
            `SELECT id, role, owner_id
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                pesan: "User tidak ditemukan."
            });
        }

        const user = userResult.rows[0];

        if (user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat mengubah pengeluaran."
            });
        }

        const ownerId = user.id;

        const {
            tanggal,
            kategori,
            keterangan,
            jumlah
        } = req.body;

        if (!kategori || !kategori.trim()) {
            return res.status(400).json({
                pesan: "Kategori pengeluaran wajib diisi."
            });
        }

        if (
            jumlah === undefined ||
            jumlah === null ||
            Number(jumlah) < 0
        ) {
            return res.status(400).json({
                pesan: "Jumlah pengeluaran tidak valid."
            });
        }

        const result = await pool.query(
            `UPDATE pengeluaran
             SET
                tanggal = COALESCE($1, tanggal),
                kategori = $2,
                keterangan = $3,
                jumlah = $4
             WHERE id = $5
               AND user_id = $6
             RETURNING *`,
            [
                tanggal || null,
                kategori.trim(),
                keterangan || "",
                Number(jumlah),
                req.params.id,
                ownerId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Pengeluaran tidak ditemukan."
            });
        }

        res.json({
            pesan: "Pengeluaran berhasil diperbarui.",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("ERROR UPDATE PENGELUARAN:", error);

        res.status(500).json({
            pesan: "Gagal memperbarui pengeluaran.",
            error: error.message
        });
    }
});


// ===============================
// HAPUS PENGELUARAN
// ===============================
router.delete("/:id", authMiddleware, async (req, res) => {
    try {
        const userResult = await pool.query(
            `SELECT id, role, owner_id
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                pesan: "User tidak ditemukan."
            });
        }

        const user = userResult.rows[0];

        if (user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat menghapus pengeluaran."
            });
        }

        const ownerId = user.id;

        const result = await pool.query(
            `DELETE FROM pengeluaran
             WHERE id = $1
               AND user_id = $2
             RETURNING *`,
            [
                req.params.id,
                ownerId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Pengeluaran tidak ditemukan."
            });
        }

        res.json({
            pesan: "Pengeluaran berhasil dihapus.",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("ERROR DELETE PENGELUARAN:", error);

        res.status(500).json({
            pesan: "Gagal menghapus pengeluaran.",
            error: error.message
        });
    }
});


module.exports = router;