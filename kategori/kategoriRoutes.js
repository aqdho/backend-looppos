const express = require("express");
const router = express.Router();

const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");
const ownerMiddleware = require("../middleware/roleMiddleware");

router.get(
    "/",
    authMiddleware,
    ownerMiddleware,
    async (req, res) => {
        const result = await pool.query(
            "SELECT * FROM kategori WHERE user_id = $1 ORDER BY id",
            [req.user.id]
        );

        res.json({
            pesan: "Data kategori berhasil ditemukan",
            data: result.rows
        });
    }
);

router.post(
    "/",
    authMiddleware,
    ownerMiddleware,
    async (req, res) => {
        const { nama } = req.body;

        if (!nama) {
            return res.status(400).json({
                pesan: "Nama kategori harus diisi"
            });
        }

        const result = await pool.query(
            "INSERT INTO kategori (nama, user_id) VALUES ($1, $2) RETURNING *",
            [nama, req.user.id]
        );

        res.status(201).json({
            pesan: "kategori berhasil ditambahkan",
            data: result.rows[0]
        });
    }
);

router.put(
    "/:id",
    authMiddleware,
    ownerMiddleware,
    async (req, res) => {
        const { id } = req.params;
        const { nama } = req.body;

        if (!nama) {
            return res.status(400).json({
                pesan: "Nama kategori harus diisi"
            });
        }

        const result = await pool.query(
            "UPDATE kategori SET nama = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
            [nama, id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Kategori tidak ditemukan"
            });
        }

        res.json({
            pesan: "Kategori berhasil diubah",
            data: result.rows[0]
        });
    }
);

router.delete(
    "/:id",
    authMiddleware,
    ownerMiddleware,
    async (req, res) => {
        const { id } = req.params;

        const result = await pool.query(
            "DELETE FROM kategori WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Kategori tidak ditemukan"
            });
        }

        res.json({
            pesan: "Kategori berhasil dihapus",
            data: result.rows[0]
        });
    }
);

module.exports = router;