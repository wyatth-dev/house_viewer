import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';

/** Collect drafts; the caller validates and commits the last valid parameters. */
export function bindParameterInputs(initial: VarendaParams, onInput: (draft: VarendaParams) => void) {
    const fields = [
        ['widthMm', '#product-width'],
        ['postInterval', '#post-interval'],
        ['depthMm', '#product-depth'],
        ['undersideHeightMm', '#underside-height'],
        ['wallHeightMm', '#wall-height']
    ] as const;
    const inputs = fields.map(([key, selector]) => {
        const input = document.querySelector<HTMLInputElement>(selector)!;
        input.value = String(initial[key]);
        return { key, input };
    });
    const readDraft = () => {
        const draft = { ...initial };
        for (const { key, input } of inputs) draft[key] = input.valueAsNumber;
        onInput(draft);
    };
    for (const { input } of inputs) input.addEventListener('input', readDraft);
    return {
        destroy() {
            for (const { input } of inputs) input.removeEventListener('input', readDraft);
        }
    };
}
