import { SYSTEM } from '../config.js';
import { modelService } from './models.js';
import { modelResolver } from './modelResolver.js';
import { providerService } from './providers/index.js';
import { getErrorMessage, isRateLimitError } from '../utils.js';

const ERROR_CODES = Object.freeze({
    RATE_LIMIT: 'RATE_LIMIT',
    MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
    PROVIDER_ERROR: 'PROVIDER_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    AUTH_ERROR: 'AUTH_ERROR',
    INVALID_REQUEST: 'INVALID_REQUEST',
    UNKNOWN: 'UNKNOWN',
});

function normalizeMessage(message) {
    return {
        role: message?.role || 'user',
        content: String(message?.content ?? ''),
    };
}

function buildHistory(messages, limit = 20, responseStyle = 'balanced') {
    const safeMessages = Array.isArray(messages) ? messages : [];
    const styleInstructions = {
        concise: 'Keep answers concise and direct. Prioritize the key answer and avoid unnecessary detail.',
        balanced: '',
        detailed: 'Give thorough, well-structured explanations with useful context, examples, and steps when appropriate.',
    };
    const styleInstruction = styleInstructions[responseStyle] ?? '';

    return [
        SYSTEM,
        ...(styleInstruction ? [{ role: 'system', content: `Response style preference: ${styleInstruction}` }] : []),
        ...safeMessages.slice(-limit).map(normalizeMessage),
    ];
}

function resolveModel(modelOrId, capability = '') {
    if (!modelOrId && capability) {
        return modelResolver.resolveByCapability(capability);
    }

    if (!modelOrId) {
        return modelService.default();
    }

    if (typeof modelOrId === 'object' && modelOrId.id) {
        return modelService.resolve(modelOrId.id);
    }

    return modelService.resolve(modelOrId);
}

function resolveProvider(model) {
    const provider = String(model?.provider || 'puter')
        .trim()
        .toLowerCase();

    const directAdapter = providerService.get(provider);

    if (directAdapter) {
        return { id: provider, adapter: directAdapter };
    }

    const puterAdapter = model?.puterId
        ? providerService.get('puter')
        : null;

    if (puterAdapter) {
        return { id: 'puter', adapter: puterAdapter };
    }

    return { id: provider, adapter: null };
}

function messageFromError(error) {
    return String(
        error?.message ||
        error?.msg ||
        error?.error ||
        error ||
        ''
    ).toLowerCase();
}

function classifyError(error) {
    if (!error) {
        return ERROR_CODES.UNKNOWN;
    }

    const code = String(
        error.code ||
        error.errorCode ||
        ''
    ).toUpperCase();

    const message = messageFromError(error);

    if (
        isRateLimitError(error) ||
        code.includes('RATE') ||
        /rate.?limit|too many requests|429|quota exceeded|limit reached/.test(message)
    ) {
        return ERROR_CODES.RATE_LIMIT;
    }

    if (
        code.includes('AUTH') ||
        /unauthorized|authentication|not authenticated|forbidden|401|403|sign.?in/.test(message)
    ) {
        return ERROR_CODES.AUTH_ERROR;
    }

    if (
        code.includes('INVALID') ||
        /invalid request|bad request|malformed|validation|400/.test(message)
    ) {
        return ERROR_CODES.INVALID_REQUEST;
    }

    if (
        code.includes('MODEL') ||
        /model.*(not found|unavailable|does not exist|unsupported)|unknown model|model_not_found/.test(message)
    ) {
        return ERROR_CODES.MODEL_UNAVAILABLE;
    }

    if (
        /network|failed to fetch|fetch failed|connection|offline|timeout|timed out|websocket/.test(message)
    ) {
        return ERROR_CODES.NETWORK_ERROR;
    }

    if (
        code.includes('PROVIDER') ||
        /provider|service unavailable|temporarily unavailable|internal server error|500|502|503|504/.test(message)
    ) {
        return ERROR_CODES.PROVIDER_ERROR;
    }

    return ERROR_CODES.UNKNOWN;
}

function createServiceError(error, context = {}) {
    const category = classifyError(error);

    const serviceError = new Error(
        getErrorMessage(
            error,
            'The AI service encountered an unexpected error.'
        )
    );

    serviceError.name = 'AIServiceError';
    serviceError.code = category;
    serviceError.category = category;
    serviceError.model = context.model?.id || context.model || null;
    serviceError.provider = context.provider || null;
    serviceError.originalError = error;

    return serviceError;
}

function getFallbackModel(currentModel) {
    const currentId = currentModel?.id;

    const candidates = [
        modelService.default(),
        ...modelService.getByCategory('fast'),
        ...modelService.list(),
    ];

    const seen = new Set();

    for (const model of candidates) {
        if (!model?.id) continue;
        if (seen.has(model.id)) continue;

        seen.add(model.id);

        if (model.id === currentId) continue;

        const provider = resolveProvider(model);

        if (provider.adapter) {
            return model;
        }
    }

    return null;
}

function shouldFallback(error) {
    const category = classifyError(error);

    return (
        category === ERROR_CODES.RATE_LIMIT ||
        category === ERROR_CODES.MODEL_UNAVAILABLE ||
        category === ERROR_CODES.PROVIDER_ERROR
    );
}

async function executeWithFallback(
    operation,
    { model, provider, canFallback = shouldFallback }
) {
    try {
        return await operation(model, provider);
    } catch (firstError) {
        if (!canFallback(firstError)) {
            throw createServiceError(firstError, {
                model,
                provider: provider?.id,
            });
        }

        const fallbackModel = getFallbackModel(model);

        if (!fallbackModel) {
            throw createServiceError(firstError, {
                model,
                provider: provider?.id,
            });
        }

        const fallbackProvider = resolveProvider(fallbackModel);

        console.warn(
            '[TheDivineX AI] Falling back from',
            model?.id,
            'to',
            fallbackModel.id
        );

        try {
            return await operation(
                fallbackModel,
                fallbackProvider
            );
        } catch (fallbackError) {
            const safeFallbackError = fallbackError instanceof Error
                ? fallbackError
                : new Error(messageFromError(fallbackError));

            safeFallbackError.fallbackFrom = model?.id;
            safeFallbackError.fallbackTo = fallbackModel.id;

            throw createServiceError(
                safeFallbackError,
                {
                    model: fallbackModel,
                    provider: fallbackProvider.id,
                }
            );
        }
    }
}

export const aiService = Object.freeze({
    ERROR_CODES,

    buildHistory,

    resolveModel,

    classifyError,

    getFallbackModel,

    async generate({
        messages = [],
        model,
        capability = '',
    } = {}) {
        const selectedModel = resolveModel(model, capability);

        if (!selectedModel) {
            const error = new Error(
                'No available AI model is configured.'
            );

            error.code = ERROR_CODES.MODEL_UNAVAILABLE;

            throw createServiceError(error);
        }

        const provider = resolveProvider(selectedModel);

        if (!provider.adapter) {
            const error = new Error(
                `No adapter is available for provider "${provider.id}".`
            );

            error.code = ERROR_CODES.PROVIDER_ERROR;

            throw createServiceError(error, {
                model: selectedModel,
                provider: provider.id,
            });
        }

        const history = buildHistory(messages, 20, responseStyle);

        return executeWithFallback(
            (activeModel, activeProvider) =>
                activeProvider.adapter.generate({
                    messages: history,
                    model: activeModel.puterId || activeModel.id,
                }),
            {
                model: selectedModel,
                provider,
            }
        );
    },

    async stream({
        messages = [],
        model,
        capability = '',
        onText,
        responseStyle = 'balanced',
    } = {}) {
        if (typeof onText !== 'function') {
            throw new TypeError(
                'onText callback is required.'
            );
        }

        const selectedModel = resolveModel(model, capability);

        if (!selectedModel) {
            const error = new Error(
                'No available AI model is configured.'
            );

            error.code = ERROR_CODES.MODEL_UNAVAILABLE;

            throw createServiceError(error);
        }

        const provider = resolveProvider(selectedModel);

        if (!provider.adapter) {
            const error = new Error(
                `No adapter is available for provider "${provider.id}".`
            );

            error.code = ERROR_CODES.PROVIDER_ERROR;

            throw createServiceError(error, {
                model: selectedModel,
                provider: provider.id,
            });
        }

        const history = buildHistory(messages, 20, responseStyle);
        let streamedText = false;

        return executeWithFallback(
            (activeModel, activeProvider) =>
                activeProvider.adapter.stream({
                    messages: history,
                    model: activeModel.puterId || activeModel.id,
                    onText: (chunk, fullText) => {
                        if (typeof chunk === 'string' && chunk.length > 0) {
                            streamedText = true;
                        }

                        onText(chunk, fullText);
                    },
                }),
            {
                model: selectedModel,
                provider,
                canFallback: error =>
                    !streamedText && shouldFallback(error),
            }
        );
    },

    async streamChat({
        messages,
        modelId,
        onText,
        responseStyle = 'balanced',
    }) {
        const result = await this.stream({
            messages,
            model: modelId,
            onText,
            responseStyle,
        });

        return result.text;
    },

    formatError(error) {
        const category =
            error?.category ||
            error?.code ||
            classifyError(error);

        switch (category) {
            case ERROR_CODES.RATE_LIMIT:
                return '**Rate limit reached.** Please wait a moment or switch to another model.';

            case ERROR_CODES.MODEL_UNAVAILABLE:
                return '**Model unavailable.** TheDivineX AI will try another available model.';

            case ERROR_CODES.PROVIDER_ERROR:
                return '**AI provider error.** Please try again or switch to another model.';

            case ERROR_CODES.NETWORK_ERROR:
                return '**Network error.** Check your internet connection and try again.';

            case ERROR_CODES.AUTH_ERROR:
                return '**Authentication required.** Please sign in again and retry.';

            case ERROR_CODES.INVALID_REQUEST:
                return '**Invalid AI request.** Please try again with a different prompt.';

            default: {
                const message = getErrorMessage(
                    error,
                    'Unknown AI error.'
                );

                if (/not available|not configured|puter/i.test(message)) {
                    return `**AI service unavailable.** ${message}`;
                }

                return '**Something went wrong.** Please try again or switch to a different model.';
            }
        }
    },
});







