async function askOpenRouter(message, history = []) {

    const messages = [
        {
            role: "system",
            content:
                "You are ZYN-AI, a helpful, accurate and friendly AI assistant."
        },

        ...history,

        {
            role: "user",
            content: message
        }
    ];

    const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
                "X-Title": "ZYN-AI"
            },

            body: JSON.stringify({
                model: process.env.AI_MODEL || "openrouter/auto",
                messages,
                temperature: 0.7
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        console.error("OpenRouter error:", data);

        throw new Error(
            data?.error?.message || "AI request failed"
        );
    }

    return data.choices?.[0]?.message?.content || "No response from AI.";
}

module.exports = {
    askOpenRouter
};