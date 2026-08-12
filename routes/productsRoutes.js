const express = require("express");

const router = express.Router();

const {
    getProducts,
    getProductById,
    deleteProduct,
    createProduct,
    patchProduct
} = require("../controllers/productsController");

router.get("/", getProducts);
router.get("/:id", getProductById);

router.post("/", createProduct);

router.patch("/:id", patchProduct);

router.delete("/:id", deleteProduct);

module.exports = router;