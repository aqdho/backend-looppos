const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
    createTransaksi,
    createPembayaran,
    createQrisPayment,
    simulateQrisPaid,
    getTransaksi,
    getTransaksiById,
    updateTransaksi,
    deleteTransaksi
} = require("../controllers/transaksiController");

router.post("/", authMiddleware, createTransaksi);

router.post(
    "/pembayaran",
    authMiddleware,
    createPembayaran
);

router.post(
    "/qris",
    authMiddleware,
    createQrisPayment
);

router.post(
    "/qris/:id/simulate-paid",
    authMiddleware,
    simulateQrisPaid
 );

router.get("/", authMiddleware, getTransaksi);

router.get("/:id", authMiddleware, getTransaksiById);

router.put("/:id", authMiddleware, updateTransaksi);

router.delete("/:id", authMiddleware, deleteTransaksi);

module.exports = router;