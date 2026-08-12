const express = require("express");

const app = express();

app.use(express.json());

const PORT = 3000;

const productsRoutes = require("./routes/productsRoutes");

app.get("/", (req, res) => {
    res.send("Halo Dunia");
});

app.get("/users", (req, res) => {
    res.send("Hai Users");
});

app.use("/products", productsRoutes);

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:3000`);
});
