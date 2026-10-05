const PROVIDERS = {
    "openrouter/auto": {
        name: "OpenRouter",
        apiKey: () => process.env.OPENROUTER_API_KEY,
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        model: "openrouter/auto"
    },
    "groq/qwen/qwen3.8-27b": {
        name: "Groq",
        apiKey: () => process.env.GROQ_API_KEY,
        endpoint: "https://api.groq.com/openai/v1/chat/completions",
        model: "qwen/qwen3.8-27b"
    }
};

class ProviderError extends Error {
    constructor(message, status, code, provider) {
        super(message);
        this.name = "ProviderError";
        this.status = status;
        this.code = code;
        this.provider = provider;
    }
}

async function generateResponse(message, history = [], selectedModel = "openrouter/auto") {
    if (typeof message !== "string" || !message.trim()) {
        throw new Error("Message cannot be empty");
    }

    const provider = PROVIDERS[selectedModel];
    if (!provider) {
        throw new ProviderError("The selected AI model is not available.", 400, "MODEL_UNAVAILABLE");
    }

    const apiKey = provider.apiKey()?.trim();
    if (!apiKey) {
        throw new ProviderError(`${provider.name} is not configured on the backend.`, 503, "NOT_CONFIGURED", provider.name);
    }

    const messages = [
        {
            role: "system",
            content: "You are ZYN-AI, a helpful, accurate and friendly AI assistant."
        },
        ...history,
        {
            role: "user",
            content: message.trim()
        }
    ];

    let response;
    try {
        response = await fetch(provider.endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                ...(selectedModel === "openrouter/auto" ? {
                    "HTTP-Referer": process.env.APP_URL || "http://localhost:3001",
                    "X-Title": "ZYN-AI"
                } : {})
            },
            body: JSON.stringify({
                model: provider.model,
                messages
            })
        });
    } catch (error) {
        console.error(`[ZYN] ${provider.name} request failed:`, error);
        throw new ProviderError(`${provider.name} is temporarily unavailable. Please try again.`, 502, "PROVIDER_ERROR", provider.name);
    }

    if (!response.ok) {
        const status = response.status;
        if (status === 429) {
            throw new ProviderError(`${provider.name} rate limit reached. Please wait a moment and try again.`, 429, "RATE_LIMIT", provider.name);
        }
        if (selectedModel === "openrouter/auto" && status === 402) {
            throw new ProviderError("OpenRouter credits are exhausted. Check your account balance.", 502, "CREDITS_EXHAUSTED", provider.name);
        }
        if (status === 401 || status === 403) {
            throw new ProviderError(`${provider.name} rejected the backend API key.`, 502, "AUTH_ERROR", provider.name);
        }
        if (status === 404) {
            throw new ProviderError(`${provider.name} model is unavailable.`, 502, "MODEL_UNAVAILABLE", provider.name);
        }

        console.error(`[ZYN] ${provider.name} API error: status=${status}`);
        throw new ProviderError(`${provider.name} could not complete the request. Please try again.`, 502, "API_ERROR", provider.name);
    }

    let data;
    try {
        data = await response.json();
    } catch (error) {
        console.error(`[ZYN] ${provider.name} returned an invalid response:`, error);
        throw new ProviderError(`${provider.name} returned an invalid response. Please try again.`, 502, "PROVIDER_ERROR", provider.name);
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
        throw new ProviderError(`${provider.name} returned an empty response. Please try again.`, 502, "PROVIDER_ERROR", provider.name);
    }

    return content;
}

module.exports = {
    generateResponse,
    ProviderError
};