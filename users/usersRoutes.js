const express = require("express");
const pool = require("../config/database");

const router = express.Router();

router.delete("/users/:id", async (req, res) => {
    const { id } = req.params;

    const result = await pool.query(
        "DELETE FROM users WHERE id = $1 RETURNING id, username, phone, email",
        [id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({
            pesan: "User tidak ditemukan"
        });
    }

    return res.json({
        pesan: "User berhasil dihapus",
        user: result.rows[0]
    });
});

router.put("/users/:id", async (req,res) => {
    const { id } = req.params;
    const { username, phone, password, email } = req.body;

    if (!username || !phone || !password || !email) {
        return res.status(400).json({
            pesan: "Username, phone, password, dan email harus diisi"
        });
    }

    const result = await pool.query(
        `UPDATE users SET username = $1, phone = $2, password = $3, email =$4 WHERE id = $5 RETURNING id, username, phone, password, email`,
        [username, phone, password, email, id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({
            pesan: "User tidak ditemukan"
        });
    }

    return res.json({
        pesan: "User berhasil diupdate",
        user: result.rows[0]
    });
});

module.exports = router;