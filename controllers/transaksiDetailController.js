const pool = require("../config/database");
const { recordStockMovement } = require("../utils/stockMovements");

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

    return Number.isFinite(number) ? number : 0;
};

// =========================
// POST /transaksi-detail
// =========================

const createTransaksiDetail = async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const { transaksi_id, produk_id, qty, harga } = req.body;
        const ownerId = await getOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        if (
            !transaksi_id ||
            !produk_id ||
            qty === undefined ||
            qty === null ||
            harga === undefined ||
            harga === null
        ) {
            return res.status(400).json({
                pesan: "transaksi_id, produk_id, qty, dan harga wajib diisi"
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
        transactionStarted = true;

        // Cek transaksi milik owner
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
            transactionStarted = false;

            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan"
            });
        }

        // Ambil dan kunci produk
        const cekProduk = await client.query(
            `SELECT id, nama, qty, harga_modal
             FROM products
             WHERE id = $1
               AND user_id = $2
             FOR UPDATE`,
            [produk_id, ownerId]
        );

        if (cekProduk.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                pesan: "Produk tidak ditemukan"
            });
        }

        const produk = cekProduk.rows[0];
        const stockBefore = toNumber(produk.qty);
        const hargaModal = Math.max(0, toNumber(produk.harga_modal));

        if (stockBefore < qtyNumber) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(400).json({
                pesan:
                    `Stok ${produk.nama} tidak mencukupi. ` +
                    `Stok tersedia: ${stockBefore}`
            });
        }

        const subtotal = Math.round(qtyNumber * hargaNumber);

        // Simpan detail transaksi
        const result = await client.query(
            `INSERT INTO transaksi_detail
                (transaksi_id, produk_id, qty, harga, harga_modal, subtotal)
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

        // Kurangi stok terlebih dahulu
        const updateStok = await client.query(
            `UPDATE products
             SET qty = qty - $1
             WHERE id = $2
               AND user_id = $3
             RETURNING qty`,
            [qtyNumber, produk_id, ownerId]
        );

        if (updateStok.rows.length === 0) {
            throw new Error("Produk tidak ditemukan saat mengurangi stok");
        }

        const stockAfter = toNumber(updateStok.rows[0].qty);

        // Catat pergerakan stok dalam transaksi yang sama
        await recordStockMovement(client, {
            ownerId,
            productId: produk_id,
            userId: req.user.id,
            type: "stock_out",
            quantity: qtyNumber,
            stockBefore,
            stockAfter,
            sourceType: "transaksi_detail",
            sourceId: String(result.rows[0].id),
            note: `Detail penjualan transaksi #${transaksi_id}`
        });

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            pesan: "Detail transaksi berhasil ditambahkan",
            data: result.rows[0]
        });
    } catch (error) {
        if (transactionStarted) {
            await client.query("ROLLBACK").catch(() => {});
        }

        console.error("ERROR CREATE TRANSAKSI DETAIL:", error);

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
             JOIN transaksi t ON td.transaksi_id = t.id
             WHERE t.user_id = $1
             ORDER BY td.id ASC`,
            [ownerId]
        );

        return res.status(200).json({
            pesan: "Data detail transaksi berhasil ditemukan",
            data: result.rows
        });
    } catch (error) {
        console.error("ERROR GET TRANSAKSI DETAIL:", error);

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
             JOIN transaksi t ON td.transaksi_id = t.id
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
        console.error("ERROR GET TRANSAKSI DETAIL BY ID:", error);

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
        const transaksiId = req.params.transaksiId;
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
                products.nama,
                products.gambar,
                td.qty,
                td.harga,
                td.harga_modal,
                td.subtotal
             FROM transaksi_detail td
             JOIN transaksi ON td.transaksi_id = transaksi.id
             JOIN products ON td.produk_id = products.id
             WHERE td.transaksi_id = $1
               AND transaksi.user_id = $2
               AND products.user_id = $2
             ORDER BY td.id ASC`,
            [transaksiId, ownerId]
        );

        return res.status(200).json({
            pesan: "Detail transaksi berhasil ditemukan",
            data: result.rows
        });
    } catch (error) {
        console.error("ERROR GET DETAIL TRANSAKSI:", error);

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
    let transactionStarted = false;

    try {
        const id = req.params.id;
        const { transaksi_id, produk_id, qty, harga } = req.body;
        const ownerId = await getOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        if (
            !transaksi_id ||
            !produk_id ||
            qty === undefined ||
            qty === null ||
            harga === undefined ||
            harga === null
        ) {
            return res.status(400).json({
                pesan: "transaksi_id, produk_id, qty, dan harga wajib diisi"
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
        transactionStarted = true;

        // Ambil dan kunci detail lama
        const detailLama = await client.query(
            `SELECT td.*
             FROM transaksi_detail td
             JOIN transaksi t ON td.transaksi_id = t.id
             WHERE td.id = $1
               AND t.user_id = $2
             FOR UPDATE OF td`,
            [id, ownerId]
        );

        if (detailLama.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                pesan: "Detail transaksi tidak ditemukan"
            });
        }

        const dataLama = detailLama.rows[0];

        // Pastikan transaksi tujuan milik owner
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
            transactionStarted = false;

            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan"
            });
        }

        // Ambil dan kunci produk tujuan
        const cekProdukBaru = await client.query(
            `SELECT id, nama, qty, harga_modal
             FROM products
             WHERE id = $1
               AND user_id = $2
             FOR UPDATE`,
            [produk_id, ownerId]
        );

        if (cekProdukBaru.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                pesan: "Produk tidak ditemukan"
            });
        }

        const produkBaru = cekProdukBaru.rows[0];
        const hargaModalBaru = Math.max(
            0,
            toNumber(produkBaru.harga_modal)
        );

        const produkBerubah =
            Number(dataLama.produk_id) !== Number(produk_id);

        const subtotal = Math.round(qtyNumber * hargaNumber);

        // ---------------------------------
        // PRODUK TIDAK BERUBAH
        // ---------------------------------

        if (!produkBerubah) {
            const selisihQty = qtyNumber - toNumber(dataLama.qty);

            const stokSaatIni = toNumber(produkBaru.qty);

            if (selisihQty > 0 && stokSaatIni < selisihQty) {
                await client.query("ROLLBACK");
                transactionStarted = false;

                return res.status(400).json({
                    pesan:
                        `Stok ${produkBaru.nama} tidak mencukupi. ` +
                        `Stok tersedia: ${stokSaatIni}`
                });
            }

            const result = await client.query(
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

            // Hanya catat pergerakan jika qty benar-benar berubah
            if (selisihQty !== 0) {
                const updateStok = await client.query(
                    `UPDATE products
                     SET qty = qty - $1
                     WHERE id = $2
                       AND user_id = $3
                     RETURNING qty`,
                    [selisihQty, produk_id, ownerId]
                );

                if (updateStok.rows.length === 0) {
                    throw new Error(
                        "Produk tidak ditemukan saat menyesuaikan stok"
                    );
                }

                const stockAfter = toNumber(updateStok.rows[0].qty);
                const stockBefore = stockAfter + selisihQty;

                await recordStockMovement(client, {
                    ownerId,
                    productId: produk_id,
                    userId: req.user.id,
                    type: selisihQty > 0 ? "stock_out" : "stock_in",
                    quantity: Math.abs(selisihQty),
                    stockBefore,
                    stockAfter,
                    sourceType: "transaksi_detail",
                    sourceId: String(id),
                    note: `Penyesuaian detail transaksi #${transaksi_id}`
                });
            }

            await client.query("COMMIT");
            transactionStarted = false;

            return res.status(200).json({
                pesan: "Detail transaksi berhasil diubah",
                data: result.rows[0]
            });
        }

        // ---------------------------------
        // PRODUK BERUBAH: KEMBALIKAN STOK LAMA
        // ---------------------------------

        const qtyLama = toNumber(dataLama.qty);

        const kembalikanStok = await client.query(
            `UPDATE products
             SET qty = qty + $1
             WHERE id = $2
               AND user_id = $3
             RETURNING qty`,
            [qtyLama, dataLama.produk_id, ownerId]
        );

        if (kembalikanStok.rows.length === 0) {
            throw new Error("Produk lama tidak ditemukan saat mengembalikan stok");
        }

        const oldStockAfter = toNumber(kembalikanStok.rows[0].qty);
        const oldStockBefore = oldStockAfter - qtyLama;

        await recordStockMovement(client, {
            ownerId,
            productId: dataLama.produk_id,
            userId: req.user.id,
            type: "stock_in",
            quantity: qtyLama,
            stockBefore: oldStockBefore,
            stockAfter: oldStockAfter,
            sourceType: "transaksi_detail",
            sourceId: String(id),
            note: `Pengembalian stok dari perubahan detail transaksi #${transaksi_id}`
        });

        // Cek stok produk baru setelah stok lama dikembalikan
        const cekStokBaru = await client.query(
            `SELECT qty
             FROM products
             WHERE id = $1
               AND user_id = $2
             FOR UPDATE`,
            [produk_id, ownerId]
        );

        if (cekStokBaru.rows.length === 0) {
            throw new Error("Produk baru tidak ditemukan saat mengecek stok");
        }

        const stokProdukBaru = toNumber(cekStokBaru.rows[0].qty);

        if (stokProdukBaru < qtyNumber) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(400).json({
                pesan:
                    `Stok ${produkBaru.nama} tidak mencukupi. ` +
                    `Stok tersedia: ${stokProdukBaru}`
            });
        }

        // Kurangi stok produk baru
        const kurangiStokBaru = await client.query(
            `UPDATE products
             SET qty = qty - $1
             WHERE id = $2
               AND user_id = $3
             RETURNING qty`,
            [qtyNumber, produk_id, ownerId]
        );

        if (kurangiStokBaru.rows.length === 0) {
            throw new Error("Produk baru tidak ditemukan saat mengurangi stok");
        }

        const newStockAfter = toNumber(kurangiStokBaru.rows[0].qty);
        const newStockBefore = newStockAfter + qtyNumber;

        await recordStockMovement(client, {
            ownerId,
            productId: produk_id,
            userId: req.user.id,
            type: "stock_out",
            quantity: qtyNumber,
            stockBefore: newStockBefore,
            stockAfter: newStockAfter,
            sourceType: "transaksi_detail",
            sourceId: String(id),
            note: `Penjualan produk pengganti pada transaksi #${transaksi_id}`
        });

        const result = await client.query(
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
        transactionStarted = false;

        return res.status(200).json({
            pesan: "Detail transaksi berhasil diubah",
            data: result.rows[0]
        });
    } catch (error) {
        if (transactionStarted) {
            await client.query("ROLLBACK").catch(() => {});
        }

        console.error("ERROR UPDATE TRANSAKSI DETAIL:", error);

        return res.status(500).json({
            pesan: "Gagal mengubah detail transaksi"
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
    let transactionStarted = false;

    try {
        const id = req.params.id;
        const ownerId = await getOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        await client.query("BEGIN");
        transactionStarted = true;

        // Ambil dan kunci detail transaksi
        const detail = await client.query(
            `SELECT td.*
             FROM transaksi_detail td
             JOIN transaksi t ON td.transaksi_id = t.id
             WHERE td.id = $1
               AND t.user_id = $2
             FOR UPDATE OF td`,
            [id, ownerId]
        );

        if (detail.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                pesan: "Detail transaksi tidak ditemukan"
            });
        }

        const dataDetail = detail.rows[0];
        const qtyDikembalikan = toNumber(dataDetail.qty);

        // Kembalikan stok dan ambil jumlah stok aktual
        const updateStok = await client.query(
            `UPDATE products
             SET qty = qty + $1
             WHERE id = $2
               AND user_id = $3
             RETURNING qty`,
            [
                qtyDikembalikan,
                dataDetail.produk_id,
                ownerId
            ]
        );

        if (updateStok.rows.length === 0) {
            throw new Error("Produk tidak ditemukan saat mengembalikan stok");
        }

        const stockAfter = toNumber(updateStok.rows[0].qty);
        const stockBefore = stockAfter - qtyDikembalikan;

        // Catat pengembalian stok
        await recordStockMovement(client, {
            ownerId,
            productId: dataDetail.produk_id,
            userId: req.user.id,
            type: "stock_in",
            quantity: qtyDikembalikan,
            stockBefore,
            stockAfter,
            sourceType: "transaksi_detail",
            sourceId: String(id),
            note: `Stok dikembalikan setelah detail transaksi #${id} dihapus`
        });

        // Hapus detail setelah stok dan riwayat berhasil diproses
        const result = await client.query(
            `DELETE FROM transaksi_detail
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(200).json({
            pesan: "Detail transaksi berhasil dihapus dan stok dikembalikan",
            data: result.rows[0]
        });
    } catch (error) {
        if (transactionStarted) {
            await client.query("ROLLBACK").catch(() => {});
        }

        console.error("ERROR DELETE TRANSAKSI DETAIL:", error);

        return res.status(500).json({
            pesan: "Gagal menghapus detail transaksi"
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