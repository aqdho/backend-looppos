const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
    createTransaksiDetail,
    getTransaksiDetail,
    getTransaksiDetailById,
    getDetailByTransaksiId,
    updateTransaksiDetail,
    deleteTransaksiDetail

} = require("../controllers/transaksiDetailController");

router.post(
    "/",
    authMiddleware,
    createTransaksiDetail
);

router.get(
    "/",
    authMiddleware,
    getTransaksiDetail
);

router.get(
    "/transaksi/:transaksiId",
    authMiddleware,
    getDetailByTransaksiId
);

router.get(
    "/:id",
    authMiddleware,
    getTransaksiDetailById
);

router.put(
    "/:id",
    authMiddleware,
    updateTransaksiDetail
);

router.delete(
    "/:id",
    authMiddleware,
    deleteTransaksiDetail
);


module.exports = router;
