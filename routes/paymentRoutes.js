const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
    getPaymentAccount,
    savePaymentAccount,
    createXenditAccount,
    xenditWebhook
} = require("../controllers/paymentController");


router.get(
    "/",
    authMiddleware,
    getPaymentAccount
);


router.post(
    "/",
    authMiddleware,
    savePaymentAccount
);


router.post(
    "/xendit/account",
    authMiddleware,
    createXenditAccount
);


router.post(
    "/xendit/webhook",
    xenditWebhook
);

module.exports = router;
