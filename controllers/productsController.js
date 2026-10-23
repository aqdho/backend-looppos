const pool = require("../config/database");

const { getPlanUsage } = require("../utils/planLimits");

// Semua operasi produk memakai ID owner,
// termasuk ketika pengguna yang login adalah kasir.
async function resolveOwnerId(userId) {
  const result = await pool.query(
    `SELECT id, role, owner_id
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) return null;

  const user = result.rows[0];
  return user.role === "owner" ? user.id : user.owner_id;
}

// =====================================================
// GET SEMUA PRODUK
// =====================================================
const getProducts = async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT id, role, owner_id
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        pesan: "User tidak ditemukan"
      });
    }

    const user = userResult.rows[0];

    const ownerId =
      user.role === "owner"
        ? user.id
        : user.owner_id;

    if (!ownerId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner"
      });
    }

    const result = await pool.query(
      `SELECT
          products.id,
          products.nama,
          products.qty,
          products.harga,
          products.harga_modal,
          products.id_kategori,
          products.gambar,
          kategori.nama AS nama_kategori,
          products.aktif
       FROM products
       JOIN kategori
         ON products.id_kategori = kategori.id
       WHERE products.aktif = true
         AND products.user_id = $1
         AND kategori.user_id = $1`,
      [ownerId]
    );

    return res.json({
      pesan: "Produk berhasil ditemukan",
      data: result.rows
    });
  } catch (error) {
    console.error("ERROR GET PRODUCTS:", error);

    return res.status(500).json({
      pesan: "Terjadi kesalahan pada server"
    });
  }
};

// =====================================================
// GET PRODUK BERDASARKAN ID
// =====================================================
const getProductById = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = await resolveOwnerId(req.user.id);

    if (!userId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner."
      });
    }

    if (isNaN(id)) {
      return res.status(400).json({
        pesan: "ID harus berupa angka"
      });
    }

    const result = await pool.query(
      `SELECT *
       FROM products
       WHERE id = $1
         AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        pesan: "Produk tidak ditemukan"
      });
    }

    return res.json({
      pesan: "Produk berhasil ditemukan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("ERROR GET PRODUCT BY ID:", error);

    return res.status(500).json({
      pesan: "Terjadi kesalahan pada server"
    });
  }
};

// =====================================================
// NONAKTIFKAN PRODUK
// =====================================================
const deleteProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = await resolveOwnerId(req.user.id);

    if (!userId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner."
      });
    }

    if (isNaN(id)) {
      return res.status(400).json({
        pesan: "ID harus berupa angka"
      });
    }

    const result = await pool.query(
      `UPDATE products
       SET aktif = false
       WHERE id = $1
         AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        pesan: "Produk tidak ditemukan"
      });
    }

    return res.json({
      pesan: "Produk berhasil dinonaktifkan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("ERROR DELETE PRODUCT:", error);

    return res.status(500).json({
      pesan: "Terjadi kesalahan pada server"
    });
  }
};

// =====================================================
// TAMBAH PRODUK
// =====================================================
const createProduct = async (req, res) => {
  try {
    console.log("BODY:", req.body);

    const userId = await resolveOwnerId(req.user.id);

    if (!userId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner."
      });
    }

    const usage = await getPlanUsage(pool, userId);

    if (usage.productCount >= usage.limits.products) { 
      return res.status(403).json({ 
        code: "PLAN_LIMIT_REACHED",
        pesan: `Paket ${usage.plan} sudah mencapai batas produk. Hapus atau nonaktifkan produk yang tidak digunakan, atau tingkatkan paket.`,
      });
    }

    const {
      nama,
      qty,
      harga,
      harga_modal,
      id_kategori
    } = req.body;

    const gambar = req.file
      ? `/produk/${req.file.filename}`
      : null;

    const hargaModalNumber = Number(harga_modal);

    console.log("MASUK CREATE PRODUK");
    console.log(
      "DATA:",
      nama,
      qty,
      harga,
      harga_modal,
      id_kategori
    );

    if (
      !nama ||
      qty === undefined ||
      harga === undefined ||
      harga_modal === undefined ||
      id_kategori === undefined
    ) {
      return res.status(400).json({
        pesan:
          "Data nama, qty, harga, harga_modal, dan id_kategori wajib diisi"
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

    if (
      typeof qty !== "number" ||
      typeof harga !== "number" ||
      typeof id_kategori !== "number" ||
      isNaN(hargaModalNumber)
    ) {
      return res.status(400).json({
        pesan:
          "qty, harga, harga_modal, dan id_kategori harus berupa angka"
      });
    }

    if (
      qty <= 0 ||
      harga <= 0 ||
      hargaModalNumber < 0 ||
      id_kategori <= 0
    ) {
      return res.status(400).json({
        pesan:
          "qty dan harga dan id_kategori harus lebih dari 0, sedangkan harga_modal tidak boleh kurang dari 0"
      });
    }

    // Kategori harus milik owner yang sama.
    const kategoriResult = await pool.query(
      `SELECT id
       FROM kategori
       WHERE id = $1
         AND user_id = $2`,
      [id_kategori, userId]
    );

    if (kategoriResult.rows.length === 0) {
      return res.status(403).json({
        pesan:
          "Kategori tidak ditemukan atau bukan milik user ini"
      });
    }

    const result = await pool.query(
      `INSERT INTO products
       (
         nama,
         qty,
         harga,
         harga_modal,
         id_kategori,
         gambar,
         user_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        nama,
        qty,
        harga,
        hargaModalNumber,
        id_kategori,
        gambar,
        userId
      ]
    );

    return res.status(201).json({
      pesan: "Produk berhasil ditambahkan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("ERROR CREATE PRODUCT:", error);

    return res.status(500).json({
      pesan: "Terjadi kesalahan pada server"
    });
  }
};

// =====================================================
// IMPORT PRODUK
// =====================================================
const importProducts = async (req, res) => {
  console.log("IMPORT PRODUCTS TERPANGGIL");

  let client;
  let transactionStarted = false;

  try {
    const userId = await resolveOwnerId(req.user.id);

    if (!userId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner."
      });
    }

    const usage = await getPlanUsage(pool, userId);
    const jumlahProdukBaru = Array.isArray(req.body.products)
      ? req.body.products.length
      : 0; 

    if (usage.productCount + jumlahProdukBaru > usage.limits.products) { 
      return res.status(403).json({ 
        code: "PLAN_LIMIT_REACHED",
        pesan: `Impor dibatalkan. Paket ${usage.plan} hanya mengizinkan ${usage.limits.products} produk.`,
      });
    }

    const { products } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        pesan: "Data produk untuk import tidak ditemukan"
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    for (const product of products) {
      const {
        nama,
        qty,
        harga,
        harga_modal,
        id_kategori
      } = product;

      const hargaModalNumber =
        harga_modal === undefined ||
        harga_modal === null ||
        harga_modal === ""
          ? 0
          : Number(harga_modal);

      if (
        !nama ||
        qty === undefined ||
        harga === undefined ||
        id_kategori === undefined
      ) {
        throw new Error(
          "Data nama, qty, harga, dan id_kategori wajib diisi"
        );
      }

      if (
        isNaN(hargaModalNumber) ||
        hargaModalNumber < 0
      ) {
        throw new Error(
          `harga_modal produk "${nama}" harus berupa angka dan tidak boleh kurang dari 0`
        );
      }

      const kategoriResult = await client.query(
        `SELECT id
         FROM kategori
         WHERE id = $1
           AND user_id = $2`,
        [id_kategori, userId]
      );

      if (kategoriResult.rows.length === 0) {
        throw new Error(
          `Kategori dengan ID ${id_kategori} tidak ditemukan`
        );
      }

      await client.query(
        `INSERT INTO products
         (
           nama,
           qty,
           harga,
           harga_modal,
           id_kategori,
           gambar,
           user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          nama,
          qty,
          harga,
          hargaModalNumber,
          id_kategori,
          null,
          userId
        ]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    console.log("IMPORT SELESAI, AKAN KIRIM RESPONSE");

    return res.status(201).json({
      pesan: "Produk berhasil diimport",
      jumlah: products.length
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "ERROR ROLLBACK IMPORT:",
          rollbackError
        );
      }
    }

    console.error("ERROR IMPORT PRODUCTS:", error);

    if (!res.headersSent) {
      return res.status(400).json({
        pesan:
          error.message ||
          "Gagal mengimport produk"
      });
    }
  } finally {
    if (client) {
      client.release();
    }
  }
};

// =====================================================
// UBAH PRODUK
// =====================================================
const updateProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = await resolveOwnerId(req.user.id);

    if (!userId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner."
      });
    }

    const {
      nama,
      qty,
      harga_modal,
      id_kategori
    } = req.body;

    const qtyNumber = Number(qty);
    const hargaModalNumber = Number(harga_modal);
    const idKategoriNumber = Number(id_kategori);

    if (isNaN(id)) {
      return res.status(400).json({
        pesan: "ID harus berupa angka"
      });
    }

    console.log("MASUK UPDATE PRODUK");
    console.log("ID:", id);
    console.log(
      "DATA:",
      nama,
      qty,
      harga_modal,
      id_kategori
    );
    console.log("FILE:", req.file);

    if (
      !nama ||
      qty === undefined ||
      harga_modal === undefined ||
      id_kategori === undefined
    ) {
      return res.status(400).json({
        pesan:
          "Data nama, qty, harga_modal, dan id_kategori wajib diisi"
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

    if (
      isNaN(qtyNumber) ||
      isNaN(hargaModalNumber) ||
      isNaN(idKategoriNumber)
    ) {
      return res.status(400).json({
        pesan:
          "qty, harga_modal, dan id_kategori harus berupa angka"
      });
    }

    if (
      qtyNumber <= 0 ||
      hargaModalNumber < 0 ||
      idKategoriNumber <= 0
    ) {
      return res.status(400).json({
        pesan:
          "qty dan id_kategori harus lebih dari 0, harga_modal tidak boleh kurang dari 0"
      });
    }

    // Kategori harus milik owner yang sama.
    const kategoriResult = await pool.query(
      `SELECT id
       FROM kategori
       WHERE id = $1
         AND user_id = $2`,
      [idKategoriNumber, userId]
    );

    if (kategoriResult.rows.length === 0) {
      return res.status(403).json({
        pesan:
          "Kategori tidak ditemukan atau bukan milik user ini"
      });
    }

    const gambar = req.file
      ? `/produk/${req.file.filename}`
      : null;

    const result = await pool.query(
      `UPDATE products
       SET
         nama = $1,
         qty = $2,
         harga_modal = $3,
         id_kategori = $4,
         gambar = COALESCE($5, gambar)
       WHERE id = $6
         AND user_id = $7
       RETURNING *`,
      [
        nama,
        qtyNumber,
        hargaModalNumber,
        idKategoriNumber,
        gambar,
        id,
        userId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        pesan: "Produk tidak ditemukan"
      });
    }

    return res.json({
      pesan: "Produk berhasil diubah",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("ERROR UPDATE PRODUCT:", error);

    return res.status(500).json({
      pesan: "Terjadi kesalahan pada server"
    });
  }
};

// =====================================================
// TAMBAH STOK
// =====================================================
const tambahStok = async (req, res) => {
  try {
    const id = req.params.id;
    const userId = await resolveOwnerId(req.user.id);

    if (!userId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner."
      });
    }

    const { jumlah } = req.body;

    if (!jumlah || jumlah <= 0) {
      return res.status(400).json({
        pesan: "Jumlah stok harus lebih dari 0"
      });
    }

    const result = await pool.query(
      `UPDATE products
       SET qty = qty + $1
       WHERE id = $2
         AND user_id = $3
       RETURNING *`,
      [jumlah, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        pesan: "Produk tidak ditemukan"
      });
    }

    return res.status(200).json({
      pesan: "Produk berhasil ditambahkan",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("ERROR TAMBAH STOK:", error);

    return res.status(500).json({
      pesan: "Gagal menambahkan stok"
    });
  }
};

// =====================================================
// EXPORT
// =====================================================
module.exports = {
  getProducts,
  getProductById,
  deleteProduct,
  createProduct,
  importProducts,
  updateProduct,
  tambahStok
};