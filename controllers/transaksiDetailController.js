const pool = require("../config/database");

// POST /transaksi-detail
const createTransaksiDetail = async (req, res) => {
    try {
        const { transaksi_id, produk_id, qty, harga } = req.body;

        if (!transaksi_id || !produk_id || !qty || !harga) {
            return res.status(400).json({
                pesan: "transaksi_id, produk_id, qty, dan harga wajib diisi"
            });
        }

        const subtotal = qty * harga;

        const result = await pool.query(
            `INSERT INTO transaksi_detail
            (transaksi_id, produk_id, qty, harga, subtotal)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [transaksi_id, produk_id, qty, harga, subtotal]
        );

        await pool.query(
            `UPDATE products
            SET qty = qty - $1
            WHERE id = $2`,
            [qty, produk_id]
        );

        res.status(201).json({
            pesan: "Detail transaksi berhasil ditambahkan",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal menambahkan detail transaksi"
        });
    }
};


// GET /transaksi-detail
const getTransaksiDetail = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM transaksi_detail
             ORDER BY id ASC`
        );

        res.status(200).json({
            pesan: "Data detail transaksi berhasil ditemukan",
            data: result.rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal mengambil data detail transaksi"
        });
    }
};

const getTransaksiDetailById = async (req, res) => {
    try {
        const id = req.params.id;

        const result = await pool.query(
            `SELECT * FROM transaksi_detail
             WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Detail transaksi tidak ditemukan"
            });
        }

        res.status(200).json({
            pesan: "Detail transaksi berhasil ditemukan",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal mengambil detail transaksi"
        });
    }
};

const updateTransaksiDetail = async (req, res) => {
    try {
        const id = req.params.id;
        const { transaksi_id, produk_id, qty, harga } = req.body;

        if (!transaksi_id || !produk_id || !qty || !harga) {
            return res.status(400).json({
                pesan: "transaksi_id, produk_id, qty, dan harga wajib diisi"
            });
        }

        const subtotal = qty * harga;

        const cekStok = await pool.query(
            `SELECT qty FROM products WHERE id = 1$`,
            [produk_id]
        );

        if (cekStok.rows.length === 0) {
            return res.status(404).json({
                pesan: "Produk tidak mencukupi"
            });
        }

        if (cekStok.rows[0].qty < qty) {
            return res.status(400).json({
                pesan: "Stok produk tidak mecukupi"
            });
        }

        const result = await pool.query(
            `UPDATE transaksi_detail
             SET transaksi_id = $1,
                 produk_id = $2,
                 qty = $3,
                 harga = $4,
                 subtotal = $5
             WHERE id = $6
             RETURNING *`,
            [transaksi_id, produk_id, qty, harga, subtotal, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Detail transaksi tidak ditemukan"
            });
        }

        res.status(200).json({
            pesan: "Detail transaksi berhasil diubah",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal mengubah detail transaksi"
        });
    }
};

const deleteTransaksiDetail = async (req, res) => {
    try {
        const id = req.params.id;

        const result = await pool.query(
            `DELETE FROM transaksi_detail
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Detail transaksi tidak ditemukan"
            });
        }

        res.status(200).json({
            pesan: "Detail transaksi berhasil dihapus",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal menghapus detail transaksi"
        });
    }
};

module.exports = {
    createTransaksiDetail,
    getTransaksiDetail,
    getTransaksiDetailById,
    updateTransaksiDetail,
    deleteTransaksiDetail
};