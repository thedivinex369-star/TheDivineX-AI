import { modelService } from './models.js';

function clean(value) {
    return String(value ?? '').trim();
}

function scoreModel(model, capability) {
    if (!model) {
        return -1;
    }

    let score = 0;

    if (model?.capabilities?.[capability] === true) {
        score += 100;
    }

    if (model?.capabilities?.chat === true) {
        score += 10;
    }

    if (model?.capabilities?.streaming === true) {
        score += 5;
    }

    return score;
}

function resolveByCapability(capability, preferredModelId = '') {
    const requested = clean(capability);

    if (!requested) {
        return modelService.default();
    }

    const candidates = modelService.getByCapability(requested);

    if (!candidates.length) {
        return modelService.resolve(preferredModelId);
    }

    const preferred = clean(preferredModelId);

    if (preferred) {
        const preferredModel = candidates.find(
            model => model.id.toLowerCase() === preferred.toLowerCase()
        );

        if (preferredModel) {
            return preferredModel;
        }
    }

    return [...candidates].sort(
        (a, b) =>
            scoreModel(b, requested) -
            scoreModel(a, requested)
    )[0] || modelService.default();
}

export const modelResolver = Object.freeze({
    resolveByCapability,
});
