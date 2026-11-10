const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { cetakStruk} = require("../controllers/strukController");

const router = express.Router();

router.post("/print/struk", authMiddleware, cetakStruk);

module.exports = router; 