require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { spawn } = require("child_process");

const pool = require("./config/database");

const authMiddleware = require("./middleware/authMiddleware");

const productsRoutes = require("./routes/productsRoutes");
const authRoutes = require("./auth/authRoutes");
const usersRoutes = require("./users/usersRoutes");
const kategoriRouter = require("./kategori/kategoriRoutes");
const transaksiDetailRoutes = require("./routes/transaksiDetailRoutes");
const transaksiRoutes = require("./routes/transaksiRoutes");
const shiftRoutes = require("./routes/shiftRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const pengeluaranRoutes = require("./routes/pengeluaranRoutes");
const printAgentRoutes = require("./routes/printAgentRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");

const paymentRoutes = require("./routes/paymentRoutes");

const printManager = require("./print-manager/printManager");

const notifikasiRoutes = require("./routes/notifikasiRoutes");



const app = express();

app.use(cors());

app.use(express.json());

const PORT = process.env.PORT || 3000;

// =====================================================
// STATIC PRODUK
// =====================================================

app.use(
    "/produk",
    express.static(
        path.join(__dirname, "produk")
    )
);

// STATUC LOGO TOKO

app.use(
    "/uploads/logos",
    express.static(
        path.join(
            __dirname,
            "uploads",
            "logos"
        )
    )
);

// =====================================================
// LOG REQUEST
// =====================================================

app.use((req, res, next) => {

    console.log(
        `${req.method} ${req.url}`
    );

    next();

});

// =====================================================
// TEST ROUTE
// =====================================================

app.get("/", (req, res) => {

    res.send("Halo Dunia");

});

app.get("/users", (req, res) => {

    res.send("Hai Users");

});

// =====================================================
// ME
// =====================================================

app.get(
    "/me",
    authMiddleware,
    async (req, res) => {

        try {

            console.log(
                "USER DARI TOKEN:",
                req.user
            );

            const userId =
                Number(req.user.id);

            const result =
                await pool.query(
                    `SELECT
                        id,
                        username,
                        phone,
                        email,
                        role
                     FROM users
                     WHERE id = $1`,
                    [userId]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    pesan:
                        "User tidak ditemukan"
                });

            }

            res.json({

                pesan:
                    "Data user berhasil diambil",

                user:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "ERROR GET ME:",
                error
            );

            res.status(500).json({

                pesan:
                    "Gagal mengambil data user",

                error:
                    error.message

            });

        }

    }

);

// =====================================================
// ROUTES
// =====================================================

app.use(
    "/auth",
    authRoutes
);

app.use(
    "/products",
    productsRoutes
);

app.use(
    "/users",
    usersRoutes
);

app.use(
    "/kategori",
    kategoriRouter
);

app.use(
    "/transaksi-detail",
    transaksiDetailRoutes
);

app.use(
    "/transaksi",
    transaksiRoutes
);

app.use(
    "/shift",
    shiftRoutes
);

app.use(
    "/settings",
    settingsRoutes
);

app.use(
    "/pengeluaran",
    pengeluaranRoutes
);

app.use(
    "/print-agent",
    printAgentRoutes
);

app.use(
    "/whatsapp",
    whatsappRoutes
);

app.use(
    "/payment",
    paymentRoutes
);

app.use(
    "/notifikasi",
    notifikasiRoutes
);

console.log(
    "ROUTE TRANSAKSI DETAIL AKTIF"
);

// =====================================================
// CETAK STRUK
// =====================================================

app.post(
    "/print/struk",
    authMiddleware,
    async (req, res) => {

        try {

            const {
                transaksi_id,
                device_id,
                printer
            } = req.body;

            const userId =
                req.user.id;

            if (!transaksi_id) {

                return res.status(400).json({

                    pesan:
                        "ID transaksi tidak ditemukan."

                });

            }

            // =================================================
            // AMBIL SETTINGS USER
            // =================================================

            const settingsResult =
                await pool.query(
                    `SELECT
                        nama_toko,
                        alamat_toko,
                        telepon_toko,
                        pesan_struk,
                        tampil_nama,
                        tampil_alamat,
                        tampil_telepon,
                        tampil_tanggal,
                        ukuran_kertas
                     FROM settings
                     WHERE user_id = $1`,
                    [userId]
                );

            if (
                settingsResult.rows.length === 0
            ) {

                return res.status(404).json({

                    pesan:
                        "Pengaturan toko tidak ditemukan."

                });

            }

            const settings =
                settingsResult.rows[0];

            // =================================================
            // AMBIL TRANSAKSI
            // =================================================

            const transaksiResult =
                await pool.query(
                    `SELECT
                        id,
                        tanggal,
                        total,
                        bayar
                     FROM transaksi
                     WHERE id = $1
                     AND user_id = $2`,
                    [
                        transaksi_id,
                        userId
                    ]
                );

            if (
                transaksiResult.rows.length === 0
            ) {

                return res.status(404).json({

                    pesan:
                        "Transaksi tidak ditemukan."

                });

            }

            const transaksi =
                transaksiResult.rows[0];

            // =================================================
            // TOTAL / BAYAR / KEMBALI
            // =================================================

            const total =
                Number(transaksi.total);

            const uangBayar =
                Number(transaksi.bayar);

            const kembali =
                uangBayar - total;

            // =================================================
            // DETAIL TRANSAKSI
            // =================================================

            const detailResult =
                await pool.query(
                    `SELECT
                        p.nama,
                        td.qty,
                        td.harga,
                        td.subtotal
                     FROM transaksi_detail td
                     JOIN products p
                        ON p.id = td.produk_id
                     WHERE td.transaksi_id = $1
                     ORDER BY td.id ASC`,
                    [transaksi_id]
                );

            // =================================================
            // FORMAT STRUK
            // =================================================

            // 58mm = 32 karakter
            // 80mm = 48 karakter

            const ukuranKertas =
                String(
                    settings.ukuran_kertas || "58mm"
                ).toLowerCase();

            const lebarStruk =
                ukuranKertas === "80mm"
                    ? 48
                    : 32;

            const garis =
                "-".repeat(lebarStruk);

            let struk = "";

            // Reset printer
            struk += "\x1B\x40";

            // =================================================
            // HEADER — TENGAH
            // =================================================

            struk += "\x1B\x61\x01";

            if (settings.tampil_nama) {

                struk +=
                    `${settings.nama_toko || ""}\n`;

            }

            if (settings.tampil_alamat) {

                struk +=
                    `${settings.alamat_toko || ""}\n`;

            }

            if (settings.tampil_telepon) {

                struk +=
                    `${settings.telepon_toko || ""}\n`;

            }

            if (settings.tampil_tanggal) {

                const tanggal =
                    new Date(
                        transaksi.tanggal
                    ).toLocaleString(
                        "id-ID",
                        {
                            timeZone:
                                "Asia/Jakarta"
                        }
                    );

                struk +=
                    `${tanggal}\n`;

            }

            struk += "\n";

            // =================================================
            // BODY — KIRI
            // =================================================

            struk += "\x1B\x61\x00";

            struk +=
                garis + "\n";

            // =================================================
            // PRODUK
            // =================================================

            for (
                const item
                of detailResult.rows
            ) {

                const nama =
                    String(
                        item.nama || ""
                    );

                const qty =
                    Number(
                        item.qty
                    );

                const subtotal =
                    Number(
                        item.subtotal
                    );

                const hargaText =
                    `Rp ${subtotal.toLocaleString(
                        "id-ID"
                    )}`;

                /*
                 * Lebar struk mengikuti pengaturan:
                 *
                 * 58mm = 32 karakter
                 * 80mm = 48 karakter
                 *
                 * Harga tetap rata kanan.
                 */

                const namaProduk =
                    `${nama} x${qty}`;

                const sisaSpasi =
                    Math.max(
                        1,
                        lebarStruk -
                        namaProduk.length -
                        hargaText.length
                    );

                struk +=
                    `${namaProduk}${" ".repeat(
                        sisaSpasi
                    )}${hargaText}\n`;

            }

            // =================================================
            // GARIS
            // =================================================

            struk +=
                garis + "\n";

            // =================================================
            // TOTAL / BAYAR / KEMBALI
            // =================================================

            struk +=
                `Total       Rp ${total.toLocaleString(
                    "id-ID"
                )}\n`;

            struk +=
                `Bayar       Rp ${uangBayar.toLocaleString(
                    "id-ID"
                )}\n`;

            struk +=
                `Kembali     Rp ${Math.max(
                    kembali,
                    0
                ).toLocaleString(
                    "id-ID"
                )}\n`;

            // =================================================
            // GARIS
            // =================================================

            struk +=
                garis + "\n";

            // =================================================
            // PESAN — TENGAH
            // =================================================

            struk +=
                "\x1B\x61\x01";

            if (settings.pesan_struk) {

                const pesan =
                    String(
                        settings.pesan_struk
                    );

                const barisPesan =
                    pesan.split("\n");

                for (
                    const baris
                    of barisPesan
                ) {

                    struk +=
                        `${baris}\n`;

                }

            }

            // Feed kertas

            struk +=
                "\n\n\n";

            // =================================================
            // PRINT MANAGER
            // =================================================

            try {

                await printManager.print(
                    struk,
                    printer,
                    device_id
                );

                return res.json({

                    pesan:
                        "Struk berhasil dicetak.",

                    status:
                        "ok",

                    ukuran_kertas:
                        settings.ukuran_kertas ||
                        "58mm"

                });

            } catch (printError) {

                console.error(
                    "ERROR PRINT MANAGER:",
                    printError
                );

                return res.status(503).json({

                    pesan:
                        "Gagal mencetak struk.",

                    error:
                        printError.message

                });

            }

        } catch (error) {

            console.error(
                "ERROR GENERATE STRUK:",
                error
            );

            return res.status(500).json({

                pesan:
                    "Gagal membuat struk.",

                error:
                    error.message

            });

        }

    }

);

// =====================================================
// START SERVER
// =====================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server berjalan di port ${PORT}`
        );

    }
);
