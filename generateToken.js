const jwt = require("jsonwebtoken");

const token = jwt.sign(
    {
        id: 3,
        username: "aqdho"

    },
    "rahasia-belajar-express",
    {
        expiresIn: "1d"
    }
);

console.log(token);