
const pool = require("../config/database");

const getProducts = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT 
                products.id,
                products.nama,
                products.qty,
                products.harga,
                products.id_kategori,
                kategori.nama AS nama_kategori,
                products.aktif
             FROM products
             JOIN kategori
                ON products.id_kategori = kategori.id
             WHERE products.aktif = true`
        );

        res.json({
            pesan: "Produk berhasil ditemukan",
            data: result.rows
        });

    } catch (error) {
        console.error("ERROR GET PRODUCTS:", error);

        res.status(500).json({
            pesan: "Terjadi kesalahan pada server"
        });
    }
};

const getProductById = async (req, res) => {

    const id = req.params.id;

    if (isNaN(id)) {
        return res.status(400).json({
            pesan: "ID harus berupa angka"
        });
    }

    const result = await pool.query(
        "SELECT * FROM products WHERE id = $1",
        [id]
    );

    if (result.rows.length === 0) {
        return res.status(400).json({
            pesan: "produk tidak ditemukan"
        });
    }

    res.json({
        pesan: "Produk berhasil ditemukan",
        data: result.rows[0]
    });

};

const deleteProduct = async (req, res) => {
    try {
        const id = req.params.id;

        if (isNaN(id)) {
            return res.status(400).json({
                pesan: "ID harus berupa angka"
            });
        }

        const result = await pool.query(
            `UPDATE products
             SET aktif = false
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Produk tidak ditemukan"
            });
        }

        res.json({
            pesan: "Produk berhasil dinonaktifkan",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("ERROR:", error);

        res.status(500).json({
            pesan: "Terjadi kesalahan pada server"
        });
    }
};

const createProduct = async (req, res) => {
  try {
    const { nama, qty, id_kategori } = req.body;

    console.log("MASUK CREATE PRODUK");
    console.log("DATA:", nama, qty, id_kategori);

    if (!nama || qty === undefined || id_kategori === undefined) {
      return res.status(400).json({
        pesan: "Data nama, qty, dan id_kategori wajib diisi"
      });
    }

    if (typeof nama !== "string") {
      return res.status(400).json ({
        pesan: "nama harus berupa teks"
      })
    }

    console.log("PANJANG NAMA:", nama.length);

    if (nama.trim() === "") {
      return res.status(400).json({
        pesan: "nama tidak boleh kosong"
      });
    }

    if (nama.length > 100) {
      return res.status(400).json({
        pesan: "nama maksimal 100 karakter"
      });
    }

    if (typeof qty !== "number" || typeof id_kategori !== "number") {
      return res.status(400).json({
        pesan: "qty dan id_kategore harus berupa angka"
      });
    }

    if (qty <= 0 || id_kategori <= 0) {
      return res.status(400).json({
        pesan: "qty dan id_kategori harus lebih dari 0"
      });
    }

    const result = await pool.query(
      "INSERT INTO products (nama, qty, id_kategori) VALUES ($1, $2, $3) RETURNING *",
      [nama, qty, id_kategori]
    );

    res.status(201).json({
      pesan: "Produk berhasil ditambahkan",
      data: result.rows[0]
    });

  } catch (error) {
    console.error("ERROR:", error);

    res.status(500).json({
      pesan: "Terjadi kesalahan pada server"
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const { nama, qty, id_kategori } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({
        pesan: "ID harus berupa angka"
      });
    }

    console.log("MASUK UPDATE PRODUK");
    console.log("ID:", id);
    console.log("DATA:", nama, qty, id_kategori);

    if (!nama || qty === undefined || id_kategori === undefined) {
      return res.status(400).json({
        pesan: "Data nama, qty, dan id_kategori wajib diisi"
      });
    }

    if (typeof nama !== "string") {
      return res.status(400).json({
        pesan: "nama harus berupa teks"
      });
    }

    if (nama.trim() === "") {
      return res.status(400).json({
        pesan: "nama tidak boleh kosong"
      });
    }

    if (nama.length > 100) {
      return res.status(400).json({
        pesan: "nama maksimal 100 karakter"
      });
    }

    if (typeof qty !== "number" || typeof id_kategori !== "number") {
      return res.status(400).json({
        pesan: "qty dan id_kategori harus berupa angka"
      });
    }

    if (qty <= 0 || id_kategori <= 0) {
      return res.status(400).json({
        pesan: "qty dan id_kategori harus lebih dari 0"
      });
    }

    const result = await pool.query(
      `UPDATE products
       SET nama = $1, qty = $2, id_kategori = $3
       WHERE id = $4
       RETURNING *`,
      [nama, qty, id_kategori, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        pesan: "Produk tidak ditemukan"
      });
    }

    res.json({
      pesan: "Produk berhasil diubah",
      data: result.rows[0]
    });

  } catch (error) {
    console.error("ERROR:", error);

    res.status(500).json({
      pesan: "Terjadi kesalahan pada server"
    });
  }
};

  
module.exports = { 
    getProducts, 
    getProductById,
    deleteProduct,
    createProduct,
    updateProduct

};
