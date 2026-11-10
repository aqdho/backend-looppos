
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { spawn } = require("child_process");

const pool = require("./config/database");
const authMiddleware = require("./middleware/authMiddleware");

const productsRoutes = require("./routes/productsRoutes");
const authRoutes = require("./auth/authRoutes");
const usersRoutes = require("./users/usersRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const kategoriRouter = require("./kategori/kategoriRoutes");
const transaksiDetailRoutes = require("./routes/transaksiDetailRoutes");
const transaksiRoutes = require("./routes/transaksiRoutes");
const shiftRoutes = require("./routes/shiftRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const pengeluaranRoutes = require("./routes/pengeluaranRoutes");
const printAgentRoutes = require("./routes/printAgentRoutes");
const whatsappRoutes = require("./routes/whatsappRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const notifikasiRoutes = require("./routes/notifikasiRoutes");
const strukRoutes = require("./routes/strukRoutes");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =====================================================
// STATIC PRODUK
// =====================================================

app.use(
    "/produk",
    express.static(path.join(__dirname, "produk"))
);

// =====================================================
// STATIC LOGO TOKO
// =====================================================

app.use(
    "/uploads/logos",
    express.static(
        path.join(__dirname, "uploads", "logos")
    )
);

// =====================================================
// LOG REQUEST
// =====================================================

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// =====================================================
// TEST ROUTE
// =====================================================

app.get("/", (req, res) => {
    res.json({
        status: "ok",
        aplikasi: "LoopPOS Backend",
        message: "Backend LoopPOS aktif",
    });
});

app.get("/users", (req, res) => {
    res.send("Hai Users");
});

// =====================================================
// ME
// =====================================================

app.get("/me", authMiddleware, async (req, res) => {
    try {
        console.log("USER DARI TOKEN:", req.user);

        const userId = Number(req.user.id);

        const result = await pool.query(
            `SELECT
                id,
                username,
                phone,
                email,
                role
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                pesan: "User tidak ditemukan",
            });
        }

        return res.json({
            pesan: "Data user berhasil diambil",
            user: result.rows[0],
        });
    } catch (error) {
        console.error("ERROR GET ME:", error);

        return res.status(500).json({
            pesan: "Gagal mengambil data user",
            error: error.message,
        });
    }
});

// =====================================================
// ROUTES
// =====================================================

app.use("/auth", authRoutes);
app.use("/products", productsRoutes);
app.use("/users", usersRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/kategori", kategoriRouter);
app.use("/transaksi-detail", transaksiDetailRoutes);
app.use("/transaksi", transaksiRoutes);
app.use("/shift", shiftRoutes);
app.use("/settings", settingsRoutes);
app.use("/pengeluaran", pengeluaranRoutes);
app.use("/print-agent", printAgentRoutes);
app.use("/whatsapp", whatsappRoutes);
app.use("/payment", paymentRoutes);
app.use("/notifikasi", notifikasiRoutes);

// Endpoint tetap: POST /print/struk
app.use("/", strukRoutes);

console.log("ROUTE TRANSAKSI DETAIL AKTIF");
console.log("ROUTE STRUK AKTIF");

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server berjalan di port ${PORT}`);
});
