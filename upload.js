const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const auth = require("../middleware/auth");

const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads");

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        fs.mkdir(uploadDir, { recursive: true }, (error) => {
            cb(error, uploadDir);
        });
    },

    filename: (req, file, cb) => {

        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 1e9) +
            path.extname(file.originalname);

        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

router.post(
    "/",
    auth,
    upload.single("file"),
    (req, res) => {

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        res.json({
            success: true,
            message: "File uploaded",
            file: {
                name: req.file.originalname,
                filename: req.file.filename,
                size: req.file.size,
                type: req.file.mimetype
            }
        });
    }
);

module.exports = router;