const {
    askOpenRouter
} = require("./openrouter");

async function generateResponse(message, history = []) {

    if (!message || !message.trim()) {
        throw new Error("Message cannot be empty");
    }

    const response = await askOpenRouter(
        message.trim(),
        history
    );

    return response;
}

module.exports = {
    generateResponse
};