
const pool = require("../config/database");

const getProducts = async (req, res) => {

    const result = await pool.query(
        "SELECT * FROM products"
    );

    res.json({
        pesan: "Produk berhasil ditemukan",
        data: result.rows
    });

};

const getProductById = async (req, res) => {

    const id = req.params.id;

    const result = await pool.query(
        "SELECT * FROM products WHERE id = $1",
        [id]
    );

    res.json({
        pesan: "Produk berhasil ditemukan",
        data: result.rows[0]
    });

};


const deleteProduct = async (req, res) => {

    const id = req.params.id;

    const result = await pool.query(
        "DELETE FROM products WHERE id = $1 RETURNING *",
        [id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({
            pesan: "Produk tidak ditemukan"
        });
    }

    res.json({
        pesan: "Produk berhasil dihapus",
        data: result.rows[0]
    });

};

const createProduct = async (req, res) => {
  try {
    const { nama, qty, satuan } = req.body;

    console.log("MASUK CREATE PRODUK");
    console.log("DATA:", nama, qty, satuan);

    if (!nama || qty === undefined || satuan === undefined) {
      return res.status(400).json({
        pesan: "Data nama, qty, dan satuan wajib diisi"
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

    if (typeof qty !== "number" || typeof satuan !== "number") {
      return res.status(400).json({
        pesan: "qty dan satuan harus berupa angka"
      });
    }

    if (qty <= 0 || satuan <= 0) {
      return res.status(400).json({
        pesan: "qty dan satuan harus lebih dari 0"
      });
    }

    const result = await pool.query(
      "INSERT INTO products (nama, qty, satuan) VALUES ($1, $2, $3) RETURNING *",
      [nama, qty, satuan]
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


const patchProduct = async (req, res) => {
  const id = req.params.id;
  const { nama, qty, satuan } = req.body;

  const result = await pool.query(
    `UPDATE products
     SET nama = COALESCE($1, nama),
         qty = COALESCE($2, qty),
         satuan = COALESCE($3, satuan)
     WHERE id = $4
     RETURNING *`,
    [nama, qty, satuan, id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      pesan: "Produk tidak ditemukan"
    });
  }

  res.json({
    pesan: "Produk berhasil diubah sebagian",
    data: result.rows[0]
  });
};


module.exports = { 
    getProducts, 
    getProductById,
    deleteProduct,
    createProduct,
    patchProduct

};
