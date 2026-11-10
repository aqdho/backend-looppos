const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const pool = require("../config/database");

const sharp = require("sharp");

router.post("/kirim-struk", authMiddleware, async (req, res) => {
    try {
        const {
            transaksi_id,
            nomor_pelanggan
        } = req.body;

        if (!transaksi_id) {
            return res.status(400).json({
                pesan: "transaksi_id wajib diisi."
            });
        }

        if (!nomor_pelanggan) {
            return res.status(400).json({
                pesan: "Nomor pelanggan wajib diisi."
            });
        }

        const userId = req.user.id;

        const transaksiResult = await pool.query(
            `
            SELECT
                id,
                tanggal,
                total,
                bayar
            FROM transaksi
            WHERE id = $1
            AND user_id = $2
            `,
            [transaksi_id, userId]
        );

        if (transaksiResult.rows.length === 0) {
            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan."
            });
        }

        const transaksi = transaksiResult.rows[0];

        const detailResult = await pool.query(
            `
            SELECT
                p.nama,
                td.qty,
                td.harga,
                td.subtotal
            FROM transaksi_detail td
            JOIN products p
                ON p.id = td.produk_id
            WHERE td.transaksi_id = $1
            ORDER BY td.id ASC
            `,
            [transaksi_id]
        );

        const settingsResult = await pool.query(
            `
            SELECT
                nama_toko,
                alamat_toko,
                telepon_toko,
                pesan_struk
            FROM settings
            WHERE user_id = $1
            `,
            [userId]
        );

        const settings = settingsResult.rows[0] || {};

        let nomor = String(nomor_pelanggan).replace(/\D/g, "");

        if (nomor.startsWith("0")) {
            nomor = "62" + nomor.slice(1);
        }

        console.log("REQUEST WHATSAPP STRUK:", {
            transaksi_id,
            nomor_pelanggan: nomor,
            user_id: userId
        });

        return res.json({
            status: "ok",
            pesan: "Data struk siap dikirim.",
            nomor_pelanggan: nomor,
            transaksi,
            detail: detailResult.rows,
            settings
        });

    } catch (error) {
        console.error(
            "ERROR WHATSAPP STRUK:",
            error
        );

        return res.status(500).json({
            pesan: "Gagal memproses struk.",
            error: error.message
        });
    }
});


router.get(
    "/struk-gambar/:transaksi_id",
    authMiddleware,
    async (req, res) => {
        try {
            const transaksiId = req.params.transaksi_id;
            const userId = req.user.id;

            const jenisStruk = [
                "users",
                "table",
                "kitchen"
            ].includes(req.query.jenis_struk)
                ? req.query.jenis_struk
                : "users";

            const transaksiResult = await pool.query(
                `
                SELECT
                    id,
                    tanggal,
                    total,
                    bayar
                FROM transaksi
                WHERE id = $1
                AND user_id = $2
                `,
                [transaksiId, userId]
            );

            if (transaksiResult.rows.length === 0) {
                return res.status(404).json({
                    pesan: "Transaksi tidak ditemukan."
                });
            }

            const transaksi = transaksiResult.rows[0];

            const detailResult = await pool.query(
                `
                SELECT
                    p.nama,
                    td.qty,
                    td.subtotal
                FROM transaksi_detail td
                JOIN products p
                    ON p.id = td.produk_id
                WHERE td.transaksi_id = $1
                ORDER BY td.id ASC
                `,
                [transaksiId]
            );

            const settingsResult = await pool.query(
                `
                SELECT
                    nama_toko,
                    alamat_toko,
                    telepon_toko,
                    pesan_struk
                FROM settings
                WHERE user_id = $1
                `,
                [userId]
            );

            const settings = settingsResult.rows[0] || {};

            const total = Number(transaksi.total);
            const bayar = Number(transaksi.bayar);
            const kembali = Math.max(bayar - total, 0);

            const formatRp = (angka) => {
                return `Rp ${Number(angka).toLocaleString("id-ID")}`;
            };

            const tanggal = new Date(
                transaksi.tanggal
            ).toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta"
            });

            const escapeXml = (text) => {
                return String(text || "")
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&apos;");
            };

            const toko = escapeXml(
                settings.nama_toko || "Kasir App"
            );

            const alamat = escapeXml(
                settings.alamat_toko || ""
            );

            const telepon = escapeXml(
                settings.telepon_toko || ""
            );

            const pesan = escapeXml(
                settings.pesan_struk || ""
            );

            let y = 80;
            let teks = "";

            // HEADER TOKO
            teks += `
                <text
                    x="300"
                    y="${y}"
                    text-anchor="middle"
                    font-size="30"
                    font-family="Arial"
                    font-weight="bold"
                    fill="black"
                >${toko}</text>
            `;

            y += 40;

            teks += `
                <text
                    x="300"
                    y="${y}"
                    text-anchor="middle"
                    font-size="18"
                    font-family="Arial"
                    fill="black"
                >${alamat}</text>
            `;

            y += 30;

            teks += `
                <text
                    x="300"
                    y="${y}"
                    text-anchor="middle"
                    font-size="18"
                    font-family="Arial"
                    fill="black"
                >${telepon}</text>
            `;

            y += 30;

            teks += `
                <text
                    x="300"
                    y="${y}"
                    text-anchor="middle"
                    font-size="18"
                    font-family="Arial"
                    fill="black"
                >${escapeXml(tanggal)}</text>
            `;

            y += 35;

            teks += `
                <line
                    x1="30"
                    y1="${y}"
                    x2="570"
                    y2="${y}"
                    stroke="black"
                    stroke-width="2"
                />
            `;

            y += 40;

            // DETAIL PRODUK
            for (const item of detailResult.rows) {
                const nama = escapeXml(item.nama);

                const informasiKanan =
                    jenisStruk === "kitchen"
                        ? `JUMLAH: ${item.qty}`
                        : formatRp(item.subtotal);

                teks += `
                    <text
                        x="30"
                        y="${y}"
                        font-size="20"
                        font-family="Arial"
                        fill="black"
                    >${nama}</text>

                    <text
                        x="570"
                        y="${y}"
                        text-anchor="end"
                        font-size="20"
                        font-family="Arial"
                        fill="black"
                    >${escapeXml(informasiKanan)}</text>
                `;

                y += 45;
            }

            y += 10;

            // PEMISAH DETAIL PRODUK
            teks += `
                <line
                    x1="30"
                    y1="${y}"
                    x2="570"
                    y2="${y}"
                    stroke="black"
                    stroke-width="2"
                />
            `;

            y += 40;

            // TOTAL UNTUK STRUK PEMBAYARAN DAN TAGIHAN
            if (jenisStruk !== "kitchen") {
                teks += `
                    <text
                        x="30"
                        y="${y}"
                        font-size="22"
                        font-family="Arial"
                        font-weight="bold"
                        fill="black"
                    >${jenisStruk === "table" ? "Total Tagihan" : "Total"}</text>

                    <text
                        x="570"
                        y="${y}"
                        text-anchor="end"
                        font-size="22"
                        font-family="Arial"
                        font-weight="bold"
                        fill="black"
                    >${escapeXml(formatRp(total))}</text>
                `;

                y += 40;

                // BAYAR DAN KEMBALIAN HANYA UNTUK STRUK PEMBAYARAN
                if (jenisStruk === "users") {
                    teks += `
                        <text
                            x="30"
                            y="${y}"
                            font-size="20"
                            font-family="Arial"
                            fill="black"
                        >Bayar</text>

                        <text
                            x="570"
                            y="${y}"
                            text-anchor="end"
                            font-size="20"
                            font-family="Arial"
                            fill="black"
                        >${escapeXml(formatRp(bayar))}</text>
                    `;

                    y += 40;

                    teks += `
                        <text
                            x="30"
                            y="${y}"
                            font-size="20"
                            font-family="Arial"
                            fill="black"
                        >Kembali</text>

                        <text
                            x="570"
                            y="${y}"
                            text-anchor="end"
                            font-size="20"
                            font-family="Arial"
                            fill="black"
                        >${escapeXml(formatRp(kembali))}</text>
                    `;

                    y += 45;
                }
            }

            // FOOTER
            teks += `
                <line
                    x1="30"
                    y1="${y}"
                    x2="570"
                    y2="${y}"
                    stroke="black"
                    stroke-width="2"
                />
            `;

            y += 40;

            teks += `
                <text
                    x="300"
                    y="${y}"
                    text-anchor="middle"
                    font-size="18"
                    font-family="Arial"
                    fill="black"
                >${pesan}</text>
            `;

            y += 50;

            const svg = `
                <svg
                    width="600"
                    height="${y}"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <rect
                        width="600"
                        height="${y}"
                        fill="white"
                    />

                    ${teks}
                </svg>
            `;

            const image = await sharp(
                Buffer.from(svg)
            )
                .png()
                .toBuffer();

            res.setHeader(
                "Content-Type",
                "image/png"
            );

            res.send(image);

        } catch (error) {
            console.error(
                "ERROR GAMBAR STRUK:",
                error
            );

            res.status(500).json({
                pesan: "Gagal membuat gambar struk.",
                error: error.message
            });
        }
    }
);


module.exports = router;