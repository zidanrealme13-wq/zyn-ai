const express = require("express");
const auth = require("../middleware/auth");
const aiRateLimit = require("../middleware/ratelimit");
const { generateResponse } = require("../services/ai");

const router = express.Router();

function normalizeMessages(payload) {
    const rawMessages = Array.isArray(payload?.messages)
        ? payload.messages
        : Array.isArray(payload?.history)
            ? payload.history
            : [];

    return rawMessages
        .filter((msg) => msg && typeof msg === "object")
        .map((msg) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: typeof msg.content === "string" ? msg.content.trim() : ""
        }))
        .filter((msg) => msg.content);
}

router.post("/", auth, aiRateLimit, async (req, res) => {
    try {
        const { message, messages, history } = req.body || {};

        const normalizedMessages = normalizeMessages({ messages, history });

        const incomingMessage = typeof message === "string"
            ? message.trim()
            : normalizedMessages.at(-1)?.content || "";

        if (!incomingMessage) {
            return res.status(400).json({
                success: false,
                message: "Message is required"
            });
        }

        const historyForAi = normalizedMessages.length
            ? normalizedMessages.slice(0, -1)
            : [];

        const response = await generateResponse(incomingMessage, historyForAi);

        res.json({
            success: true,
            response,
            content: response
        });
    } catch (error) {
        console.error("Chat error:", error);

        res.status(500).json({
            success: false,
            message: error.message || "AI failed to respond"
        });
    }
});

module.exports = router;