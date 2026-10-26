const express = require("express");

const router = express.Router();

const {
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
   } = require("../controllers/productsController");

   const validateProducts = require("../middleware/productsMiddleware");
   const validateId = require("../middleware/IdMiddleware");
   const authMiddleware = require("../middleware/authMiddleware");
   const ownerMiddleware = require("../middleware/roleMiddleware");
   const upload = require("../middleware/uploadMiddleware");

router.get("/", authMiddleware, getProducts);

router.get(
    "/stock-movements",
    authMiddleware,
    getStockMovements
);

router.post( 
    "/stock-opname",
    authMiddleware,
    ownerMiddleware,
    createStockOpname
);

router.get(
  "/stock-opname",
  authMiddleware,
  ownerMiddleware,
  getStockOpnames
);

router.get("/:id", authMiddleware, validateId, getProductById);

router.post(
    "/",
    authMiddleware,
    ownerMiddleware,
    upload.single("gambar"),
    validateProducts,
    createProduct
);

router.post(
    "/import",
    authMiddleware,
    ownerMiddleware,
    importProducts
);

router.put(
    "/:id",
    authMiddleware,
    ownerMiddleware,
    upload.single("gambar"),
    updateProduct
);

router.put("/:id/stok", authMiddleware, ownerMiddleware, tambahStok);

router.delete(
    "/:id",
    authMiddleware,
    ownerMiddleware,
    deleteProduct
);

module.exports = router;