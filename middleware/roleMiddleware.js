const adminMiddleware = (req, res, next) => {

    console.log("USER DARI TOKEN:", req.user);

    if (req.user.role !== "admin") {

        return res.status(403).json({
            pesan: "Akses ditolak"
        });

    }

    next();

};

module.exports = adminMiddleware;