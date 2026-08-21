const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const { JWT_SECRET } = require("../config/jwt"); 
const pool = require("../config/database");

router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            pesan: "Username dan password harus diisi"
        });
    }

    //TODO: Ganti dengan validasi dari database, cari user berdasarkan username dan password pada dataabase
    const result = await pool.query(
        "SELECT * FROM users WHERE email = $1 and password = $2;",
        [email, password]
    );

    if (result.rows.length > 0) {

        const user = result.rows[0];

        const token = jwt.sign(
            {
                id: 1,
                username: user.username,
                email: user.email,
                role: user.role
            }, JWT_SECRET
        );
        return res.json({
            pesan: "Login berhasil",
            token: token
        });
    }

    return res.status(401).json({
        pesan: "Username atau password salah"
    });
});


router.post("/register", async (req, res) => {
    const { username, phone, password, email } = req.body;

if (!username || !phone || !password || !email) {
    return res.status(400).json({
        pesan: "Username, phone, password, dan email harus diisi"
    });
}

const result = await pool.query(
    "INSERT INTO users (username, phone, password, email) VALUES ($1, $2, $3, $4) RETURNING id, username, phone, email",
    [username, phone, password, email]
);

    return res.status(201).json({
        pesan: "User berhasil didaftarkan",
        user: result.rows[0]
    });
});

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



module.exports = router;
