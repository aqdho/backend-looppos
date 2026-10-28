const pool = require("../config/database");

const { getPlanUsage } = require("../utils/planLimits");
const { recordStockMovement } = require("../utils/stockMovements");

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

// RIWAYAT PERGERAKAN STOK
const getStockMovements = async (req, res) => {
  try {
    const ownerId = await resolveOwnerId(req.user.id);

    if (!ownerId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner."
      });
    }

    const limitInput = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitInput)
      ? Math.min(Math.max(limitInput, 1), 100)
      : 50;

    const productId = req.query.productId
      ? Number.parseInt(req.query.productId, 10)
      : null;

    if (
      req.query.productId &&
      (!Number.isInteger(productId) || productId <= 0)
    ) {
      return res.status(400).json({
        pesan: "ID produk tidak valid."
      });
    }

    
    const result = await pool.query(
    `SELECT
        sm.id,
        sm.product_id,
        p.nama AS nama_produk,
        p.gambar AS gambar,
        sm.user_id,
        sm.movement_type,
        sm.quantity,
        sm.stock_before,
        sm.stock_after,
        sm.source_type,
        sm.source_id,
        sm.note,
        sm.created_at
    FROM stock_movements sm
    LEFT JOIN products p
      ON p.id = sm.product_id
      AND p.user_id = sm.owner_id
    WHERE sm.owner_id = $1
      AND ($2::BIGINT IS NULL OR sm.product_id = $2)
    ORDER BY sm.created_at DESC, sm.id DESC
    LIMIT $3`,
    [ownerId, productId, limit]
  );


    return res.status(200).json({
      pesan: "Riwayat pergerakan stok berhasil ditemukan.",
      data: result.rows
    });

  } catch (error) {
    console.error("ERROR RIWAYAT STOK:",error);

    return res.status(500).json({
      pesan:"Gagal mengambil riwayat pergerakan stok."
    });
  }
};

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

    let client;
    let transactionStarted = false;

    try {
      client = await pool.connect();
      await client.query("BEGIN");
      transactionStarted = true;

      const result = await client.query(
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

      const product = result.rows[0];

      await recordStockMovement(client, {
        ownerId: userId,
        productId: product.id,
        userId: req.user.id,
        type: "stock_in",
        quantity: Number(product.qty),
        stockBefore: 0,
        stockAfter: Number(product.qty),
        sourceType: "product_created",
        sourceId: String(product.id),
        note: "Stok awal produk baru"
      });

      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(201).json({
        pesan: "Produk berhasil ditambahkan",
        data: product
      });
    } catch (error) {
      if (client && transactionStarted) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("ERROR ROLLBACK CREATE PRODUCT:", rollbackError);
        }
      }

      console.error("ERROR CREATE PRODUCT:", error);

      return res.status(500).json({
        pesan: "Terjadi kesalahan pada server"
      });
    } finally {
      if (client) {
        client.release();
      }
    }

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

     const inserted = await client.query(
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
        RETURNING id, qty`,
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

      const importedProduct = inserted.rows[0];
      const importedQty = Number(importedProduct.qty);

      if (importedQty > 0) {
        await recordStockMovement(client, {
          ownerId: userId,
          productId: importedProduct.id,
          userId: req.user.id,
          type: "stock_in",
          quantity: importedQty,
          stockBefore: 0,
          stockAfter: importedQty,
          sourceType: "product_import",
          sourceId: String(importedProduct.id),
          note: "Stok awal dari impor produk"
        });
      }
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
  let client;
  let transactionStarted = false;

  try {
    const id = req.params.id;
    const actorId = req.user.id;
    const ownerId = await resolveOwnerId(actorId);

    if (!ownerId) {
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
      !Number.isFinite(qtyNumber) ||
      !Number.isFinite(hargaModalNumber) ||
      !Number.isFinite(idKategoriNumber)
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

    const gambar = req.file
      ? `/produk/${req.file.filename}`
      : null;

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    // Pastikan kategori dimiliki owner yang sama.
    const kategoriResult = await client.query(
      `SELECT id
       FROM kategori
       WHERE id = $1
         AND user_id = $2`,
      [idKategoriNumber, ownerId]
    );

    if (kategoriResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(403).json({
        pesan:
          "Kategori tidak ditemukan atau bukan milik user ini"
      });
    }

    // Kunci produk agar perubahan stok tidak saling menimpa.
    const produkLamaResult = await client.query(
      `SELECT id, qty
       FROM products
       WHERE id = $1
         AND user_id = $2
       FOR UPDATE`,
      [id, ownerId]
    );

    if (produkLamaResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        pesan: "Produk tidak ditemukan"
      });
    }

    const produkLama = produkLamaResult.rows[0];
    const stokSebelum = Number(produkLama.qty);

    const result = await client.query(
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
        ownerId
      ]
    );

    const selisihStok = qtyNumber - stokSebelum;

    // Catat riwayat hanya jika jumlah stok berubah.
    if (selisihStok !== 0) {
      await recordStockMovement(client, {
        ownerId,
        productId: id,
        userId: actorId,
        type: selisihStok > 0 ? "stock_in" : "stock_out",
        quantity: Math.abs(selisihStok),
        stockBefore: stokSebelum,
        stockAfter: qtyNumber,
        sourceType: "product_update",
        sourceId: id,
        note: "Penyesuaian stok dari edit produk"
      });
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      pesan: "Produk berhasil diubah",
      data: result.rows[0]
    });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("ERROR UPDATE PRODUCT:", error);

    return res.status(500).json({
      pesan: "Terjadi kesalahan pada server"
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

// =====================================================
// TAMBAH STOK
// =====================================================
const tambahStok = async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const id = req.params.id;
    const ownerId = await resolveOwnerId(req.user.id);

    if (!ownerId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner."
      });
    }

    const jumlah = Number(req.body.jumlah);

    if (!Number.isFinite(jumlah) || jumlah <= 0) {
      return res.status(400).json({
        pesan: "Jumlah stok harus lebih dari 0"
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    const result = await client.query(
      `UPDATE products
       SET qty = qty + $1
       WHERE id = $2
         AND user_id = $3
       RETURNING *`,
      [jumlah, id, ownerId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        pesan: "Produk tidak ditemukan"
      });
    }

    const product = result.rows[0];
    const stockAfter = Number(product.qty);
    const stockBefore = stockAfter - jumlah;

    await recordStockMovement(client, {
      ownerId,
      productId: product.id,
      userId: req.user.id,
      type: "stock_in",
      quantity: jumlah,
      stockBefore,
      stockAfter,
      sourceType: "manual",
      sourceId: String(product.id),
      note: "Penambahan stok manual"
    });

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      pesan: "Produk berhasil ditambahkan",
      data: product
    });
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "ERROR ROLLBACK TAMBAH STOK:",
          rollbackError
        );
      }
    }

    console.error("ERROR TAMBAH STOK:", error);

    return res.status(500).json({
      pesan: "Gagal menambahkan stok"
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

// =====================================================
// STOK OPNAME
// =====================================================
const createStockOpname = async (req, res) => {
  let client;
  let transactionStarted = false;

  try {
    const actorId = req.user.id;
    const ownerId = await resolveOwnerId(actorId);
    const { items, note = null } = req.body;

    if (!ownerId) {
      return res.status(403).json({
        pesan: "User belum memiliki owner."
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        pesan: "Daftar produk opname wajib diisi."
      });
    }

    const productIds = [];
    const seenIds = new Set();

    for (const item of items) {
  if (
    !item ||
    typeof item !== "object" ||
    Array.isArray(item)
  ) {
    return res.status(400).json({
      pesan: "Setiap item opname harus berupa objek produk yang valid."
    });
  }

  const productId = Number(item.product_id);
  const stockPhysical = Number(item.stock_physical);

  // Lanjutkan validasi yang sudah ada di bawahnya.

      if (
        !Number.isSafeInteger(productId) ||
        productId <= 0 ||
        !Number.isSafeInteger(stockPhysical) ||
        stockPhysical < 0
      ) {
        return res.status(400).json({
          pesan: "ID produk harus valid dan stok fisik harus bilangan bulat minimal 0."
        });
      }

      if (seenIds.has(productId)) {
        return res.status(400).json({
          pesan: "Produk yang sama tidak boleh dimasukkan dua kali."
        });
      }

      seenIds.add(productId);
      productIds.push({
        productId,
        stockPhysical
      });
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    const ids = productIds.map(item => item.productId);

    const productsResult = await client.query(
      `SELECT id, nama, qty
       FROM products
       WHERE id = ANY($1::bigint[])
         AND user_id = $2
         AND aktif = true
       ORDER BY id
       FOR UPDATE`,
      [ids, ownerId]
    );

    if (productsResult.rows.length !== productIds.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(400).json({
        pesan: "Sebagian produk tidak ditemukan atau bukan milik owner ini."
      });
    }

    const physicalById = new Map(
      productIds.map(item => [
        item.productId,
        item.stockPhysical
      ])
    );

    const opnameResult = await client.query(
      `INSERT INTO stock_opnames (
        owner_id,
        user_id,
        total_items,
        total_adjustments,
        note
      )
      VALUES ($1, $2, $3, 0, $4)
      RETURNING id, created_at`,
      [
        ownerId,
        actorId,
        productIds.length,
        typeof note === "string" ? note.trim() || null : null
      ]
    );

    const opname = opnameResult.rows[0];
    let totalAdjustments = 0;
    const details = [];

    for (const product of productsResult.rows) {
      const productId = Number(product.id);
      const stockBefore = Number(product.qty);
      const stockPhysical = physicalById.get(productId);
      const difference = stockPhysical - stockBefore;

      await client.query(
        `INSERT INTO stock_opname_details (
          opname_id,
          product_id,
          product_name,
          stock_system,
          stock_physical,
          difference
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          opname.id,
          product.id,
          product.nama,
          stockBefore,
          stockPhysical,
          difference
        ]
      );

      if (difference !== 0) {
        await client.query(
          `UPDATE products
           SET qty = $1
           WHERE id = $2
             AND user_id = $3`,
          [stockPhysical, product.id, ownerId]
        );

        await recordStockMovement(client, {
          ownerId,
          productId: product.id,
          userId: actorId,
          type: difference > 0 ? "stock_in" : "stock_out",
          quantity: Math.abs(difference),
          stockBefore,
          stockAfter: stockPhysical,
          sourceType: "stock_opname",
          sourceId: opname.id,
          note: `Penyesuaian dari stok opname #${opname.id}`
        });

        totalAdjustments++;
      }

      details.push({
        product_id: product.id,
        product_name: product.nama,
        stock_system: stockBefore,
        stock_physical: stockPhysical,
        difference
      });
    }

    await client.query(
      `UPDATE stock_opnames
       SET total_adjustments = $1
       WHERE id = $2`,
      [totalAdjustments, opname.id]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      pesan: "Stok opname berhasil disimpan.",
      data: {
        id: opname.id,
        created_at: opname.created_at,
        total_items: details.length,
        total_adjustments: totalAdjustments,
        details
      }
    });
  } catch (error) {
    if (client && transactionStarted) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("ERROR CREATE STOCK OPNAME:", error);

    return res.status(500).json({
      pesan: "Gagal menyimpan stok opname."
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

// RIWAYAT STOK OPNAME 
const getStockOpnames = async (req, res) => { 
  try { 
    const actorId = req.user.id; 
    const ownerId = await resolveOwnerId(actorId);

    if (!ownerId) { 
      return res.status(403).json({ 
        pesan: "User belum memiliki owner.", 
      });
    }

    const result = await pool.query(
      `SELECT
        so.id,
        so.owner_id,
        so.user_id,
        so.total_items,
        so.total_adjustments,
        so.note,
        so.created_at,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'product_id', sod.product_id,
                'product_name', sod.product_name,
                'stock_system', sod.stock_system,
                'stock_physical', sod.stock_physical,
                'difference', sod.difference
              )
              ORDER BY sod.id
            )
            FROM stock_opname_details sod
            WHERE sod.opname_id = so.id
          ),
          '[]'::json
        ) AS details
      FROM stock_opnames so
      WHERE so.owner_id = $1
      ORDER BY so.created_at DESC, so.id DESC
      LIMIT 100`,
      [ownerId]
    );

    return res.status(200).json({ 
      pesan: "Riwayat stok opname berhasil diambil.",
      data: result.rows, 
    });
  } catch (error) { 
    console.error("ERROR GET STOCK OPNAME:", error);

    return res.status(500).json({ 
      pesan: "Gagal mengambil riwayat stock opname.",
    })
  }
}

// =====================================================
// EXPORT
// =====================================================
module.exports = {
  getStockMovements,
  getStockOpnames,
  getProducts,
  getProductById,
  deleteProduct,
  createProduct,
  importProducts,
  updateProduct,
  tambahStok,
  createStockOpname
};