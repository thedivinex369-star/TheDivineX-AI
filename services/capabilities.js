export const CAPABILITIES = Object.freeze({
    CHAT: 'chat',
    STREAMING: 'streaming',
    VISION: 'vision',
    REASONING: 'reasoning',
    CODING: 'coding',
    LONG_CONTEXT: 'long-context',
});

export const DEFAULT_CAPABILITIES = Object.freeze({
    chat: true,
    streaming: true,
    vision: false,
    reasoning: false,
    coding: false,
    longContext: false,
});

export function normalizeCapabilities(input = {}) {
    return {
        chat: input.chat === true,
        streaming: input.streaming === true,
        vision: input.vision === true,
        reasoning: input.reasoning === true,
        coding: input.coding === true,
        longContext: input.longContext === true,
    };
}

export function supportsCapability(capabilities, capability) {
    if (!capabilities || !capability) {
        return false;
    }

    return capabilities[capability] === true;
}
