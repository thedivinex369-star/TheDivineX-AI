import { createProviderAdapter } from './contract.js';

function getPuterAI() {
    if (
        !globalThis.puter?.ai ||
        typeof globalThis.puter.ai.chat !== 'function'
    ) {
        const error = new Error(
            'Puter AI is not available. Please refresh the page and try again.'
        );

        error.code = 'PROVIDER_UNAVAILABLE';

        throw error;
    }

    return globalThis.puter.ai;
}

function extractText(part) {
    if (typeof part === 'string') {
        return part;
    }

    if (typeof part?.text === 'string') {
        return part.text;
    }

    if (typeof part?.message?.content === 'string') {
        return part.message.content;
    }

    if (typeof part?.content === 'string') {
        return part.content;
    }

    return '';
}

export const puterAdapter = createProviderAdapter({
    id: 'puter',

    isAvailable() {
        return Boolean(
            globalThis.puter?.ai &&
            typeof globalThis.puter.ai.chat === 'function'
        );
    },

    async generate({ messages, model }) {
        const ai = getPuterAI();

        const response = await ai.chat(messages, {
            model,
            stream: false,
        });

        const text = extractText(response);

        return {
            text,
            raw: response,
            provider: 'puter',
            model,
        };
    },

    async stream({ messages, model, onText }) {
        const ai = getPuterAI();

        const stream = await ai.chat(messages, {
            model,
            stream: true,
        });

        let output = '';

        for await (const part of stream) {
            const text = extractText(part);

            if (!text) {
                continue;
            }

            output += text;

            if (typeof onText === 'function') {
                onText(text, output);
            }
        }

        return {
            text: output,
            provider: 'puter',
            model,
        };
    },
});
