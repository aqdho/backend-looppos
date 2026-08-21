const express = require("express");

const router = express.Router();

const {
    createTransaksiDetail,
    getTransaksiDetail,
    getTransaksiDetailById,
    updateTransaksiDetail,
    deleteTransaksiDetail

} = require("../controllers/transaksiDetailController");

router.post("/", createTransaksiDetail);

router.get("/", getTransaksiDetail);

router.get("/:id", getTransaksiDetailById);

router.put("/:id", updateTransaksiDetail);

router.delete("/:id", deleteTransaksiDetail);

module.exports = router;