const express = require("express");
const router = express.Router();

const {
    createTransaksi,
    getTransaksi,
    getTransaksiById,
    updateTransaksi,
    deleteTransaksi
} = require("../controllers/transaksiController");

router.post("/", createTransaksi);
router.get("/", getTransaksi);
router.get("/:id", getTransaksiById);
router.put("/:id", updateTransaksi);
router.delete("/:id", deleteTransaksi);

module.exports = router;