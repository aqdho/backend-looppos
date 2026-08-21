const validateId = (req, res, next) => {
    const { id } = req.params; 

    if (isNaN(id)) {
        return res.status(400).json({
            pesan: "ID harus berupa angka"
        });
    }

    next();
};

module.exports = validateId;