import { puterAdapter } from './puter.js';

const PROVIDER_ADAPTERS = Object.freeze({
    puter: puterAdapter,
});

function getProvider(providerId) {
    const id = String(providerId || '')
        .trim()
        .toLowerCase();

    return PROVIDER_ADAPTERS[id] || null;
}

function listProviders() {
    return Object.values(PROVIDER_ADAPTERS);
}

function isProviderAvailable(providerId) {
    const adapter = getProvider(providerId);

    return Boolean(
        adapter &&
        typeof adapter.isAvailable === 'function' &&
        adapter.isAvailable()
    );
}

export const providerService = Object.freeze({
    get: getProvider,
    list: listProviders,
    isAvailable: isProviderAvailable,
    adapters: PROVIDER_ADAPTERS,
});
