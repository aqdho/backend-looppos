const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config/jwt");
const pool = require("../config/database");

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            pesan: "Token tidak ditemukan"
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            pesan: "Token tidak ditemukan"
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return res.status(401).json({
            pesan: "Token tidak valid atau sudah kedaluwarsa"
        });
    }

    // Validasi sesi kasir
    if (decoded.role === "kasir") {
        if (!decoded.session_id) {
            return res.status(401).json({
                pesan: "Sesi kasir tidak valid. Silakan login kembali."
            });
        }

        try {
            const result = await pool.query(
                `SELECT s.user_id
                 FROM user_sessions s
                 JOIN users u ON u.id = s.user_id
                 WHERE s.user_id = $1
                   AND s.session_id = $2
                   AND s.expires_at > NOW()
                   AND u.aktif = TRUE
                   AND u.role = 'kasir'
                 LIMIT 1`,
                [decoded.id, decoded.session_id]
            );

            if (result.rows.length === 0) {
                return res.status(401).json({
                    pesan: "Sesi kasir sudah berakhir. Silakan login kembali."
                });
            }
        } catch (error) {
            console.error("ERROR CEK SESI KASIR:", error);

            return res.status(500).json({
                pesan: "Gagal memverifikasi sesi login"
            });
        }
    }

    // User terverifikasi
    req.user = decoded;
    next();
};

module.exports = authMiddleware;