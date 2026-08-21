const validateProducts = (req, res, next) => {
    const { nama, qty, id_kategori } = req.body;

    if (nama === undefined || qty === undefined || id_kategori === undefined) {
        return res.status(400).json({
            pesan: "nama, qty, dan id_kategori wajib diisi"
        });
    }

    if (typeof nama !== "string") {
        return res.status(400).json({
            pesan: "nama harus berupa teks"
        });
    }

    if (typeof qty !== "number") {
        return res.status(400).json({
            pesan: "qty harus berupa angka"
        });
    }

    if (typeof id_kategori !== "number") {
        return res.status(400).json({
            pesan: "id_kategori harus berupa angka"
        });
    }

    if (qty < 0) {
        return res.status(400).json({
            pesan: "qty harus lebih dari 0"
        });
    }

    if (id_kategori < 0) {
        return res.status(400).json({
            pesan: "id_kategori harus lebih dari 0"
        });
    }


    next();
};

module.exports = validateProducts;