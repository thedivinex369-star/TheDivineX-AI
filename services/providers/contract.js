export function createProviderAdapter({
    id,
    isAvailable,
    generate,
    stream,
}) {
    if (!id || typeof id !== "string") {
        throw new TypeError("Provider adapter requires a valid id.");
    }

    if (typeof isAvailable !== "function") {
        throw new TypeError(`${id} adapter requires isAvailable().`);
    }

    if (typeof generate !== "function") {
        throw new TypeError(`${id} adapter requires generate().`);
    }

    if (typeof stream !== "function") {
        throw new TypeError(`${id} adapter requires stream().`);
    }

    return Object.freeze({
        id,
        isAvailable,
        generate,
        stream,
    });
}
