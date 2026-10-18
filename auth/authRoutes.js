const express = require("express");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const router = express.Router();

const { JWT_SECRET } = require("../config/jwt");
const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

// ======================================================
// LOGIN
// OWNER : EMAIL + PASSWORD
// KASIR : IDENTITAS KASIR + PIN 6 DIGIT
// ======================================================

router.post("/login", async (req, res) => {
    const { email, password, pin } = req.body;
    const outlet = req.body.idKasir ?? req.body.outlet;

    try {
        let result;
        let user;

        const outletValue =
            outlet !== undefined && outlet !== null
                ? String(outlet).trim()
                : "";

        const pinValue =
            pin !== undefined && pin !== null
                ? String(pin).trim()
                : "";

        const emailValue =
            email !== undefined && email !== null
                ? String(email).trim()
                : "";

        // ==================================================
        // LOGIN KASIR DENGAN PIN
        // ==================================================

        if (pinValue !== "") {
            if (!outletValue || !pinValue) {
                return res.status(400).json({
                    pesan: "ID Outlet dan PIN kasir harus diisi"
                });
            }

            if (!/^\d{6}$/.test(pinValue)) {
                return res.status(400).json({
                    pesan: "PIN kasir harus 6 digit"
                });
            }

            result = await pool.query(
                `SELECT *
                 FROM users
                 WHERE role = 'kasir'
                   AND aktif = true
                   AND pin = $1
                   AND (
                       LOWER(TRIM(username)) = LOWER(TRIM($2))
                       OR LOWER(TRIM(email)) = LOWER(TRIM($2))
                       OR id = CASE
                           WHEN UPPER(TRIM($2)) ~ '^KSR-[0-9]{5}$'
                           THEN SUBSTRING(TRIM($2) FROM 5)::INTEGER
                           ELSE NULL
                       END
                   )
                 LIMIT 1`,
                [pinValue, outletValue]
            );

            console.log(
                "HASIL LOGIN KASIR:",
                result.rows.length
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    pesan: "ID Outlet atau PIN kasir salah"
                });
            }

            user = result.rows[0];

            if (user.aktif === false) {
                return res.status(403).json({
                    pesan: "Akun kasir sedang dinonaktifkan. Hubungi owner."
                });
            }
        }

        // ==================================================
        // LOGIN OWNER DENGAN EMAIL + PASSWORD
        // ==================================================

        else {
            if (!emailValue || !password) {
                return res.status(400).json({
                    pesan: "Email dan password harus diisi"
                });
            }

            result = await pool.query(
                `SELECT *
                 FROM users
                 WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
                   AND password = $2
                 LIMIT 1`,
                [emailValue, password]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    pesan: "Email atau password salah"
                });
            }

            user = result.rows[0];

            if (user.role === "kasir") {
                return res.status(403).json({
                    pesan: "Kasir harus masuk menggunakan PIN 6 digit."
                });
            }

            if (user.aktif === false) {
                return res.status(403).json({
                    pesan: "Akun owner sedang dinonaktifkan."
                });
            }
        }

        // ==================================================
        // DEBUG USER
        // ==================================================

        console.log("USER LOGIN DARI DATABASE:", {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            owner_id: user.owner_id,
            aktif: user.aktif
        });

        // ==================================================
        // BUAT TOKEN DAN KUNCI SESI KASIR
        // ==================================================

        let token;

        if (user.role === "kasir") {
            const client = await pool.connect();

            try {
                await client.query("BEGIN");

                // Hapus sesi yang sudah kedaluwarsa.
                await client.query(
                    `DELETE FROM user_sessions
                     WHERE user_id = $1
                       AND expires_at <= NOW()`,
                    [user.id]
                );

                const sessionId = crypto.randomUUID();

                // Satu akun kasir hanya memiliki satu sesi aktif.
                const sessionResult = await client.query(
                    `INSERT INTO user_sessions
                        (user_id, session_id, expires_at)
                     VALUES
                        ($1, $2, NOW() + INTERVAL '12 hours')
                     ON CONFLICT (user_id) DO NOTHING
                     RETURNING user_id`,
                    [user.id, sessionId]
                );

                if (sessionResult.rows.length === 0) {
                    await client.query("ROLLBACK");

                    return res.status(409).json({
                        pesan: "Akun kasir sedang aktif di perangkat lain. Logout dari sesi sebelumnya terlebih dahulu."
                    });
                }

                await client.query("COMMIT");

                token = jwt.sign(
                    {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        owner_id: user.owner_id,
                        session_id: sessionId
                    },
                    JWT_SECRET,
                    { expiresIn: "12h" }
                );
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                client.release();
            }
        } else {
            // Login owner tetap seperti sebelumnya.
            token = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    owner_id: user.owner_id
                },
                JWT_SECRET
            );
        }

        // ==================================================
        // RESPONSE LOGIN
        // ==================================================

        return res.json({
            pesan: "Login berhasil",
            token: token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                owner_id: user.owner_id,
                aktif: user.aktif
            }
        });
    } catch (error) {
        console.error("ERROR LOGIN:", error);

        return res.status(500).json({
            pesan: "Terjadi kesalahan saat login"
        });
    }
});

// ======================================================
// LOGOUT
// ======================================================

router.post("/logout", authMiddleware, async (req, res) => {
    try {
        if (req.user.role === "kasir" && req.user.session_id) {
            await pool.query(
                `DELETE FROM user_sessions
                 WHERE user_id = $1
                   AND session_id = $2`,
                [req.user.id, req.user.session_id]
            );
        }

        return res.json({
            pesan: "Logout berhasil"
        });
    } catch (error) {
        console.error("ERROR LOGOUT:", error);

        return res.status(500).json({
            pesan: "Gagal mengakhiri sesi"
        });
    }
});

// ======================================================
// REGISTER OWNER
// ======================================================

router.post("/register", async (req, res) => {
    const {
        username,
        phone,
        password,
        email,
        storeName,
        kategori,
        pin
    } = req.body;

    if (!username || !phone || !password || !email) {
        return res.status(400).json({
            pesan: "Username, phone, password, dan email harus diisi"
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Cek email sudah digunakan.
        const existingUser = await client.query(
            `SELECT id
             FROM users
             WHERE email = $1
             LIMIT 1`,
            [email]
        );

        if (existingUser.rows.length > 0) {
            await client.query("ROLLBACK");

            return res.status(409).json({
                pesan: "Email sudah terdaftar"
            });
        }

        // Buat owner.
        const result = await client.query(
            `INSERT INTO users
                (
                    username,
                    phone,
                    password,
                    email,
                    role,
                    pin,
                    aktif
                )
             VALUES
                ($1, $2, $3, $4, 'owner', $5, true)
             RETURNING
                id,
                username,
                phone,
                email,
                role,
                pin,
                aktif`,
            [
                username,
                phone,
                password,
                email,
                pin || null
            ]
        );

        const user = result.rows[0];

        // Buat setting toko otomatis.
        await client.query(
            `INSERT INTO settings
                (
                    nama_toko,
                    kategori_usaha,
                    alamat_toko,
                    telepon_toko,
                    pesan_struk,
                    tampil_nama,
                    tampil_alamat,
                    tampil_telepon,
                    tampil_tanggal,
                    printer,
                    ukuran_kertas,
                    konfirmasi_pembayaran,
                    auto_clear_keranjang,
                    user_id
                )
             VALUES
                (
                    $1, $2, '', '',
                    'Terima Kasih 🙏',
                    true, true, true, true,
                    NULL, '58mm', true, true, $3
                )`,
            [
                storeName || "TOKO BARU",
                kategori || "",
                user.id
            ]
        );

        await client.query("COMMIT");

        return res.status(201).json({
            pesan: "User berhasil didaftarkan",
            user: user
        });
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("ERROR REGISTER:", error);

        return res.status(500).json({
            pesan: "Gagal mendaftarkan user",
            error: error.message
        });
    } finally {
        client.release();
    }
});

// ======================================================
// DELETE USER
// ======================================================

router.delete("/users/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query(
            `DELETE FROM users
             WHERE id = $1
             RETURNING id, username, phone, email`,
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
    } catch (error) {
        console.error("ERROR DELETE USER:", error);

        return res.status(500).json({
            pesan: "Gagal menghapus user"
        });
    }
});

// ======================================================
// EXPORT ROUTER
// ======================================================

module.exports = router;