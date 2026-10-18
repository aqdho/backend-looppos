const ownerMiddleware = (req, res, next) => {

    console.log("USER DARI TOKEN:", req.user);

    if (req.user.role !== "owner") {

        return res.status(403).json({
            pesan: "Akses hanya untuk owner"
        });

    }

    next();

};

module.exports = ownerMiddleware;