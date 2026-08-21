const express = require("express");

const router = express.Router();

const {
    getProducts,
    getProductById,
    deleteProduct,
    createProduct,
    updateProduct
   } = require("../controllers/productsController");

   const validateProducts = require("../middleware/productsMiddleware");
   const validateId = require("../middleware/IdMiddleware");
   const authMiddleware = require("../middleware/authMiddleware");
   const adminMiddleware = require("../middleware/roleMiddleware");

router.get("/", authMiddleware,getProducts);

router.get("/:id", validateId, getProductById);

router.post("/", validateProducts, createProduct,);

router.put("/:id", updateProduct);

router.delete("/:id", deleteProduct);

router.delete(
    "/:id",
    authMiddleware,
    adminMiddleware,
    deleteProduct
);

module.exports = router;