const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");
const multer = require("multer");

const pool = require("../config/database");
const authMiddleware = require("../middleware/authMiddleware");

// =====================================================
// FOLDER LOGO
// =====================================================

const logoDirectory = path.join(
    __dirname,
    "..",
    "uploads",
    "logos"
);

if (!fs.existsSync(logoDirectory)) {
    fs.mkdirSync(logoDirectory, {
        recursive: true
    });
}

// =====================================================
// MULTER — UPLOAD LOGO
// =====================================================

const storage = multer.diskStorage({

    destination: (req, file, cb) => {

        cb(null, logoDirectory);

    },

    filename: (req, file, cb) => {

        const extension =
            path.extname(file.originalname)
                .toLowerCase();

        const ownerId =
            req.ownerId;

        cb(
            null,
            `owner-${ownerId}${extension}`
        );

    }

});

const upload = multer({

    storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: (req, file, cb) => {

        const allowedTypes = [
            "image/png",
            "image/jpeg",
            "image/webp"
        ];

        if (
            !allowedTypes.includes(
                file.mimetype
            )
        ) {

            return cb(
                new Error(
                    "Format logo harus PNG, JPG, JPEG, atau WebP."
                )
            );

        }

        cb(null, true);

    }

});


// =====================================================
// HELPER: AMBIL OWNER ID
// =====================================================

async function getOwnerId(userId) {

    const result = await pool.query(
        `SELECT id, role, owner_id
         FROM users
         WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {

        return {
            error: "User tidak ditemukan."
        };

    }

    const user = result.rows[0];

    const ownerId =
        user.role === "owner"
            ? user.id
            : user.owner_id;

    if (!ownerId) {

        return {
            error: "User belum memiliki owner."
        };

    }

    return {
        user,
        ownerId
    };

}


// =====================================================
// GET SETTINGS
// Owner dan kasir bisa membaca settings milik owner
// =====================================================

router.get(
    "/",
    authMiddleware,
    async (req, res) => {

        try {

            const ownerData =
                await getOwnerId(
                    req.user.id
                );

            if (ownerData.error) {

                return res.status(
                    ownerData.error ===
                    "User tidak ditemukan."
                        ? 404
                        : 403
                ).json({
                    pesan:
                        ownerData.error
                });

            }

            const { ownerId } =
                ownerData;

            let result =
                await pool.query(
                    `SELECT *
                     FROM settings
                     WHERE user_id = $1`,
                    [ownerId]
                );

            // =================================================
            // Jika owner belum punya settings, buat otomatis
            // =================================================

            if (result.rows.length === 0) {

                result =
                    await pool.query(
                        `INSERT INTO settings (
                            nama_toko,
                            alamat_toko,
                            telepon_toko,
                            logo,
                            pesan_struk,
                            tampil_nama,
                            tampil_alamat,
                            tampil_telepon,
                            tampil_tanggal,
                            printer,
                            ukuran_kertas,
                            konfirmasi_pembayaran,
                            auto_clear_keranjang,
                            tema,
                            kategori_usaha,
                            kota_wilayah,
                            jam_buka,
                            jam_tutup,
                            pengingat_tutup_shift,
                            pembulatan_kembalian,
                            pajak_aktif,
                            pajak_persentase,
                            service_aktif,
                            service_persentase,
                            pembayaran_tunai,
                            pembayaran_qris,
                            pembayaran_transfer,
                            pembayaran_debit,
                            notifikasi_transaksi,
                            notifikasi_shift,
                            notifikasi_stok,
                            whatsapp_notifikasi,
                            pin_keamanan,
                            kontras_tinggi,
                            user_id
                        )
                        VALUES (
                            'TOKO BARU',
                            '',
                            '',
                            NULL,
                            'Terima Kasih 🙏',
                            true,
                            true,
                            true,
                            true,
                            NULL,
                            '58mm',
                            true,
                            true,
                            'light',
                            NULL,
                            NULL,
                            '07:00',
                            '22:00',
                            false,
                            false,
                            false,
                            0,
                            false,
                            0,
                            true,
                            true,
                            false,
                            false,
                            true,
                            false,
                            false,
                            false,
                            false,
                            false,
                            $1
                        )
                        RETURNING *`,
                        [ownerId]
                    );

            }

            return res.json({

                pesan:
                    "Pengaturan berhasil diambil.",

                data:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "ERROR GET SETTINGS:",
                error
            );

            return res.status(500).json({

                pesan:
                    "Gagal mengambil pengaturan.",

                error:
                    error.message

            });

        }

    }
);


// =====================================================
// UPLOAD LOGO TOKO
// Hanya owner yang boleh mengganti logo
// =====================================================

router.post(
    "/logo",
    authMiddleware,
    async (req, res) => {

        try {

            const ownerData =
                await getOwnerId(
                    req.user.id
                );

            if (ownerData.error) {

                return res.status(
                    ownerData.error ===
                    "User tidak ditemukan."
                        ? 404
                        : 403
                ).json({
                    pesan:
                        ownerData.error
                });

            }

            const {
                user,
                ownerId
            } = ownerData;

            if (user.role !== "owner") {

                return res.status(403).json({

                    pesan:
                        "Hanya owner yang dapat mengganti logo toko."

                });

            }

            // Simpan ownerId agar bisa digunakan
            // oleh multer untuk nama file.
            req.ownerId = ownerId;

            upload.single("logo")(
                req,
                res,
                async (uploadError) => {

                    try {

                        if (uploadError) {

                            console.error(
                                "ERROR UPLOAD LOGO:",
                                uploadError
                            );

                            return res.status(400).json({

                                pesan:
                                    uploadError.message ||
                                    "Logo gagal diupload."

                            });

                        }

                        if (!req.file) {

                            return res.status(400).json({

                                pesan:
                                    "File logo belum dipilih."

                            });

                        }

                        // =================================================
                        // AMBIL LOGO LAMA
                        // =================================================

                        const existing =
                            await pool.query(
                                `SELECT logo
                                 FROM settings
                                 WHERE user_id = $1`,
                                [ownerId]
                            );

                        const oldLogo =
                            existing.rows.length > 0
                                ? existing.rows[0].logo
                                : null;

                        // =================================================
                        // HAPUS FILE LAMA
                        // =================================================

                        if (
                            oldLogo &&
                            oldLogo.startsWith(
                                "/uploads/logos/"
                            )
                        ) {

                            const oldFilename =
                                path.basename(
                                    oldLogo
                                );

                            const oldFilePath =
                                path.join(
                                    logoDirectory,
                                    oldFilename
                                );

                            if (
                                fs.existsSync(
                                    oldFilePath
                                )
                            ) {

                                fs.unlinkSync(
                                    oldFilePath
                                );

                            }

                        }

                        // =================================================
                        // PATH LOGO BARU
                        // =================================================

                        const logoPath =
                            `/uploads/logos/${req.file.filename}`;

                        // =================================================
                        // PASTIKAN SETTINGS ADA
                        // =================================================

                        if (
                            existing.rows.length === 0
                        ) {

                            await pool.query(
                                `INSERT INTO settings (
                                    nama_toko,
                                    logo,
                                    user_id
                                )
                                VALUES (
                                    $1,
                                    $2,
                                    $3
                                )`,
                                [
                                    "TOKO BARU",
                                    logoPath,
                                    ownerId
                                ]
                            );

                        } else {

                            await pool.query(
                                `UPDATE settings
                                 SET logo = $1
                                 WHERE user_id = $2`,
                                [
                                    logoPath,
                                    ownerId
                                ]
                            );

                        }

                        return res.json({

                            pesan:
                                "Logo toko berhasil diupload.",

                            logo:
                                logoPath

                        });

                    } catch (error) {

                        console.error(
                            "ERROR SAVE LOGO:",
                            error
                        );

                        return res.status(500).json({

                            pesan:
                                "Logo berhasil diupload tetapi gagal disimpan ke pengaturan.",

                            error:
                                error.message

                        });

                    }

                }
            );

        } catch (error) {

            console.error(
                "ERROR LOGO ROUTE:",
                error
            );

            return res.status(500).json({

                pesan:
                    "Gagal memproses logo toko.",

                error:
                    error.message

            });

        }

    }
);


// =====================================================
// DELETE LOGO TOKO
// Hanya owner yang boleh menghapus logo
// =====================================================

router.delete(
    "/logo",
    authMiddleware,
    async (req, res) => {

        try {

            const ownerData =
                await getOwnerId(
                    req.user.id
                );

            if (ownerData.error) {

                return res.status(
                    ownerData.error ===
                    "User tidak ditemukan."
                        ? 404
                        : 403
                ).json({
                    pesan:
                        ownerData.error
                });

            }

            const {
                user,
                ownerId
            } = ownerData;

            if (user.role !== "owner") {

                return res.status(403).json({

                    pesan:
                        "Hanya owner yang dapat menghapus logo toko."

                });

            }

            const result =
                await pool.query(
                    `SELECT logo
                     FROM settings
                     WHERE user_id = $1`,
                    [ownerId]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    pesan:
                        "Pengaturan toko tidak ditemukan."

                });

            }

            const oldLogo =
                result.rows[0].logo;

            // =================================================
            // HAPUS FILE
            // =================================================

            if (
                oldLogo &&
                oldLogo.startsWith(
                    "/uploads/logos/"
                )
            ) {

                const filename =
                    path.basename(
                        oldLogo
                    );

                const filePath =
                    path.join(
                        logoDirectory,
                        filename
                    );

                if (
                    fs.existsSync(
                        filePath
                    )
                ) {

                    fs.unlinkSync(
                        filePath
                    );

                }

            }

            // =================================================
            // HAPUS PATH DARI DATABASE
            // =================================================

            await pool.query(
                `UPDATE settings
                 SET logo = NULL
                 WHERE user_id = $1`,
                [ownerId]
            );

            return res.json({

                pesan:
                    "Logo toko berhasil dihapus.",

                logo:
                    null

            });

        } catch (error) {

            console.error(
                "ERROR DELETE LOGO:",
                error
            );

            return res.status(500).json({

                pesan:
                    "Gagal menghapus logo toko.",

                error:
                    error.message

            });

        }

    }
);


// =====================================================
// PUT SETTINGS
// Hanya owner yang boleh mengubah settings
// =====================================================

router.put(
    "/",
    authMiddleware,
    async (req, res) => {

        try {

            const ownerData =
                await getOwnerId(
                    req.user.id
                );

            if (ownerData.error) {

                return res.status(
                    ownerData.error ===
                    "User tidak ditemukan."
                        ? 404
                        : 403
                ).json({
                    pesan:
                        ownerData.error
                });

            }

            const {
                user,
                ownerId
            } = ownerData;

            if (user.role !== "owner") {

                return res.status(403).json({

                    pesan:
                        "Hanya owner yang dapat mengubah pengaturan."

                });

            }

            const {
                nama_toko,
                alamat_toko,
                telepon_toko,
                logo,
                pesan_struk,

                tampil_nama,
                tampil_alamat,
                tampil_telepon,
                tampil_tanggal,

                printer,
                ukuran_kertas,

                konfirmasi_pembayaran,
                auto_clear_keranjang,

                tema,
                kategori_usaha,
                kota_wilayah,
                jam_buka,
                jam_tutup,

                pengingat_tutup_shift,
                pembulatan_kembalian,

                pajak_aktif,
                pajak_persentase,

                service_aktif,
                service_persentase,

                pembayaran_tunai,
                pembayaran_qris,
                pembayaran_transfer,
                pembayaran_debit,

                notifikasi_transaksi,
                notifikasi_shift,
                notifikasi_stok,
                whatsapp_notifikasi,

                pin_keamanan,
                kontras_tinggi
            } = req.body;

            // =================================================
            // PASTIKAN SETTINGS SUDAH ADA
            // =================================================

            const existing =
                await pool.query(
                    `SELECT id
                     FROM settings
                     WHERE user_id = $1`,
                    [ownerId]
                );

            if (
                existing.rows.length === 0
            ) {

                await pool.query(
                    `INSERT INTO settings (
                        nama_toko,
                        user_id
                    )
                    VALUES ($1, $2)`,
                    [
                        nama_toko ||
                            "TOKO BARU",
                        ownerId
                    ]
                );

            }

            // =================================================
            // UPDATE SEMUA SETTINGS
            // =================================================

            const result =
                await pool.query(
                    `UPDATE settings
                     SET
                        nama_toko = $1,
                        alamat_toko = $2,
                        telepon_toko = $3,
                        logo = $4,
                        pesan_struk = $5,

                        tampil_nama = $6,
                        tampil_alamat = $7,
                        tampil_telepon = $8,
                        tampil_tanggal = $9,

                        printer = $10,
                        ukuran_kertas = $11,

                        konfirmasi_pembayaran = $12,
                        auto_clear_keranjang = $13,

                        tema = $14,
                        kategori_usaha = $15,
                        kota_wilayah = $16,
                        jam_buka = $17,
                        jam_tutup = $18,

                        pengingat_tutup_shift = $19,
                        pembulatan_kembalian = $20,

                        pajak_aktif = $21,
                        pajak_persentase = $22,

                        service_aktif = $23,
                        service_persentase = $24,

                        pembayaran_tunai = $25,
                        pembayaran_qris = $26,
                        pembayaran_transfer = $27,
                        pembayaran_debit = $28,

                        notifikasi_transaksi = $29,
                        notifikasi_shift = $30,
                        notifikasi_stok = $31,
                        whatsapp_notifikasi = $32,

                        pin_keamanan = $33,
                        kontras_tinggi = $34

                     WHERE user_id = $35

                     RETURNING *`,
                    [
                        nama_toko,
                        alamat_toko,
                        telepon_toko,
                        logo,
                        pesan_struk,

                        tampil_nama,
                        tampil_alamat,
                        tampil_telepon,
                        tampil_tanggal,

                        printer,
                        ukuran_kertas,

                        konfirmasi_pembayaran,
                        auto_clear_keranjang,

                        tema,
                        kategori_usaha,
                        kota_wilayah,
                        jam_buka,
                        jam_tutup,

                        pengingat_tutup_shift,
                        pembulatan_kembalian,

                        pajak_aktif,
                        pajak_persentase,

                        service_aktif,
                        service_persentase,

                        pembayaran_tunai,
                        pembayaran_qris,
                        pembayaran_transfer,
                        pembayaran_debit,

                        notifikasi_transaksi,
                        notifikasi_shift,
                        notifikasi_stok,
                        whatsapp_notifikasi,

                        pin_keamanan,
                        kontras_tinggi,

                        ownerId
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    pesan:
                        "Pengaturan tidak ditemukan."

                });

            }

            return res.json({

                pesan:
                    "Semua pengaturan toko berhasil disimpan.",

                data:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "ERROR UPDATE SETTINGS:",
                error
            );

            return res.status(500).json({

                pesan:
                    "Gagal menyimpan pengaturan.",

                error:
                    error.message

            });

        }

    }
);

// UPDATE TEMA OUTLET AJA
// Tema dibagikan kepada owner dan seluruh kasirnya

router.patch(
    "/tema",
    authMiddleware,
    async (req, res) => {
        try {
            const { tema } = req.body;

            if (!["light", "dark", "system"].includes(tema)) {
                return res.status(400).json({
                    pesan: "Pilihan tema tidak valid.",
                });
            }

            const ownerData = await getOwnerId(req.user.id);

            if (ownerData.error) {
                return res.status(403).json({
                    pesan: ownerData.error,
                });
            }

            const { ownerId } = ownerData;

            let result = await pool.query(
                `UPDATE settings
                 SET tema = $1
                 WHERE user_id = $2
                 RETURNING tema`,
                [tema, ownerId]
            );

            if (result.rows.length === 0) {
                result = await pool.query(
                    `INSERT INTO settings (
                        nama_toko,
                        user_id,
                        tema
                    )
                    VALUES ($1, $2, $3)
                    RETURNING tema`,
                    ["TOKO BARU", ownerId, tema]
                );
            }

            return res.json({
                pesan: "Tema outlet berhasil disimpan.",
                data: result.rows[0],
            });
        } catch (error) {
            console.error("ERROR UPDATE TEMA:", error);

            return res.status(500).json({
                pesan: "Gagal menyimpan tema outlet.",
            });
        }
    }
);


module.exports = router;