const express = require("express");
const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ======================================================
// FORMAT ID KASIR OTOMATIS
// Contoh:
// id database 32 -> KSR-00032
// ======================================================

const generateKasirId = (id) => {
    return `KSR-${String(id).padStart(5, "0")}`;
};


// ======================================================
// GET USER YANG SEDANG LOGIN
// ======================================================

router.get("/me", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                id,
                username,
                phone,
                email,
                role,
                owner_id,
                permissions,
                aktif,
                created_at
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "User tidak ditemukan"
            });
        }

        const user = result.rows[0];

        // ID Kasir otomatis hanya untuk role kasir
        if (user.role === "kasir") {
            user.id_kasir = generateKasirId(user.id);
        }

        return res.json({
            pesan: "Data user berhasil diambil",
            user
        });

    } catch (error) {
        console.error("ERROR GET USER:", error);

        return res.status(500).json({
            pesan: "Gagal mengambil data user",
            error: error.message
        });
    }
});


// ======================================================
// OWNER - BUAT AKUN KASIR
// KASIR MENGGUNAKAN PIN 6 DIGIT
// TANPA PASSWORD
// ======================================================

router.post("/kasir", authMiddleware, async (req, res) => {
    try {
        const {
            username,
            phone,
            email,
            pin,
            permissions
        } = req.body;

        // Hanya owner
        if (req.user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat membuat akun kasir"
            });
        }

        // Validasi data wajib
        if (!username || !phone || !email || !pin) {
            return res.status(400).json({
                pesan: "Username, phone, email, dan PIN harus diisi"
            });
        }

        // PIN harus tepat 6 digit
        if (!/^\d{6}$/.test(String(pin))) {
            return res.status(400).json({
                pesan: "PIN kasir harus tepat 6 digit"
            });
        }

        // Hak akses default
        const hakAkses = permissions || {
            transaksi: true,
            laporan: true,
            produk: false,
            kategori: false,
            pengaturan: false
        };

        // ==================================================
        // CEK EMAIL
        // ==================================================

        const emailCheck = await pool.query(
            `SELECT id
             FROM users
             WHERE email = $1`,
            [email]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({
                pesan: "Email sudah digunakan"
            });
        }

        // ==================================================
        // CEK USERNAME
        // ==================================================

        const usernameCheck = await pool.query(
            `SELECT id
             FROM users
             WHERE username = $1`,
            [username]
        );

        if (usernameCheck.rows.length > 0) {
            return res.status(400).json({
                pesan: "Username sudah digunakan"
            });
        }

        // ==================================================
        // CEK PIN KASIR MILIK OWNER
        // ==================================================

        const pinCheck = await pool.query(
            `SELECT id
             FROM users
             WHERE role = 'kasir'
             AND owner_id = $1
             AND pin = $2`,
            [
                req.user.id,
                String(pin)
            ]
        );

        if (pinCheck.rows.length > 0) {
            return res.status(400).json({
                pesan: "PIN tersebut sudah digunakan oleh kasir lain"
            });
        }

        // ==================================================
        // BUAT AKUN KASIR
        // PASSWORD = NULL
        // ==================================================

        const result = await pool.query(
            `INSERT INTO users
            (
                username,
                phone,
                password,
                email,
                role,
                owner_id,
                permissions,
                pin,
                aktif
            )
            VALUES
            (
                $1,
                $2,
                NULL,
                $3,
                'kasir',
                $4,
                $5,
                $6,
                true
            )
            RETURNING
                id,
                username,
                phone,
                email,
                role,
                owner_id,
                permissions,
                pin,
                aktif,
                created_at`,
            [
                username,
                phone,
                email,
                req.user.id,
                hakAkses,
                String(pin)
            ]
        );

        const kasir = {
            ...result.rows[0],
            id_kasir: generateKasirId(result.rows[0].id)
        };

        return res.status(201).json({
            pesan: "Akun kasir berhasil dibuat",
            kasir
        });

    } catch (error) {
        console.error("ERROR BUAT KASIR:", error);

        return res.status(500).json({
            pesan: "Gagal membuat akun kasir",
            error: error.message
        });
    }
});


// ======================================================
// OWNER - LIHAT SEMUA KASIR
// ======================================================

router.get("/kasir", authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat melihat daftar kasir"
            });
        }

        const result = await pool.query(
            `SELECT
                id,
                username,
                phone,
                email,
                role,
                owner_id,
                permissions,
                pin,
                aktif,
                created_at
             FROM users
             WHERE owner_id = $1
             AND role = 'kasir'
             ORDER BY id DESC`,
            [req.user.id]
        );

        const kasir = result.rows.map((item) => ({
            ...item,
            id_kasir: generateKasirId(item.id)
        }));

        return res.json({
            pesan: "Daftar kasir berhasil diambil",
            data: kasir
        });

    } catch (error) {
        console.error("ERROR GET KASIR:", error);

        return res.status(500).json({
            pesan: "Gagal mengambil daftar kasir",
            error: error.message
        });
    }
});


// ======================================================
// OWNER - EDIT KASIR
// ======================================================

router.put("/kasir/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const {
            username,
            phone,
            email,
            permissions,
            pin
        } = req.body;

        if (req.user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat mengedit kasir"
            });
        }

        if (!username || !phone || !email) {
            return res.status(400).json({
                pesan: "Username, phone, dan email harus diisi"
            });
        }

        // ==================================================
        // VALIDASI PIN JIKA DIUBAH
        // ==================================================

        if (pin !== undefined && pin !== null && pin !== "") {

            if (!/^\d{6}$/.test(String(pin))) {
                return res.status(400).json({
                    pesan: "PIN kasir harus tepat 6 digit"
                });
            }

            const pinCheck = await pool.query(
                `SELECT id
                 FROM users
                 WHERE role = 'kasir'
                 AND owner_id = $1
                 AND pin = $2
                 AND id <> $3`,
                [
                    req.user.id,
                    String(pin),
                    id
                ]
            );

            if (pinCheck.rows.length > 0) {
                return res.status(400).json({
                    pesan: "PIN tersebut sudah digunakan oleh kasir lain"
                });
            }
        }

        // ==================================================
        // CEK EMAIL
        // ==================================================

        const emailCheck = await pool.query(
            `SELECT id
             FROM users
             WHERE email = $1
             AND id <> $2`,
            [
                email,
                id
            ]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({
                pesan: "Email sudah digunakan oleh akun lain"
            });
        }

        // ==================================================
        // CEK USERNAME
        // ==================================================

        const usernameCheck = await pool.query(
            `SELECT id
             FROM users
             WHERE username = $1
             AND id <> $2`,
            [
                username,
                id
            ]
        );

        if (usernameCheck.rows.length > 0) {
            return res.status(400).json({
                pesan: "Username sudah digunakan oleh akun lain"
            });
        }

        // ==================================================
        // UPDATE KASIR
        // ==================================================

        const result = await pool.query(
            `UPDATE users
             SET
                username = $1,
                phone = $2,
                email = $3,
                permissions = COALESCE($4::jsonb, permissions),
                pin = COALESCE($5, pin)
             WHERE id = $6
             AND owner_id = $7
             AND role = 'kasir'
             RETURNING
                id,
                username,
                phone,
                email,
                role,
                owner_id,
                permissions,
                pin,
                aktif,
                created_at`,
            [
                username,
                phone,
                email,
                permissions
                    ? JSON.stringify(permissions)
                    : null,
                pin
                    ? String(pin)
                    : null,
                id,
                req.user.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Kasir tidak ditemukan atau bukan milik owner ini"
            });
        }

        const kasir = {
            ...result.rows[0],
            id_kasir: generateKasirId(result.rows[0].id)
        };

        return res.json({
            pesan: "Data kasir berhasil diupdate",
            kasir
        });

    } catch (error) {
        console.error("ERROR EDIT KASIR:", error);

        return res.status(500).json({
            pesan: "Gagal mengedit data kasir"
        });
    }
});


// ======================================================
// OWNER - AKTIF / NONAKTIF KASIR
// ======================================================

router.put("/kasir/:id/status", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { aktif } = req.body;

        if (req.user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat mengubah status kasir"
            });
        }

        if (typeof aktif !== "boolean") {
            return res.status(400).json({
                pesan: "Status aktif harus berupa true atau false"
            });
        }

        const result = await pool.query(
            `UPDATE users
             SET aktif = $1
             WHERE id = $2
             AND owner_id = $3
             AND role = 'kasir'
             RETURNING
                id,
                username,
                phone,
                email,
                role,
                owner_id,
                permissions,
                pin,
                aktif,
                created_at`,
            [
                aktif,
                id,
                req.user.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Kasir tidak ditemukan atau bukan milik owner ini"
            });
        }

        const kasir = {
            ...result.rows[0],
            id_kasir: generateKasirId(result.rows[0].id)
        };

        return res.json({
            pesan: aktif
                ? "Kasir berhasil diaktifkan"
                : "Kasir berhasil dinonaktifkan",
            kasir
        });

    } catch (error) {
        console.error("ERROR STATUS KASIR:", error);

        return res.status(500).json({
            pesan: "Gagal mengubah status kasir"
        });
    }
});


// ======================================================
// OWNER - GANTI PIN KASIR
// ======================================================

router.put("/kasir/:id/pin", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { pinBaru } = req.body;

        if (req.user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat mengganti PIN kasir"
            });
        }

        if (!pinBaru) {
            return res.status(400).json({
                pesan: "PIN baru harus diisi"
            });
        }

        if (!/^\d{6}$/.test(String(pinBaru))) {
            return res.status(400).json({
                pesan: "PIN baru harus tepat 6 digit"
            });
        }

        // ==================================================
        // CEK PIN DUPLIKAT
        // ==================================================

        const pinCheck = await pool.query(
            `SELECT id
             FROM users
             WHERE role = 'kasir'
             AND owner_id = $1
             AND pin = $2
             AND id <> $3`,
            [
                req.user.id,
                String(pinBaru),
                id
            ]
        );

        if (pinCheck.rows.length > 0) {
            return res.status(400).json({
                pesan: "PIN tersebut sudah digunakan oleh kasir lain"
            });
        }

        // ==================================================
        // UPDATE PIN
        // ==================================================

        const result = await pool.query(
            `UPDATE users
             SET pin = $1
             WHERE id = $2
             AND owner_id = $3
             AND role = 'kasir'
             RETURNING
                id,
                username,
                phone,
                email,
                role,
                owner_id,
                pin,
                aktif`,
            [
                String(pinBaru),
                id,
                req.user.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Kasir tidak ditemukan atau bukan milik owner ini"
            });
        }

        const kasir = {
            ...result.rows[0],
            id_kasir: generateKasirId(result.rows[0].id)
        };

        return res.json({
            pesan: "PIN kasir berhasil diganti",
            kasir
        });

    } catch (error) {
        console.error("ERROR GANTI PIN KASIR:", error);

        return res.status(500).json({
            pesan: "Gagal mengganti PIN kasir"
        });
    }
});


// ======================================================
// OWNER - HAPUS KASIR
// ======================================================

router.delete("/kasir/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat menghapus kasir"
            });
        }

        const result = await pool.query(
            `DELETE FROM users
             WHERE id = $1
             AND owner_id = $2
             AND role = 'kasir'
             RETURNING
                id,
                username,
                phone,
                email,
                role,
                owner_id`,
            [
                id,
                req.user.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Kasir tidak ditemukan atau bukan milik owner ini"
            });
        }

        const kasir = {
            ...result.rows[0],
            id_kasir: generateKasirId(result.rows[0].id)
        };

        return res.json({
            pesan: "Kasir berhasil dihapus",
            kasir
        });

    } catch (error) {
        console.error("ERROR HAPUS KASIR:", error);

        return res.status(500).json({
            pesan: "Gagal menghapus kasir"
        });
    }
});


// ======================================================
// DELETE USER
// ======================================================

router.delete("/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.user.role !== "owner") {
            return res.status(403).json({
                pesan: "Hanya owner yang dapat menghapus user"
            });
        }

        const result = await pool.query(
            `DELETE FROM users
             WHERE id = $1
             AND owner_id = $2
             AND role = 'kasir'
             RETURNING
                id,
                username,
                phone,
                email,
                role,
                owner_id`,
            [
                id,
                req.user.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "User tidak ditemukan atau bukan kasir milik owner ini"
            });
        }

        const user = {
            ...result.rows[0],
            id_kasir: generateKasirId(result.rows[0].id)
        };

        return res.json({
            pesan: "User berhasil dihapus",
            user
        });

    } catch (error) {
        console.error("ERROR DELETE USER:", error);

        return res.status(500).json({
            pesan: "Gagal menghapus user"
        });
    }
});


// ======================================================
// GANTI PASSWORD USER SENDIRI
// KHUSUS OWNER
// ======================================================

router.put("/password", authMiddleware, async (req, res) => {
    try {
        const {
            passwordLama,
            passwordBaru
        } = req.body;

        // Kasir tidak menggunakan password
        if (req.user.role === "kasir") {
            return res.status(403).json({
                pesan: "Kasir menggunakan PIN 6 digit, bukan password"
            });
        }

        if (!passwordLama || !passwordBaru) {
            return res.status(400).json({
                pesan: "Password lama dan password baru harus diisi"
            });
        }

        if (passwordBaru.length < 8) {
            return res.status(400).json({
                pesan: "Password baru minimal 8 karakter"
            });
        }

        const userResult = await pool.query(
            `SELECT
                id,
                password
             FROM users
             WHERE id = $1::integer`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                pesan: "User tidak ditemukan"
            });
        }

        const user = userResult.rows[0];

        if (user.password !== passwordLama) {
            return res.status(400).json({
                pesan: "Password lama salah"
            });
        }

        await pool.query(
            `UPDATE users
             SET password = $1
             WHERE id = $2::integer`,
            [
                passwordBaru,
                req.user.id
            ]
        );

        return res.json({
            pesan: "Password berhasil diganti"
        });

    } catch (error) {
        console.error("ERROR GANTI PASSWORD:", error);

        return res.status(500).json({
            pesan: "Gagal mengganti password"
        });
    }
});


// ======================================================
// UPDATE USER SENDIRI
// ======================================================

router.put("/:id", authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const {
            username,
            phone,
            email
        } = req.body;

        if (Number(id) !== Number(req.user.id)) {
            return res.status(403).json({
                pesan: "Anda hanya dapat mengubah akun sendiri"
            });
        }

        if (!username || !phone || !email) {
            return res.status(400).json({
                pesan: "Username, phone, dan email harus diisi"
            });
        }

        // ==================================================
        // CEK EMAIL
        // ==================================================

        const emailCheck = await pool.query(
            `SELECT id
             FROM users
             WHERE email = $1
             AND id <> $2`,
            [
                email,
                id
            ]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({
                pesan: "Email sudah digunakan oleh akun lain"
            });
        }

        // ==================================================
        // UPDATE USER
        // ==================================================

        const result = await pool.query(
            `UPDATE users
             SET
                username = $1,
                phone = $2,
                email = $3
             WHERE id = $4
             RETURNING
                id,
                username,
                phone,
                email,
                role,
                owner_id,
                permissions,
                aktif,
                created_at`,
            [
                username,
                phone,
                email,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "User tidak ditemukan"
            });
        }

        const user = result.rows[0];

        if (user.role === "kasir") {
            user.id_kasir = generateKasirId(user.id);
        }

        return res.json({
            pesan: "Data akun berhasil diupdate",
            user
        });

    } catch (error) {
        console.error("ERROR UPDATE USER:", error);

        return res.status(500).json({
            pesan: "Gagal mengupdate data user"
        });
    }
});


module.exports = router;