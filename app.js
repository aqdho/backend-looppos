const express = require("express");
const cors = require("cors");
const authMiddleware = require("./middleware/authMiddleware");
const productsRoutes = require("./routes/productsRoutes");
const authRoutes = require("./auth/authRoutes");
const usersRoutes = require("./users/usersRoutes");
const kategoriRouter = require("./kategori/kategoriRoutes");
const transaksiDetailRoutes = require("./routes/transaksiDetailRoutes");
const transaksiRoutes = require("./routes/transaksiRoutes");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = 3000;

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

app.get("/", (req, res) => {
    res.send("Halo Dunia");
});

app.get("/users", (req, res) => {
    res.send("Hai Users");
});

app.get("/me", authMiddleware, (req, res) => {
    res.json({
        pesan: "Data user berhasil diambil",
        user: req.user
    })
});

app.use("/auth", authRoutes);

app.use("/products", productsRoutes);

app.use("/users", usersRoutes);

app.use("/kategori", kategoriRouter);

app.use("/transaksi-detail", transaksiDetailRoutes);

app.use("/transaksi", transaksiRoutes);

console.log("ROUTE TRANSAKSI DETAIL AKTIF");

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:3000`);
});
