const rateLimit = require("express-rate-limit");

const aiRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: {
        success: false,
        message: "Too many requests. Please try again later."
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = aiRateLimit;