const validateProducts = (req, res, next) => {
    const { nama, qty, harga, id_kategori } = req.body;

    if (
        nama === undefined ||
        qty === undefined ||
        harga === undefined ||
        id_kategori === undefined
    ) {
        return res.status(400).json({
            pesan: "nama, qty, harga, dan id_kategori wajib diisi"
        });
    }

    if (typeof nama !== "string") {
        return res.status(400).json({
            pesan: "nama harus berupa teks"
        });
    }

    const qtyNumber = Number(qty);
    const hargaNumber = Number(harga);
    const kategoriNumber = Number(id_kategori);

    if (isNaN(qtyNumber)) {
        return res.status(400).json({
            pesan: "qty harus berupa angka"
        });
    }

    if (isNaN(kategoriNumber)) {
        return res.status(400).json({
            pesan: "id_kategori harus berupa angka"
        });
    }

    if(qtyNumber < 0) {
        return res.status(400).json({
            pesan: "qty harus lebih dari 0"
        });
    }

    if (isNaN(hargaNumber)) {
        return res.status(400).json({
            pesan: "harga harus berupa angka"
        });
    }

    if (kategoriNumber < 0) {
        return res.status(400).json({
            pesan: "id_kategori harus lebih dari 0"
        });
    }

    req.body.qty = qtyNumber;
    req.body.harga = hargaNumber;
    req.body.id_kategori = kategoriNumber;

    next();
};

module.exports = validateProducts;