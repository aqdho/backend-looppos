const pool = require("../config/database");


// =========================
// HELPER OWNER ID
// =========================

const getOwnerId = async (userId) => {
    const result = await pool.query(
        `SELECT id, role, owner_id
         FROM users
         WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    const user = result.rows[0];

    return user.role === "owner"
        ? user.id
        : user.owner_id;
};


// =========================
// HELPER ANGKA
// =========================

const toNumber = (value) => {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : 0;
};


// =========================
// POST /transaksi-detail
// =========================

const createTransaksiDetail = async (req, res) => {
    const client = await pool.connect();

    try {
        const {
            transaksi_id,
            produk_id,
            qty,
            harga
        } = req.body;

        const ownerId = await getOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        console.log("BODY MASUK:", req.body);

        if (
            !transaksi_id ||
            !produk_id ||
            !qty ||
            harga === undefined ||
            harga === null
        ) {
            return res.status(400).json({
                pesan:
                    "transaksi_id, produk_id, qty, dan harga wajib diisi"
            });
        }

        const qtyNumber = toNumber(qty);
        const hargaNumber = toNumber(harga);

        if (qtyNumber <= 0) {
            return res.status(400).json({
                pesan: "Qty harus lebih besar dari 0"
            });
        }

        if (hargaNumber < 0) {
            return res.status(400).json({
                pesan: "Harga tidak boleh negatif"
            });
        }

        await client.query("BEGIN");

        // =========================
        // CEK TRANSAKSI
        // =========================

        const cekTransaksi = await client.query(
            `SELECT id
             FROM transaksi
             WHERE id = $1
             AND user_id = $2
             FOR UPDATE`,
            [transaksi_id, ownerId]
        );

        if (cekTransaksi.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan"
            });
        }

        // =========================
        // CEK PRODUK + AMBIL HPP
        // =========================

        const cekProduk = await client.query(
            `SELECT
                id,
                nama,
                qty,
                harga_modal
             FROM products
             WHERE id = $1
             AND user_id = $2
             FOR UPDATE`,
            [produk_id, ownerId]
        );

        if (cekProduk.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                pesan: "Produk tidak ditemukan"
            });
        }

        const produk = cekProduk.rows[0];

        const stokProduk = toNumber(produk.qty);

        const hargaModal = Math.max(
            0,
            toNumber(produk.harga_modal)
        );

        // =========================
        // CEK STOK
        // =========================

        if (stokProduk < qtyNumber) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                pesan:
                    `Stok ${produk.nama} tidak mencukupi. ` +
                    `Stok tersedia: ${stokProduk}`
            });
        }

        // =========================
        // HITUNG SUBTOTAL
        // =========================

        const subtotal = Math.round(
            qtyNumber * hargaNumber
        );

        // =========================
        // SIMPAN DETAIL + SNAPSHOT HPP
        // =========================

        const result = await client.query(
            `INSERT INTO transaksi_detail
            (
                transaksi_id,
                produk_id,
                qty,
                harga,
                harga_modal,
                subtotal
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
            [
                transaksi_id,
                produk_id,
                qtyNumber,
                hargaNumber,
                hargaModal,
                subtotal
            ]
        );

        // =========================
        // KURANGI STOK
        // =========================

        await client.query(
            `UPDATE products
             SET qty = qty - $1
             WHERE id = $2
             AND user_id = $3`,
            [
                qtyNumber,
                produk_id,
                ownerId
            ]
        );

        await client.query("COMMIT");

        return res.status(201).json({
            pesan: "Detail transaksi berhasil ditambahkan",
            data: result.rows[0]
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "ERROR CREATE TRANSAKSI DETAIL:",
            error
        );

        return res.status(500).json({
            pesan: "Gagal menambahkan detail transaksi"
        });
    } finally {
        client.release();
    }
};


// =========================
// GET /transaksi-detail
// =========================

const getTransaksiDetail = async (req, res) => {
    try {
        const ownerId = await getOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        const result = await pool.query(
            `SELECT
                td.id,
                td.transaksi_id,
                td.produk_id,
                td.qty,
                td.harga,
                td.harga_modal,
                td.subtotal
             FROM transaksi_detail td
             JOIN transaksi t
                 ON td.transaksi_id = t.id
             WHERE t.user_id = $1
             ORDER BY td.id ASC`,
            [ownerId]
        );

        return res.status(200).json({
            pesan: "Data detail transaksi berhasil ditemukan",
            data: result.rows
        });

    } catch (error) {
        console.error(
            "ERROR GET TRANSAKSI DETAIL:",
            error
        );

        return res.status(500).json({
            pesan: "Gagal mengambil data detail transaksi"
        });
    }
};


// =========================
// GET /transaksi-detail/:id
// =========================

const getTransaksiDetailById = async (req, res) => {
    try {
        const id = req.params.id;

        const ownerId = await getOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        const result = await pool.query(
            `SELECT
                td.id,
                td.transaksi_id,
                td.produk_id,
                td.qty,
                td.harga,
                td.harga_modal,
                td.subtotal
             FROM transaksi_detail td
             JOIN transaksi t
                 ON td.transaksi_id = t.id
             WHERE td.id = $1
             AND t.user_id = $2`,
            [id, ownerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Detail transaksi tidak ditemukan"
            });
        }

        return res.status(200).json({
            pesan: "Detail transaksi berhasil ditemukan",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(
            "ERROR GET TRANSAKSI DETAIL BY ID:",
            error
        );

        return res.status(500).json({
            pesan: "Gagal mengambil detail transaksi"
        });
    }
};


// =========================
// GET /transaksi-detail/transaksi/:transaksiId
// =========================

const getDetailByTransaksiId = async (req, res) => {
    try {
        const transaksiId =
            req.params.transaksiId;

        const ownerId =
            await getOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        const result = await pool.query(
            `SELECT
                td.id,
                td.transaksi_id,
                td.produk_id,
                products.nama,
                products.gambar,
                td.qty,
                td.harga,
                td.harga_modal,
                td.subtotal
             FROM transaksi_detail td
             JOIN transaksi
                 ON td.transaksi_id = transaksi.id
             JOIN products
                 ON td.produk_id = products.id
             WHERE td.transaksi_id = $1
             AND transaksi.user_id = $2
             AND products.user_id = $2
             ORDER BY td.id ASC`,
            [
                transaksiId,
                ownerId
            ]
        );

        console.log(
            "DETAIL DARI DATABASE:",
            result.rows
        );

        return res.status(200).json({
            pesan:
                "Detail transaksi berhasil ditemukan",
            data: result.rows
        });

    } catch (error) {
        console.error(
            "ERROR GET DETAIL TRANSAKSI:",
            error
        );

        return res.status(500).json({
            pesan: "Gagal mengambil detail transaksi"
        });
    }
};


// =========================
// PUT /transaksi-detail/:id
// =========================

const updateTransaksiDetail = async (req, res) => {
    const client = await pool.connect();

    try {
        const id = req.params.id;

        const {
            transaksi_id,
            produk_id,
            qty,
            harga
        } = req.body;

        const ownerId =
            await getOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        if (
            !transaksi_id ||
            !produk_id ||
            !qty ||
            harga === undefined ||
            harga === null
        ) {
            return res.status(400).json({
                pesan:
                    "transaksi_id, produk_id, qty, dan harga wajib diisi"
            });
        }

        const qtyNumber = toNumber(qty);
        const hargaNumber = toNumber(harga);

        if (qtyNumber <= 0) {
            return res.status(400).json({
                pesan: "Qty harus lebih besar dari 0"
            });
        }

        if (hargaNumber < 0) {
            return res.status(400).json({
                pesan: "Harga tidak boleh negatif"
            });
        }

        await client.query("BEGIN");

        // =========================
        // DETAIL LAMA
        // =========================

        const detailLama =
            await client.query(
                `SELECT td.*
                 FROM transaksi_detail td
                 JOIN transaksi t
                     ON td.transaksi_id = t.id
                 WHERE td.id = $1
                 AND t.user_id = $2
                 FOR UPDATE`,
                [
                    id,
                    ownerId
                ]
            );

        if (detailLama.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                pesan:
                    "Detail transaksi tidak ditemukan"
            });
        }

        const dataLama =
            detailLama.rows[0];

        // =========================
        // CEK TRANSAKSI BARU
        // =========================

        const cekTransaksi =
            await client.query(
                `SELECT id
                 FROM transaksi
                 WHERE id = $1
                 AND user_id = $2
                 FOR UPDATE`,
                [
                    transaksi_id,
                    ownerId
                ]
            );

        if (cekTransaksi.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                pesan:
                    "Transaksi tidak ditemukan"
            });
        }

        // =========================
        // CEK PRODUK BARU + HPP
        // =========================

        const cekProdukBaru =
            await client.query(
                `SELECT
                    id,
                    nama,
                    qty,
                    harga_modal
                 FROM products
                 WHERE id = $1
                 AND user_id = $2
                 FOR UPDATE`,
                [
                    produk_id,
                    ownerId
                ]
            );

        if (cekProdukBaru.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                pesan:
                    "Produk tidak ditemukan"
            });
        }

        const produkBaru =
            cekProdukBaru.rows[0];

        const stokProdukBaru =
            toNumber(produkBaru.qty);

        const hargaModalBaru =
            Math.max(
                0,
                toNumber(
                    produkBaru.harga_modal
                )
            );

        const produkBerubah =
            Number(dataLama.produk_id) !==
            Number(produk_id);

        // =========================
        // PRODUK TIDAK BERUBAH
        // =========================

        if (!produkBerubah) {
            const selisihQty =
                qtyNumber -
                toNumber(dataLama.qty);

            if (
                selisihQty > 0 &&
                stokProdukBaru < selisihQty
            ) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    pesan:
                        `Stok ${produkBaru.nama} tidak mencukupi. ` +
                        `Stok tersedia: ${stokProdukBaru}`
                });
            }

            const subtotal =
                Math.round(
                    qtyNumber *
                    hargaNumber
                );

            const result =
                await client.query(
                    `UPDATE transaksi_detail
                     SET transaksi_id = $1,
                         produk_id = $2,
                         qty = $3,
                         harga = $4,
                         harga_modal = $5,
                         subtotal = $6
                     WHERE id = $7
                     RETURNING *`,
                    [
                        transaksi_id,
                        produk_id,
                        qtyNumber,
                        hargaNumber,
                        hargaModalBaru,
                        subtotal,
                        id
                    ]
                );

            // Sesuaikan stok
            if (selisihQty !== 0) {
                await client.query(
                    `UPDATE products
                     SET qty = qty - $1
                     WHERE id = $2
                     AND user_id = $3`,
                    [
                        selisihQty,
                        produk_id,
                        ownerId
                    ]
                );
            }

            await client.query("COMMIT");

            return res.status(200).json({
                pesan:
                    "Detail transaksi berhasil diubah",
                data: result.rows[0]
            });
        }

        // =========================
        // PRODUK BERUBAH
        // =========================

        // Kembalikan stok produk lama
        await client.query(
            `UPDATE products
             SET qty = qty + $1
             WHERE id = $2
             AND user_id = $3`,
            [
                dataLama.qty,
                dataLama.produk_id,
                ownerId
            ]
        );

        // Setelah stok lama dikembalikan,
        // cek stok produk baru
        const stokProdukBaruSetelahPengembalian =
            toNumber(
                (
                    await client.query(
                        `SELECT qty
                         FROM products
                         WHERE id = $1
                         AND user_id = $2
                         FOR UPDATE`,
                        [
                            produk_id,
                            ownerId
                        ]
                    )
                ).rows[0]?.qty
            );

        if (
            stokProdukBaruSetelahPengembalian <
            qtyNumber
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                pesan:
                    `Stok ${produkBaru.nama} tidak mencukupi. ` +
                    `Stok tersedia: ${stokProdukBaruSetelahPengembalian}`
            });
        }

        // Kurangi stok produk baru
        await client.query(
            `UPDATE products
             SET qty = qty - $1
             WHERE id = $2
             AND user_id = $3`,
            [
                qtyNumber,
                produk_id,
                ownerId
            ]
        );

        const subtotal =
            Math.round(
                qtyNumber *
                hargaNumber
            );

        const result =
            await client.query(
                `UPDATE transaksi_detail
                 SET transaksi_id = $1,
                     produk_id = $2,
                     qty = $3,
                     harga = $4,
                     harga_modal = $5,
                     subtotal = $6
                 WHERE id = $7
                 RETURNING *`,
                [
                    transaksi_id,
                    produk_id,
                    qtyNumber,
                    hargaNumber,
                    hargaModalBaru,
                    subtotal,
                    id
                ]
            );

        await client.query("COMMIT");

        return res.status(200).json({
            pesan:
                "Detail transaksi berhasil diubah",
            data: result.rows[0]
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "ERROR UPDATE TRANSAKSI DETAIL:",
            error
        );

        return res.status(500).json({
            pesan:
                "Gagal mengubah detail transaksi"
        });
    } finally {
        client.release();
    }
};


// =========================
// DELETE /transaksi-detail/:id
// =========================

const deleteTransaksiDetail = async (req, res) => {
    const client = await pool.connect();

    try {
        const id = req.params.id;

        const ownerId =
            await getOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan:
                    "User belum memiliki owner"
            });
        }

        await client.query("BEGIN");

        // =========================
        // CEK DETAIL
        // =========================

        const detail =
            await client.query(
                `SELECT td.*
                 FROM transaksi_detail td
                 JOIN transaksi t
                     ON td.transaksi_id = t.id
                 WHERE td.id = $1
                 AND t.user_id = $2
                 FOR UPDATE`,
                [
                    id,
                    ownerId
                ]
            );

        if (detail.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                pesan:
                    "Detail transaksi tidak ditemukan"
            });
        }

        const dataDetail =
            detail.rows[0];

        // =========================
        // KEMBALIKAN STOK
        // =========================

        await client.query(
            `UPDATE products
             SET qty = qty + $1
             WHERE id = $2
             AND user_id = $3`,
            [
                dataDetail.qty,
                dataDetail.produk_id,
                ownerId
            ]
        );

        // =========================
        // HAPUS DETAIL
        // =========================

        const result =
            await client.query(
                `DELETE FROM transaksi_detail
                 WHERE id = $1
                 RETURNING *`,
                [id]
            );

        await client.query("COMMIT");

        return res.status(200).json({
            pesan:
                "Detail transaksi berhasil dihapus dan stok dikembalikan",
            data: result.rows[0]
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error(
            "ERROR DELETE TRANSAKSI DETAIL:",
            error
        );

        return res.status(500).json({
            pesan:
                "Gagal menghapus detail transaksi"
        });
    } finally {
        client.release();
    }
};


// =========================
// EXPORT
// =========================

module.exports = {
    createTransaksiDetail,
    getTransaksiDetail,
    getTransaksiDetailById,
    getDetailByTransaksiId,
    updateTransaksiDetail,
    deleteTransaksiDetail
};
