const pool = require("../config/database");
const { recordStockMovement } = require("../utils/stockMovements");

// Batas kolom PostgreSQL.
const MAX_NUMERIC_12_2 = 9999999999.99;
const MAX_PG_INTEGER = 2147483647;

// =====================================================
// HELPER VALIDASI NOMINAL
// =====================================================

function validNominalInteger(value) {
    return (
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= MAX_PG_INTEGER
    );
}

function validNumeric12_2(value) {
    return (
        Number.isFinite(value) &&
        value >= 0 &&
        value <= MAX_NUMERIC_12_2
    );
}

function resolveOwnerIdFromUser(user) {
    return user.role === "owner" ? user.id : user.owner_id;
}

async function resolveTransaksiOwnerId(userId) {
    const result = await pool.query(
        `SELECT id, role, owner_id
         FROM users
         WHERE id = $1`,
        [userId]
    );

    if (result.rows.length === 0) return null;

    return resolveOwnerIdFromUser(result.rows[0]);
}

// =====================================================
// HELPER NOTIFIKASI TRANSAKSI
// =====================================================

async function buatNotifikasiTransaksi(
    client,
    {
        ownerId,
        transaksi,
        paymentMethod,
        paymentStatus = "paid"
    }
) {
    const detailProduk = await client.query(
        `SELECT
            p.nama,
            SUM(td.qty)::int AS qty,
            MIN(td.id) AS urutan
         FROM transaksi_detail td
         JOIN products p ON p.id = td.produk_id
         WHERE td.transaksi_id = $1
         GROUP BY p.id, p.nama
         ORDER BY MIN(td.id) ASC`,
        [transaksi.id]
    );

    const daftarProduk = detailProduk.rows;

    const judulNotifikasi =
        daftarProduk.length === 0
            ? `Transaksi #${transaksi.id}`
            : daftarProduk.length === 1
                ? daftarProduk[0].nama
                : `${daftarProduk[0].nama} + ${daftarProduk.length - 1} produk lainnya`;

    await client.query(
        `INSERT INTO notifikasi (
            owner_id,
            tipe,
            judul,
            pesan,
            status,
            href,
            event_key,
            metadata
        )
        VALUES (
            $1, 'transaksi', $2, $3, 'unread',
            '/laporan', $4, $5::jsonb
        )
        ON CONFLICT (owner_id, event_key)
        WHERE event_key IS NOT NULL
        DO NOTHING`,
        [
            ownerId,
            judulNotifikasi,
            `Total Rp ${Number(
                transaksi.total || 0
            ).toLocaleString("id-ID")} · ${
                paymentMethod === "qris" ? "QRIS" : "Cash"
            }`,
            `transaksi:${transaksi.id}`,
            JSON.stringify({
                transaksiId: transaksi.id,
                paymentMethod,
                paymentStatus,
                produk: daftarProduk
            })
        ]
    );
}

// =====================================================
// HELPER ROLLBACK
// =====================================================

async function rollbackJikaPerlu(client, transactionStarted) {
    if (!transactionStarted) return;

    try {
        await client.query("ROLLBACK");
    } catch (error) {
        console.error("ROLLBACK TRANSAKSI GAGAL:", error.message);
    }
}

// =====================================================
// CREATE TRANSAKSI LAMA
// =====================================================

const createTransaksi = async (req, res) => {
    try {
        const { tanggal, total } = req.body;

        if (!tanggal || total === undefined) {
            return res.status(400).json({
                pesan: "tanggal dan total wajib diisi"
            });
        }

        const totalNumber = Number(total);

        if (!validNominalInteger(totalNumber)) {
            return res.status(400).json({
                pesan: "Total harus berupa bilangan bulat yang valid dan tidak melebihi batas database."
            });
        }

        const ownerId = await resolveTransaksiOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "Akun tidak memiliki akses ke data transaksi."
            });
        }

        const result = await pool.query(
            `INSERT INTO transaksi (tanggal, total, user_id)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [tanggal, totalNumber, ownerId]
        );

        return res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Gagal membuat transaksi:", error);

        return res.status(500).json({
            pesan: "Gagal membuat transaksi."
        });
    }
};

// =====================================================
// PEMBAYARAN TUNAI
// =====================================================

const createPembayaran = async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;
    let debugNominal = {};

    try {
        const {
            tanggal,
            total,
            bayar,
            mode_pesanan,
            items
        } = req.body;

        const userResult = await client.query(
            `SELECT id, role, owner_id
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                pesan: "User tidak ditemukan"
            });
        }

        const user = userResult.rows[0];
        const ownerId = resolveOwnerIdFromUser(user);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        if (
            !tanggal ||
            total === undefined ||
            bayar === undefined ||
            !Array.isArray(items) ||
            items.length === 0
        ) {
            return res.status(400).json({
                pesan: "Data pembayaran tidak lengkap"
            });
        }

        const totalNumber = Number(total);
        const bayarNumber = Number(bayar);

        debugNominal = {
            totalNumber,
            bayarNumber
        };

        if (!validNominalInteger(totalNumber)) {
            return res.status(400).json({
                pesan: "Total transaksi tidak valid atau melebihi batas kolom integer database."
            });
        }

        if (!validNumeric12_2(bayarNumber)) {
            return res.status(400).json({
                pesan: "Nominal bayar melebihi batas kolom database."
            });
        }

        if (bayarNumber < totalNumber) {
            return res.status(400).json({
                pesan: "Nominal bayar tidak mencukupi"
            });
        }

        await client.query("BEGIN");
        transactionStarted = true;

        const activeShiftResult = await client.query(
            `SELECT id
             FROM shifts
             WHERE owner_id = $1
               AND cashier_id = $2
               AND status = 'open'
             FOR UPDATE`,
            [ownerId, req.user.id]
        );

        if (activeShiftResult.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(409).json({
                pesan: "Buka shift kasir terlebih dahulu sebelum menerima pembayaran."
            });
        }

        const activeShiftId = activeShiftResult.rows[0].id;

        console.log("[DEBUG PEMBAYARAN]", {
            ...debugNominal,
            batasBayar: MAX_NUMERIC_12_2,
            batasTotal: MAX_PG_INTEGER
        });

       const transaksiResult = await client.query(
            `INSERT INTO transaksi (
                tanggal,
                total,
                user_id,
                shift_id,
                bayar,
                payment_status,
                payment_method,
                mode_pesanan,
                subtotal,
                pajak,
                service_charge
            )
            VALUES (
                CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta',
                $1, $2, $3, $4, 'paid', 'cash', $5, $1, 0, 0
            )
            RETURNING *`,
            [
                totalNumber,
                ownerId,
                activeShiftId,
                bayarNumber,
                mode_pesanan || "dine_in"
            ]
        );


        const transaksi = transaksiResult.rows[0];

        // Validasi, simpan detail, dan kurangi stok.
        for (const item of items) {
            const produkId = Number(
                item.produk_id ?? item.id ?? item.product_id
            );

            const qty = Number(item.qty);

            const harga = Number(
                item.harga ?? item.harga_jual ?? item.price
            );

            if (
                !Number.isInteger(produkId) ||
                produkId <= 0 ||
                !Number.isInteger(qty) ||
                qty <= 0 ||
                !validNominalInteger(harga)
            ) {
                throw new Error(
                    "Data item pembayaran tidak valid. Harga dan subtotal harus berada dalam batas database."
                );
            }

            const subtotalItem = qty * harga;

            if (!validNominalInteger(subtotalItem)) {
                throw new Error(
                    "Subtotal salah satu produk melebihi batas kolom integer database."
                );
            }

            const produkResult = await client.query(
                `SELECT id, nama, qty, harga_modal
                 FROM products
                 WHERE id = $1 AND user_id = $2
                 FOR UPDATE`,
                [produkId, ownerId]
            );

            if (produkResult.rows.length === 0) {
                throw new Error(
                    `Produk ID ${produkId} tidak ditemukan`
                );
            }

            const produk = produkResult.rows[0];

            if (Number(produk.qty) < qty) {
                throw new Error(
                    `Stok ${produk.nama} tidak mencukupi. ` +
                    `Stok tersedia: ${produk.qty}`
                );
            }

            const hargaModal = Math.max(
                0,
                Number(produk.harga_modal) || 0
            );

            if (!validNumeric12_2(hargaModal)) {
                throw new Error(
                    `Harga modal produk ${produk.nama} melebihi batas kolom database.`
                );
            }

            await client.query(
                `INSERT INTO transaksi_detail (
                    transaksi_id,
                    produk_id,
                    qty,
                    harga,
                    harga_modal,
                    subtotal
                )
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    transaksi.id,
                    produkId,
                    qty,
                    harga,
                    hargaModal,
                    subtotalItem
                ]
            );

            await client.query(
                `UPDATE products
                 SET qty = qty - $1
                 WHERE id = $2 AND user_id = $3`,
                [qty, produkId, ownerId]
            );

            await recordStockMovement(client, {
                ownerId,
                productId: produkId,
                userId: req.user.id,
                type: "stock_out",
                quantity: qty,
                stockBefore: Number(produk.qty),
                stockAfter: Number(produk.qty) - qty,
                sourceType: "transaksi",
                sourceId: String(transaksi.id),
                note: "Penjualan tunai"
            });
        }

        await buatNotifikasiTransaksi(client, {
            ownerId,
            transaksi,
            paymentMethod: "cash",
            paymentStatus: "paid"
        });

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            pesan: "Pembayaran berhasil",
            data: transaksi
        });
    } catch (error) {
        await rollbackJikaPerlu(client, transactionStarted);
        transactionStarted = false;

        console.error("ERROR PEMBAYARAN:", {
            message: error.message,
            code: error.code,
            detail: error.detail,
            table: error.table,
            column: error.column,
            ...debugNominal,
            stack: error.stack
        });

        return res.status(400).json({
            pesan:
                error.code === "22003"
                    ? "Nominal transaksi melebihi batas kolom database."
                    : error.message || "Pembayaran gagal"
        });
    } finally {
        client.release();
    }
};

// =====================================================
// CREATE QRIS — SIMULATOR
// Status awal pending; stok belum dikurangi
// =====================================================

const createQrisPayment = async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        if (process.env.QRIS_SIMULATOR !== "true") {
            return res.status(503).json({
                pesan: "QRIS simulator tidak aktif"
            });
        }

        const {
            tanggal,
            total,
            mode_pesanan,
            items
        } = req.body;

        const userResult = await client.query(
            `SELECT id, role, owner_id
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                pesan: "User tidak ditemukan"
            });
        }

        const user = userResult.rows[0];
        const ownerId = resolveOwnerIdFromUser(user);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        const totalNumber = Number(total);

        if (
            !tanggal ||
            !validNominalInteger(totalNumber) ||
            totalNumber <= 0 ||
            !Array.isArray(items) ||
            items.length === 0
        ) {
            return res.status(400).json({
                pesan: "Data transaksi QRIS tidak valid atau total melebihi batas database."
            });
        }

        await client.query("BEGIN");
        transactionStarted = true;

        let subtotal = 0;
        const detailItems = [];

        for (const item of items) {
            const produkId = Number(
                item.produk_id ?? item.id ?? item.product_id
            );

            const qty = Number(item.qty);

            if (
                !Number.isInteger(produkId) ||
                produkId <= 0 ||
                !Number.isInteger(qty) ||
                qty <= 0
            ) {
                throw new Error("Data item QRIS tidak valid");
            }

            const produkResult = await client.query(
                `SELECT id, nama, qty, harga, harga_modal
                 FROM products
                 WHERE id = $1 AND user_id = $2
                 FOR UPDATE`,
                [produkId, ownerId]
            );

            if (produkResult.rows.length === 0) {
                throw new Error(
                    `Produk ID ${produkId} tidak ditemukan`
                );
            }

            const produk = produkResult.rows[0];

            if (Number(produk.qty) < qty) {
                throw new Error(
                    `Stok ${produk.nama} tidak mencukupi`
                );
            }

            const harga = Number(
                item.harga ??
                item.harga_jual ??
                item.price ??
                produk.harga
            );

            if (!validNominalInteger(harga)) {
                throw new Error(
                    `Harga produk ${produk.nama} tidak valid atau melebihi batas database.`
                );
            }

            const hargaModal = Math.max(
                0,
                Number(produk.harga_modal) || 0
            );

            if (!validNumeric12_2(hargaModal)) {
                throw new Error(
                    `Harga modal produk ${produk.nama} melebihi batas kolom database.`
                );
            }

            const subtotalItem = qty * harga;

            if (!validNominalInteger(subtotalItem)) {
                throw new Error(
                    `Subtotal produk ${produk.nama} melebihi batas kolom integer database.`
                );
            }

            subtotal += subtotalItem;

            if (!validNominalInteger(subtotal)) {
                throw new Error(
                    "Subtotal transaksi melebihi batas kolom integer database."
                );
            }

            detailItems.push({
                produkId,
                qty,
                harga,
                hargaModal,
                subtotalItem
            });
        }

        const settingsResult = await client.query(
            `SELECT *
             FROM settings
             WHERE user_id = $1
             LIMIT 1`,
            [ownerId]
        );

        const settings = settingsResult.rows[0] || {};

        const pajakAktif =
            settings.pajak_aktif === true ||
            settings.pajak_aktif === "true";

        const serviceAktif =
            settings.service_aktif === true ||
            settings.service_aktif === "true";

        const pajakPersentase =
            Number(settings.pajak_persentase) || 0;

        const servicePersentase =
            Number(settings.service_persentase) || 0;

        const pajak =
            pajakAktif && pajakPersentase > 0
                ? Math.round(subtotal * pajakPersentase / 100)
                : 0;

        const serviceCharge =
            serviceAktif && servicePersentase > 0
                ? Math.round(subtotal * servicePersentase / 100)
                : 0;

        const calculatedTotal =
            subtotal + pajak + serviceCharge;

        if (
            !validNominalInteger(pajak) ||
            !validNominalInteger(serviceCharge) ||
            !validNominalInteger(calculatedTotal)
        ) {
            throw new Error(
                "Total, pajak, atau biaya layanan melebihi batas kolom integer database."
            );
        }

        if (Math.round(totalNumber) !== calculatedTotal) {
            throw new Error(
                `Total tidak sesuai. Frontend: ${Math.round(totalNumber)}, ` +
                `backend: ${calculatedTotal} ` +
                `(subtotal ${subtotal}, pajak ${pajak}, service ${serviceCharge}).`
            );
        }

        const activeShiftResult = await client.query(
            `SELECT id
             FROM shifts
             WHERE owner_id = $1
               AND cashier_id = $2
               AND status = 'open'
             FOR UPDATE`,
            [ownerId, req.user.id]
        );

        if (activeShiftResult.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(409).json({
                pesan: "Buka shift kasir terlebih dahulu sebelum menerima pembayaran."
            });
        }

        const activeShiftId = activeShiftResult.rows[0].id;

        const reference =
            `QRIS-SIM-${Date.now()}-${req.user.id}`;

       const transaksiResult = await client.query(
            `INSERT INTO transaksi (
                tanggal,
                total,
                user_id,
                shift_id,
                bayar,
                payment_status,
                payment_method,
                payment_reference,
                mode_pesanan,
                subtotal,
                pajak,
                service_charge
            )
            VALUES (
                $1, $2, $3, $4, 0, 'pending', 'qris',
                $5, $6, $7, $8, $9
            )
            RETURNING *`,
            [
                tanggal,
                calculatedTotal,
                ownerId,
                activeShiftId,
                reference,
                mode_pesanan || "dine_in",
                subtotal,
                pajak,
                serviceCharge
            ]
        );

        const transaksi = transaksiResult.rows[0];

        for (const item of detailItems) {
            await client.query(
                `INSERT INTO transaksi_detail (
                    transaksi_id,
                    produk_id,
                    qty,
                    harga,
                    harga_modal,
                    subtotal
                )
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    transaksi.id,
                    item.produkId,
                    item.qty,
                    item.harga,
                    item.hargaModal,
                    item.subtotalItem
                ]
            );
        }

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            pesan: "Transaksi QRIS berhasil dibuat",
            transaksiId: transaksi.id,
            total: transaksi.total,
            status: "pending",
            payment_method: "qris",
            payment_reference: reference,
            simulator: true,
            data: transaksi
        });
    } catch (error) {
        await rollbackJikaPerlu(client, transactionStarted);
        transactionStarted = false;

        console.error("ERROR CREATE QRIS:", {
            message: error.message,
            code: error.code,
            detail: error.detail,
            table: error.table,
            column: error.column,
            stack: error.stack
        });

        return res.status(400).json({
            pesan:
                error.code === "22003"
                    ? "Nominal transaksi QRIS melebihi batas kolom database."
                    : error.message || "Gagal membuat transaksi QRIS"
        });
    } finally {
        client.release();
    }
};

// =====================================================
// SIMULASI QRIS BERHASIL
// =====================================================

const simulateQrisPaid = async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        if (process.env.QRIS_SIMULATOR !== "true") {
            return res.status(403).json({
                pesan: "QRIS simulator tidak aktif"
            });
        }

        const userResult = await client.query(
            `SELECT id, role, owner_id
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                pesan: "User tidak ditemukan"
            });
        }

        const user = userResult.rows[0];
        const ownerId = resolveOwnerIdFromUser(user);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        await client.query("BEGIN");
        transactionStarted = true;

        const transaksiResult = await client.query(
            `SELECT *
             FROM transaksi
             WHERE id = $1
               AND user_id = $2
               AND payment_method = 'qris'
             FOR UPDATE`,
            [req.params.id, ownerId]
        );

        if (transaksiResult.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                pesan: "Transaksi QRIS tidak ditemukan"
            });
        }

        const transaksi = transaksiResult.rows[0];

        if (transaksi.payment_status === "paid") {
            await client.query("COMMIT");
            transactionStarted = false;

            return res.json({
                pesan: "Transaksi sudah dibayar",
                transaksiId: transaksi.id,
                status: "paid"
            });
        }

        if (transaksi.payment_status !== "pending") {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(409).json({
                pesan: "Transaksi bukan berstatus pending"
            });
        }

        const detailResult = await client.query(
            `SELECT produk_id, qty
             FROM transaksi_detail
             WHERE transaksi_id = $1
             ORDER BY id`,
            [transaksi.id]
        );

        if (detailResult.rows.length === 0) {
            throw new Error("Detail transaksi tidak ditemukan");
        }

        const lockedProducts = [];

        for (const item of detailResult.rows) {
            const produkResult = await client.query(
                `SELECT id, nama, qty
                 FROM products
                 WHERE id = $1 AND user_id = $2
                 FOR UPDATE`,
                [item.produk_id, ownerId]
            );

            if (produkResult.rows.length === 0) {
                throw new Error("Produk transaksi tidak ditemukan");
            }

            const produk = produkResult.rows[0];
            const qty = Number(item.qty);

            if (Number(produk.qty) < qty) {
                throw new Error(
                    `Stok ${produk.nama} tidak mencukupi`
                );
            }

            lockedProducts.push({
                id: produk.id,
                qty,
                stockBefore: Number(produk.qty)
            });
        }

        for (const item of lockedProducts) {
            await client.query(
                `UPDATE products
                SET qty = qty - $1
                WHERE id = $2 AND user_id = $3`,
                [item.qty, item.id, ownerId]
            );

            await recordStockMovement(client, {
                ownerId,
                productId: item.id,
                userId: req.user.id,
                type: "stock_out",
                quantity: item.qty,
                stockBefore: item.stockBefore,
                stockAfter: item.stockBefore - item.qty,
                sourceType: "transaksi",
                sourceId: String(transaksi.id),
                note: "Penjualan QRIS berhasil"
            });
        }

        await client.query(
            `UPDATE transaksi
             SET payment_status = 'paid',
                 bayar = total,
                 payment_id = $1
             WHERE id = $2`,
            [`SIM-QRIS-${transaksi.id}`, transaksi.id]
        );

        await buatNotifikasiTransaksi(client, {
            ownerId,
            transaksi,
            paymentMethod: "qris",
            paymentStatus: "paid"
        });

        await client.query("COMMIT");
        transactionStarted = false;

        return res.json({
            pesan: "Simulasi pembayaran QRIS berhasil",
            transaksiId: transaksi.id,
            status: "paid"
        });
    } catch (error) {
        await rollbackJikaPerlu(client, transactionStarted);
        transactionStarted = false;

        console.error("ERROR SIMULASI QRIS:", {
            message: error.message,
            code: error.code,
            detail: error.detail,
            table: error.table,
            column: error.column,
            stack: error.stack
        });

        return res.status(400).json({
            pesan: error.message || "Simulasi pembayaran gagal"
        });
    } finally {
        client.release();
    }
};

// =====================================================
// GET TRANSAKSI - DATA OWNER
// =====================================================

const getTransaksi = async (req, res) => {
    try {
        const userResult = await pool.query(
            `SELECT id, role, owner_id
             FROM users
             WHERE id = $1`,
            [req.user.id]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                pesan: "User tidak ditemukan"
            });
        }

        const user = userResult.rows[0];
        const ownerId = resolveOwnerIdFromUser(user);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        const result = await pool.query(
            `SELECT *
             FROM transaksi
             WHERE user_id = $1
             ORDER BY id ASC`,
            [ownerId]
        );

        return res.status(200).json({
            pesan: "Data transaksi berhasil ditemukan",
            data: result.rows
        });
    } catch (error) {
        console.error("ERROR GET TRANSAKSI:", error);

        return res.status(500).json({
            pesan: "Gagal mengambil transaksi"
        });
    }
};

// =====================================================
// GET TRANSAKSI BY ID
// =====================================================

const getTransaksiById = async (req, res) => {
    try {
        const ownerId = await resolveTransaksiOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "Akun tidak memiliki akses ke data transaksi."
            });
        }

        const result = await pool.query(
            `SELECT *
             FROM transaksi
             WHERE id = $1 AND user_id = $2`,
            [req.params.id, ownerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan."
            });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error("Gagal mengambil transaksi:", error);

        return res.status(500).json({
            pesan: "Gagal mengambil transaksi."
        });
    }
};

// =====================================================
// UPDATE TRANSAKSI
// =====================================================

const updateTransaksi = async (req, res) => {
    try {
        const { tanggal, total } = req.body;

        if (!tanggal || total === undefined) {
            return res.status(400).json({
                pesan: "tanggal dan total wajib diisi"
            });
        }

        const totalNumber = Number(total);

        if (!validNominalInteger(totalNumber)) {
            return res.status(400).json({
                pesan: "Total transaksi tidak valid atau melebihi batas database."
            });
        }

        const ownerId = await resolveTransaksiOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "Akun tidak memiliki akses ke data transaksi."
            });
        }

        const result = await pool.query(
            `UPDATE transaksi
             SET tanggal = $1, total = $2
             WHERE id = $3 AND user_id = $4
             RETURNING *`,
            [tanggal, totalNumber, req.params.id, ownerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan."
            });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error("Gagal memperbarui transaksi:", error);

        return res.status(500).json({
            pesan: "Gagal memperbarui transaksi."
        });
    }
};

// =====================================================
// DELETE TRANSAKSI
// =====================================================

const deleteTransaksi = async (req, res) => {
    try {
        const ownerId = await resolveTransaksiOwnerId(req.user.id);

        if (!ownerId) {
            return res.status(403).json({
                pesan: "Akun tidak memiliki akses ke data transaksi."
            });
        }

        const result = await pool.query(
            `DELETE FROM transaksi
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [req.params.id, ownerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "Transaksi tidak ditemukan."
            });
        }

        return res.json({
            pesan: "Transaksi berhasil dihapus."
        });
    } catch (error) {
        console.error("Gagal menghapus transaksi:", error);

        return res.status(500).json({
            pesan: "Gagal menghapus transaksi."
        });
    }
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
    createTransaksi,
    createPembayaran,
    createQrisPayment,
    simulateQrisPaid,
    getTransaksi,
    getTransaksiById,
    updateTransaksi,
    deleteTransaksi
};