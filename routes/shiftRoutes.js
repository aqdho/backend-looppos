const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
    openShift,
    getActiveShift,
    closeShift,
    getShiftHistory
} = require("../controllers/shiftController");

router.use(authMiddleware);

router.get("/active", getActiveShift);
router.post("/", openShift);
router.post("/:id/close", closeShift);
router.get("/", getShiftHistory);

module.exports = router;