const express = require("express");
const router = express.Router();

const pool = require("../config/database");

router.get("/", async (req, res) => {
    const result = await pool.query(
        "SELECT * FROM kategori ORDER BY id"
    );

    res.json({
        pesan: "Data kategori berhasil ditemukan",
        data: result.rows
    });
});

router.post("/", async (req, res) => {
    const { nama } = req.body;

    if (!nama) {
        return res.status(400).json({
            pesan: "Nama kategori harus diisi"
        });
    }

    const result = await pool.query(
        "INSERT INTO kategori (nama) VALUES ($1) RETURNING *",
        [nama]
    );

    res.status(201).json({
        pesan: "kategori berhasil ditambahkan",
        data: result.rows[0]
    });
});

router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { nama } = req.body;

    if (!nama) {
        return res.status(400).json({
            pesan: "Nama kategori harus diisi"
        });
    }

    const result = await pool.query(
        "UPDATE kategori SET nama = $1 WHERE id = $2 RETURNING *",
        [nama, id]
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
});

router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
        "DELETE FROM kategori WHERE id = $1 RETURNING *",
        [id]
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
});

module.exports = router;