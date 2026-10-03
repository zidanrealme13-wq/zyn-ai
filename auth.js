const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const usersPath = path.join(__dirname, "../data/users.json");

function getUsers() {
    fs.mkdirSync(path.dirname(usersPath), { recursive: true });

    if (!fs.existsSync(usersPath)) {
        fs.writeFileSync(usersPath, "[]");
    }

    return JSON.parse(fs.readFileSync(usersPath, "utf8"));
}

function saveUsers(users) {
    fs.writeFileSync(
        usersPath,
        JSON.stringify(users, null, 2)
    );
}


// REGISTER
router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (typeof name !== "string" || !name.trim() || typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }


        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email and password are required"
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters"
            });
        }

        const users = getUsers();

        const existingUser = users.find(
            user => user.email.toLowerCase() === email.toLowerCase()
        );

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            id: Date.now().toString(),
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);

        saveUsers(users);

        res.status(201).json({
            success: true,
            message: "Account created successfully"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});


// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const users = getUsers();

        const user = users.find(
            user => user.email === email.toLowerCase()
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        if (!process.env.JWT_SECRET?.trim()) {
            return res.status(503).json({
                success: false,
                message: "Authentication is not configured"
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                email: user.email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.json({
            success: true,
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});

module.exports = router;