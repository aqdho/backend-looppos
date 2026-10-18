const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "produk/");
    },

    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const namaFile = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;

        cb(null, namaFile);
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
});

module.exports = upload;