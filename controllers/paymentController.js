const pool = require("../config/database");

// GET PAYMENT ACCOUNT OWNER
const getPaymentAccount = async (req, res) => {
    try {
        const ownerId =
            req.user.role === "owner"
                ? req.user.id
                : req.user.owner_id;

        if (!ownerId) {
            return res.status(403).json({
                pesan: "User belum memiliki owner"
            });
        }

        const result = await pool.query(
            `SELECT
                id,
                owner_id,
                provider,
                merchant_id,
                status,
                metadata,
                created_at,
                updated_at
             FROM payment_accounts
             WHERE owner_id = $1`,
            [ownerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                connected: false,
                data: null
            });
        }

        return res.json({
            connected: true,
            data: result.rows[0]
        });

    } catch (error) {
        console.error(
            "ERROR GET PAYMENT ACCOUNT:",
            error
        );

        return res.status(500).json({
            pesan: "Gagal mengambil payment account"
        });
    }
};


// CREATE / UPDATE PAYMENT ACCOUNT
const savePaymentAccount = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({
                pesan: "Akses hanya untuk owner"
            });
        }

        const ownerId = req.user.id;

        const {
            provider,
            merchant_id,
            status,
            metadata
        } = req.body;

        if (!provider) {
            return res.status(400).json({
                pesan: "Provider wajib diisi"
            });
        }

        const result = await pool.query(
            `INSERT INTO payment_accounts
                (
                    owner_id,
                    provider,
                    merchant_id,
                    status,
                    metadata,
                    updated_at
                )
             VALUES
                ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)

             ON CONFLICT (owner_id)
             DO UPDATE SET
                provider = EXCLUDED.provider,
                merchant_id = EXCLUDED.merchant_id,
                status = EXCLUDED.status,
                metadata = EXCLUDED.metadata,
                updated_at = CURRENT_TIMESTAMP

             RETURNING
                id,
                owner_id,
                provider,
                merchant_id,
                status,
                metadata,
                created_at,
                updated_at`,
            [
                ownerId,
                provider,
                merchant_id || null,
                status || "pending",
                metadata || {}
            ]
        );

        return res.status(200).json({
            pesan: "Payment account berhasil disimpan",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(
            "ERROR SAVE PAYMENT ACCOUNT:",
            error
        );

        return res.status(500).json({
            pesan: "Gagal menyimpan payment account"
        });
    }
};


// CREATE XENDIT XENPLATFORM ACCOUNT
const createXenditAccount = async (req, res) => {
    try {
        // Hanya Owner
        if (req.user.role !== "owner") {
            return res.status(403).json({
                pesan: "Akses hanya untuk owner"
            });
        }

        const ownerId = req.user.id;

        // Ambil data Owner langsung dari database
        const ownerResult = await pool.query(
            `SELECT
                id,
                username,
                email
             FROM users
             WHERE id = $1
               AND role = 'owner'
             LIMIT 1`,
            [ownerId]
        );

        if (ownerResult.rows.length === 0) {
            return res.status(404).json({
                pesan: "Data owner tidak ditemukan"
            });
        }

        const owner = ownerResult.rows[0];

        if (!owner.email) {
            return res.status(400).json({
                pesan: "Email owner wajib diisi"
            });
        }

        if (!owner.username) {
            return res.status(400).json({
                pesan: "Username owner wajib diisi"
            });
        }

        // Cek apakah Owner sudah mempunyai Xendit Account
        const existing = await pool.query(
            `SELECT
                id,
                owner_id,
                provider,
                merchant_id,
                status,
                metadata
             FROM payment_accounts
             WHERE owner_id = $1
             LIMIT 1`,
            [ownerId]
        );

        if (
            existing.rows.length > 0 &&
            existing.rows[0].provider === "xendit" &&
            existing.rows[0].merchant_id
        ) {
            return res.status(409).json({
                pesan: "Owner sudah memiliki akun Xendit",
                data: existing.rows[0]
            });
        }

        // Secret Key hanya dibaca dari .env
        const secretKey = process.env.XENDIT_SECRET_KEY;

        if (!secretKey) {
            return res.status(500).json({
                pesan: "XENDIT_SECRET_KEY belum dikonfigurasi"
            });
        }

        /*
         * Xendit Create Account v3
         *
         * Test Mode:
         * entity_type = CORPORATION
         * country_of_incorporation = ID
         *
         * Jangan menambahkan configuration dulu.
         */
        const response = await fetch(
            "https://api.xendit.co/v3/accounts",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Basic ${Buffer
                            .from(`${secretKey}:`)
                            .toString("base64")}`,

                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    name: owner.username,
                    email: owner.email,

                    identity: {
                        country_of_incorporation: "ID",
                        entity_type: "CORPORATION"
                    }
                })
            }
        );

        const account = await response.json();

        // Jangan simpan jika Xendit gagal membuat account
        if (!response.ok) {
            console.error(
                "XENDIT CREATE ACCOUNT ERROR:",
                account
            );

            return res.status(response.status).json({
                pesan: "Gagal membuat akun Xendit",
                xendit: {
                    error_code: account.error_code,
                    message: account.message
                }
            });
        }

        // Simpan Xendit Account ID ke database
        const result = await pool.query(
            `INSERT INTO payment_accounts
                (
                    owner_id,
                    provider,
                    merchant_id,
                    status,
                    metadata,
                    updated_at
                )
             VALUES
                ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)

             ON CONFLICT (owner_id)
             DO UPDATE SET
                provider = EXCLUDED.provider,
                merchant_id = EXCLUDED.merchant_id,
                status = EXCLUDED.status,
                metadata = EXCLUDED.metadata,
                updated_at = CURRENT_TIMESTAMP

             RETURNING
                id,
                owner_id,
                provider,
                merchant_id,
                status,
                metadata,
                created_at,
                updated_at`,
            [
                ownerId,
                "xendit",
                account.id,
                account.status || "pending",
                {
                    xendit_account_id: account.id,
                    xendit_email: account.email,
                    xendit_name: account.name
                }
            ]
        );

        return res.status(201).json({
            pesan: "Akun Xendit berhasil dibuat",
            data: result.rows[0]
        });

    } catch (error) {
        console.error(
            "ERROR CREATE XENDIT ACCOUNT:",
            error
        );

        return res.status(500).json({
            pesan: "Gagal membuat akun Xendit",
            error: error.message
        });
    }
};

const xenditWebhook = async (req, res) => {
    const client = await pool.connect();

    try {
        // ==========================================
        // 1. VERIFIKASI WEBHOOK XENDIT
        // ==========================================
        const callbackToken = req.headers["x-callback-token"];

        if (
            !callbackToken ||
            callbackToken !== process.env.XENDIT_WEBHOOK_TOKEN
        ) {
            return res.status(401).json({
                pesan: "Webhook tidak valid"
            });
        }

        const event = req.body;

        console.log("XENDIT WEBHOOK:", JSON.stringify(event, null, 2));

        // ==========================================
        // 2. AMBIL DATA EVENT
        // ==========================================
        const eventType = event?.event;
        const data = event?.data || {};

        const paymentRequestId = data.payment_request_id;
        const paymentId = data.payment_id;
        const referenceId = data.reference_id;
        const status = data.status;
        const requestAmount = Number(data.request_amount);

        // ==========================================
        // 3. EVENT PEMBAYARAN BERHASIL
        // ==========================================
        if (eventType === "payment.capture" && status === "SUCCEEDED") {
            if (!paymentRequestId && !referenceId) {
                return res.status(400).json({
                    pesan: "Data pembayaran tidak lengkap"
                });
            }

            await client.query("BEGIN");

            // Cari transaksi berdasarkan payment_request_id
            // atau reference_id
            const transaksiResult = await client.query(
                `
                SELECT
                    id,
                    total,
                    bayar,
                    user_id,
                    payment_status,
                    payment_method,
                    payment_id,
                    payment_reference
                FROM transaksi
                WHERE payment_method = 'qris'
                  AND (
                      payment_id = $1
                      OR payment_reference = $2
                      OR payment_reference = $3
                  )
                LIMIT 1
                FOR UPDATE
                `,
                [
                    paymentRequestId || "",
                    referenceId || "",
                    data.reference_id || ""
                ]
            );

            if (transaksiResult.rows.length === 0) {
                await client.query("ROLLBACK");

                console.error(
                    "Transaksi QRIS tidak ditemukan:",
                    paymentRequestId,
                    referenceId
                );

                return res.status(404).json({
                    pesan: "Transaksi tidak ditemukan"
                });
            }

            const transaksi = transaksiResult.rows[0];

            // ==========================================
            // 4. IDEMPOTENCY
            // ==========================================
            // Kalau webhook yang sama masuk lagi setelah
            // transaksi sudah paid, jangan kurangi stok lagi.
            if (transaksi.payment_status === "paid") {
                await client.query("COMMIT");

                return res.status(200).json({
                    pesan: "Transaksi sudah diproses"
                });
            }

            // ==========================================
            // 5. CEK NOMINAL
            // ==========================================
            if (
                !Number.isFinite(requestAmount) ||
                requestAmount !== Number(transaksi.total)
            ) {
                await client.query("ROLLBACK");

                console.error(
                    "Nominal pembayaran tidak cocok:",
                    {
                        xendit: requestAmount,
                        transaksi: transaksi.total,
                        transaksi_id: transaksi.id
                    }
                );

                return res.status(400).json({
                    pesan: "Nominal pembayaran tidak cocok"
                });
            }

            // ==========================================
            // 6. AMBIL DETAIL TRANSAKSI + LOCK PRODUK
            // ==========================================
            const detailResult = await client.query(
                `
                SELECT
                    td.produk_id,
                    td.qty,
                    td.harga,
                    p.nama,
                    p.qty AS stok
                FROM transaksi_detail td
                JOIN products p
                    ON p.id = td.produk_id
                WHERE td.transaksi_id = $1
                FOR UPDATE OF p
                `,
                [transaksi.id]
            );

            // ==========================================
            // 7. CEK DETAIL TRANSAKSI
            // ==========================================
            if (detailResult.rows.length === 0) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    pesan: "Detail transaksi tidak ditemukan"
                });
            }

            // ==========================================
            // 8. CEK STOK
            // ==========================================
            for (const item of detailResult.rows) {
                if (Number(item.stok) < Number(item.qty)) {
                    await client.query("ROLLBACK");

                    console.error(
                        `Stok tidak cukup untuk produk ${item.nama}`,
                        {
                            stok: item.stok,
                            dibutuhkan: item.qty,
                            transaksi_id: transaksi.id
                        }
                    );

                    return res.status(409).json({
                        pesan: `Stok produk ${item.nama} tidak mencukupi`
                    });
                }
            }

            // ==========================================
            // 9. KURANGI STOK
            // ==========================================
            for (const item of detailResult.rows) {
                await client.query(
                    `
                    UPDATE products
                    SET qty = qty - $1
                    WHERE id = $2
                    `,
                    [
                        item.qty,
                        item.produk_id
                    ]
                );
            }

            // ==========================================
            // 10. UPDATE TRANSAKSI MENJADI PAID
            // ==========================================
            await client.query(
                `
                UPDATE transaksi
                SET
                    bayar = total,
                    payment_status = 'paid',
                    payment_id = COALESCE($1, payment_id),
                    payment_reference = COALESCE($2, payment_reference)
                WHERE id = $3
                `,
                [
                    paymentRequestId || paymentId || null,
                    referenceId || null,
                    transaksi.id
                ]
            );

            await client.query("COMMIT");

            console.log(
                `Pembayaran QRIS berhasil: transaksi #${transaksi.id}`
            );

            return res.status(200).json({
                pesan: "Pembayaran berhasil diproses",
                transaksi_id: transaksi.id
            });
        }

        // ==========================================
        // 11. PEMBAYARAN GAGAL
        // ==========================================
        if (eventType === "payment.failure") {
            const transaksiResult = await client.query(
                `
                UPDATE transaksi
                SET payment_status = 'failed'
                WHERE payment_method = 'qris'
                  AND payment_status = 'pending'
                  AND (
                      payment_id = $1
                      OR payment_reference = $2
                  )
                RETURNING id
                `,
                [
                    paymentRequestId || "",
                    referenceId || ""
                ]
            );

            console.log(
                "Pembayaran QRIS gagal:",
                transaksiResult.rows
            );

            return res.status(200).json({
                pesan: "Pembayaran gagal diproses"
            });
        }

        // ==========================================
        // 12. EVENT LAIN
        // ==========================================
        return res.status(200).json({
            pesan: "Webhook diterima",
            event: eventType || null
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("XENDIT WEBHOOK ERROR:", error);

        return res.status(500).json({
            pesan: "Gagal memproses webhook"
        });

    } finally {
        client.release();
    }
};

module.exports = {
    getPaymentAccount,
    savePaymentAccount,
    createXenditAccount,
    xenditWebhook
};
