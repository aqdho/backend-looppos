const pool = require("../config/database");


const createTransaksi = async (req, res) => {
    try { 
        const { tanggal, total } = req.body;

        if (!tanggal || !total) {
            return res.status(400).json({
                pesan: "tanggal dan total wajib diisi"
            });
        }

        const result = await pool.query(
            `INSERT INTO transaksi
            (tanggal, total)
            VALUES ($1, $2)
            RETURNING *`,
            [tanggal, total]
        );

        res.status(200).json({
            pesan: "Transaksi berhasil ditambahkan",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal menambah transaksi"
        })
    }
};

const getTransaksi = async (req, res) => {
    try { 
        const result = await pool.query (
            `SELECT * FROM transaksi
            ORDER BY id ASC`
        );

        res.status(200).json({
            pesan: "Data transaksi berhasil ditemukan",
            data: result.rows
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal mengambil transaksi"
        })

    }
};

const getTransaksiById = async (req, res) => {
    try { 
        const id = req.params.id;

        const result = await pool.query(
            `SELECT * FROM transaksi
            WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan"
            });
        }

        res.status(200).json({
            pesan: "Transaksi berhasil ditemukan",
            data: result.rows[0]
        });


    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal mengambil transakasi"
        });
    }
};

const updateTransaksi = async (req, res) => {
    try { 
        const id = req.params.id;
        const { tanggal, total } = req.body;

        if (!tanggal || !total ) {
            return res.status(400).json({
                pesan: "tanggal dan total wajib diisi"
            });
        }

        const result = await pool.query(
            `UPDATE transaksi
            SET tanggal = $1,
                total = $2
            WHERE id = $3
            RETURNING *`,
            [tanggal, total, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan"
            });
        }

        res.status(200).json({
            pesan: "Transaksi berhasil berhasil diubah",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal mengubah transaksi"
        });
    }
};

const deleteTransaksi = async (req, res) => {
    try { 
        const id = req.params.id;

        const result = await pool.query(
            `DELETE FROM transaksi
             WHERE id = $1
             RETURNING *`,
            [id]

        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan"
            });
        }

        res.status(200).json({
            pesan: "Transaksi berhasil dihapus",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            pesan: "Gagal menghapus transaksi"
        });
    }
};

module.exports = {
    createTransaksi,
    getTransaksi,
    getTransaksiById,
    updateTransaksi,
    deleteTransaksi
};

