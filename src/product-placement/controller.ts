import type { AppBase } from 'playcanvas';

import { componentGeometryIds, containedInstanceIds } from '../products/parametric-engine/varenda/component-data.ts';
import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import { solveVarenda } from '../products/parametric-engine/varenda/solution.ts';
import { createVarendaView } from '../products/varenda/view/varenda-view.ts';
import type { VarendaView } from '../products/varenda/view/varenda-view.ts';
import type { ProductRecord } from '../projects/state.ts';
import { houseInstallationFaces } from '../scene/house/installation-faces.ts';
import { createProductAssetStore } from '../shared/assets/containers.ts';
import type { CameraBasis } from '../shared/camera/types.ts';
import type { Bounds3, Point3, ProjectPoint } from '../shared/geometry/types.ts';
import type { Rect } from '../site-definition/types.ts';

import {
    calculateEnvelopeCorners,
    editPreviewDimension,
    getPreviewDimensions,
    getPlacementFocusBounds,
    productParameterLabels,
    solveInstallationAreas
} from './geometry.ts';
import type { PreviewDimensionKey } from './geometry.ts';
import { createPlacementPreview } from './preview.ts';
import { renderComponentTree, renderProductionList, componentProductionRows } from './production-list.ts';
import type { InstanceSelection } from './selection-state.ts';
import type { CustomizableEnvelope, InstallationWallFace } from './types.ts';
import { createAvailableAreaView, createPreviewMeasurements, createProductParameterMeasurements } from './view.ts';

type PlacedProduct = {
    id: string;
    name: string;
    wall: InstallationWallFace;
    envelope: CustomizableEnvelope;
    params: VarendaParams;
    view: VarendaView;
    lockedDimensions: Set<PreviewDimensionKey>;
    lockedParameters: Set<keyof VarendaParams>;
};

/** Scene-owned product instances survive navigation between workflow steps. */
export function createPlacementController(
    app: AppBase,
    overlay: HTMLElement,
    getProperty: () => Rect,
    project: ProjectPoint,
    viewport: HTMLElement,
    productButton: HTMLButtonElement,
    screenToGround: (x: number, y: number, groundYMm?: number) => Point3 | undefined,
    signal: AbortSignal,
    onFocus?: (bounds: Bounds3 | undefined, basis?: CameraBasis, preserveView?: boolean) => void,
    setContextVisible?: (visible: boolean) => void,
    onEditModeChange?: (editing: boolean) => void,
    onChange?: () => void
) {
    let placementActive = false;
    let selectedProduct: 'varenda' | undefined;
    let pointerInside = false;
    let selectedId: string | undefined;
    let detailId: string | undefined;
    let disposed = false;
    let committing = false;
    let serial = 0;
    let partSelection: InstanceSelection | undefined;
    let selectedRow: string | undefined;
    const menus = new Map<string, Set<string>>();
    const instances = new Map<string, PlacedProduct>();
    const assets = createProductAssetStore(app, signal);
    const list = document.querySelector<HTMLElement>('#product-instance-list')!;
    const empty = document.querySelector<HTMLElement>('#products-empty')!;
    const detail = document.querySelector<HTMLElement>('#placed-product-detail')!;
    const detailContent = document.querySelector<HTMLElement>('#placed-product-detail-content')!;
    const overview = document.querySelector<HTMLElement>('#placement-overview')!;
    const editNavigation = document.querySelector<HTMLElement>('#product-customization-navigation')!;
    const exitEdit = document.querySelector<HTMLButtonElement>('#product-edit-exit')!;
    const parameterTab = document.querySelector<HTMLButtonElement>('#product-edit-parameters')!;
    const partsTab = document.querySelector<HTMLButtonElement>('#product-edit-parts')!;
    partsTab.textContent = 'Components';
    const productionTab = document.createElement('button');
    productionTab.type = 'button';
    productionTab.id = 'product-edit-production';
    productionTab.className = partsTab.className;
    productionTab.textContent = 'List';
    partsTab.after(productionTab);
    let detailMode: 'parameters' | 'components' | 'production' = 'parameters';
    const siteBack = document.querySelector<HTMLButtonElement>('#site-back')!;

    const cursorIcon = document.createElement('div');
    cursorIcon.className = 'placement-cursor';
    cursorIcon.hidden = true;
    cursorIcon.setAttribute('aria-hidden', 'true');
    cursorIcon.innerHTML = `<svg class="placement-hammer" viewBox="0 0 40 40" width="32" height="32"><path d="M20 16L9 34" stroke="#70492e" stroke-width="6" stroke-linecap="round"/><path d="M13 9l7-5 5 5 8 1-1 7-8-2-5 5z" fill="#e8edf0" stroke="#31483e" stroke-width="2" stroke-linejoin="round"/></svg>`;
    viewport.append(cursorIcon);
    const feedback = document.createElement('div');
    feedback.className = 'placement-feedback';
    feedback.hidden = true;
    feedback.setAttribute('role', 'status');
    viewport.append(feedback);
    const showFeedback = (message?: string) => {
        feedback.textContent = message ?? '';
        feedback.hidden = !message;
    };
    const occupied = (except?: string) =>
        [...instances.values()].filter((instance) => instance.id !== except).map((instance) => instance.envelope);
    const faces = houseInstallationFaces(); // the house this controller was created for
    const preview = createPlacementPreview(
        app,
        faces,
        getProperty,
        screenToGround,
        signal,
        showFeedback,
        occupied
    );
    const availableAreas = createAvailableAreaView(app, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const isPlacing = () => placementActive && selectedProduct === 'varenda';
    const selected = () => (selectedId ? instances.get(selectedId) : undefined);
    let focusedBounds: Bounds3 | undefined;
    const focusBasis = () => selected()?.view.getViewBasis(partSelection?.id, partSelection?.path.at(-2));
    const focus = (bounds: Bounds3 | undefined, allowAngleChange = false) => {
        focusedBounds = bounds;
        onFocus?.(bounds, bounds ? focusBasis() : undefined, !allowAngleChange);
    };
    const placementBounds = (instance: PlacedProduct) =>
        getPlacementFocusBounds(instance.envelope, instance.wall, instance.view.getBounds());

    const placeView = (instance: PlacedProduct) => {
        const { wall, envelope, view } = instance;
        const corner = calculateEnvelopeCorners(envelope, wall).wallStart;
        view.root.setPosition(corner.x, corner.y, corner.z);
        view.root.setEulerAngles(0, (Math.atan2(-wall.alongWallUnit.z, wall.alongWallUnit.x) * 180) / Math.PI, 0);
        view.root.setLocalScale(
            1,
            1,
            wall.alongWallUnit.x * wall.outwardUnit.z - wall.alongWallUnit.z * wall.outwardUnit.x
        );
    };
    const validateEnvelope = (envelope: CustomizableEnvelope, wall: InstallationWallFace) => {
        const corners = calculateEnvelopeCorners(envelope, wall);
        const property = getProperty();
        if (
            Object.values(corners).some(
                (point) =>
                    point.x < property.minX ||
                    point.x > property.maxX ||
                    point.z < property.minZ ||
                    point.z > property.maxZ
            )
        )
            throw new Error('The product must remain inside the property boundary.');
        const start = envelope.attachment.alongWallOffsetMm,
            end = start + envelope.widthMm;
        if (
            occupied(envelope.instanceId).some(
                (other) =>
                    other.attachment.wallFaceId === wall.wallFaceId &&
                    other.attachment.structureId === wall.structureId &&
                    start < other.attachment.alongWallOffsetMm + other.widthMm &&
                    end > other.attachment.alongWallOffsetMm
            )
        )
            throw new Error('This wall range is already occupied by another product.');
    };
    const refreshAvailableAreas = () => {
        availableAreas.setAreas(
            solveInstallationAreas(faces, getProperty(), occupied()).map((area) => area.corners)
        );
        availableAreas.setActive(isPlacing());
    };
    const syncPlacementMode = () => {
        const placing = isPlacing();
        productButton.setAttribute('aria-pressed', String(placing));
        viewport.classList.toggle('is-placing-product', placing);
        cursorIcon.hidden = !placing || !pointerInside || committing;
        preview.setActive(placing && !committing);
    };
    let refreshDetail: (() => void) | undefined;
    let editDetailParameter: ((key: keyof VarendaParams, valueMm: number) => string | undefined) | undefined;
    const readDimensionState = () => {
        if (!placementActive || detailId) return undefined;
        if (isPlacing()) return preview.getDimensionState();
        const instance = selected();
        return instance
            ? {
                  wall: instance.wall,
                  envelope: instance.envelope,
                  lockedDimensions: instance.lockedDimensions,
                  dimensions: getPreviewDimensions(instance.envelope, instance.wall, instance.params.wallHeightMm)
              }
            : undefined;
    };
    const updateInstance = (instance: PlacedProduct, params: VarendaParams, envelope: CustomizableEnvelope) => {
        validateEnvelope(envelope, instance.wall);
        const solution = solveVarenda(params);
        instance.view.update(solution);
        instance.params = { ...params };
        instance.envelope = envelope;
        placeView(instance);
        refreshAvailableAreas();
        onChange?.();
    };
    /** Validates, solves and adds a product; resolves undefined when the controller was disposed meanwhile. */
    const buildInstance = async (
        product: Omit<PlacedProduct, 'view'>
    ): Promise<PlacedProduct | undefined> => {
        validateEnvelope(product.envelope, product.wall);
        const solution = solveVarenda(product.params);
        let view: VarendaView | undefined = await createVarendaView(app, assets);
        try {
            view.setFastenerAxesVisible(false);
            if (disposed || signal.aborted) return undefined;
            validateEnvelope(product.envelope, product.wall);
            view.update(solution);
            const instance = { ...product, params: { ...product.params }, view };
            placeView(instance);
            instances.set(instance.id, instance);
            view = undefined;
            return instance;
        } finally {
            view?.destroy();
        }
    };
    const measurements = createPreviewMeasurements(
        app,
        overlay,
        project,
        readDimensionState,
        (field, value) => {
            if (isPlacing()) {
                const state = preview.getDimensionState();
                if (!state) return 'Move onto an available area first.';
                try {
                    const edited = editPreviewDimension(
                        state.envelope,
                        state.wall,
                        preview.getParams().wallHeightMm,
                        field,
                        value,
                        preview.getDimensionLocks()
                    );
                    validateEnvelope(edited.envelope, state.wall);
                    return preview.editDimensions(field, value);
                } catch (error) {
                    return error instanceof Error ? error.message : 'Unable to update the preview.';
                }
            }
            const instance = selected();
            if (!instance) return 'Select a product first.';
            try {
                const edited = editPreviewDimension(
                    instance.envelope,
                    instance.wall,
                    instance.params.wallHeightMm,
                    field,
                    value,
                    instance.lockedDimensions
                );
                updateInstance(instance, { ...instance.params, widthMm: edited.envelope.widthMm }, edited.envelope);
                if (detailId === instance.id) {
                    refreshDetail?.();
                }
                renderCards();
                return undefined;
            } catch (error) {
                return error instanceof Error ? error.message : 'Unable to update this product.';
            }
        },
        preview.setDimensionEditing,
        (field) => {
            if (isPlacing()) preview.toggleDimensionLock(field);
            else {
                const instance = selected();
                if (!instance) return;
                if (instance.lockedDimensions.has(field)) instance.lockedDimensions.delete(field);
                else instance.lockedDimensions.add(field);
                if (detailId === instance.id) refreshDetail?.();
                onChange?.();
            }
        }
    );

    const parameterLocked = (instance: PlacedProduct, key: keyof VarendaParams) =>
        key === 'widthMm' ? instance.lockedDimensions.has('width') : instance.lockedParameters.has(key);
    const parameterMeasurements = createProductParameterMeasurements(app, overlay, project, () => {
        const instance = selected();
        if (!placementActive || !detailId || !instance || parameterTab.getAttribute('aria-pressed') !== 'true')
            return undefined;
        return { wall: instance.wall, envelope: instance.envelope, params: instance.params,
            locked: new Set(productParameterLabels.map(([key]) => key).filter((key) => parameterLocked(instance, key))) };
    }, (key, value) => editDetailParameter?.(key, value), (key) => {
        const instance = selected();
        if (!instance) return;
        if (key === 'widthMm') {
            if (instance.lockedDimensions.has('width')) instance.lockedDimensions.delete('width');
            else instance.lockedDimensions.add('width');
        } else if (instance.lockedParameters.has(key)) instance.lockedParameters.delete(key);
        else instance.lockedParameters.add(key);
        refreshDetail?.();
        onChange?.();
    });

    const button = (label: string, action: () => void) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.textContent = label;
        element.onclick = action;
        return element;
    };
    const showPlacementPage = (customizing: boolean) => {
        overview.hidden = customizing;
        detail.hidden = !customizing;
        editNavigation.hidden = !customizing;
        exitEdit.hidden = !customizing;
        productionTab.hidden = !customizing;
        siteBack.hidden = !placementActive || customizing;
        if (!placementActive) return;
        const heading = document.querySelector<HTMLElement>('#step-heading')!;
        const title = document.querySelector<HTMLElement>('#step-title')!;
        const description = document.querySelector<HTMLElement>('#step-description')!;
        heading.textContent = customizing ? 'STEP 02 / PRODUCT CUSTOMIZATION' : 'STEP 02 / PRODUCT PLACEMENT';
        title.textContent = customizing ? 'Customize your product.' : 'Place your product.';
        description.textContent = customizing
            ? 'Refine this product within your site.'
            : 'Select a product, then choose an available area.';
    };
    const iconButton = (label: string, path: string, action: () => void, danger = false) => {
        const element = button('', action);
        element.className = danger ? 'product-icon-button delete-product' : 'product-icon-button';
        element.setAttribute('aria-label', label);
        element.title = label;
        element.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        return element;
    };
    const syncDetailContext = () => {
        const isolated = placementActive && Boolean(detailId) && Boolean(selectedRow || partSelection);
        for (const instance of instances.values()) instance.view.root.enabled = !isolated || instance.id === detailId;
        setContextVisible?.(!isolated);
    };
    const closeDetail = () => {
        if (detailId) onEditModeChange?.(false);
        for (const instance of instances.values()) {
            instance.view.clearSelection();
            instance.view.setGlazingDetailVisible(false);
            instance.view.setFastenerAxesVisible(false);
        }
        detailId = undefined;
        refreshDetail = undefined;
        editDetailParameter = undefined;
        showPlacementPage(false);
        partSelection = undefined;
        selectedRow = undefined;
        menus.clear();
        syncDetailContext();
    };
    const findComponent = (data: ReturnType<typeof solveVarenda>['componentData'], id?: string) => {
        const visit = (node: typeof data.root): typeof data.root | undefined => {
            if ((node.kind === 'assembly' ? node.id : node.instanceId) === id) return node;
            if (node.kind === 'assembly') for (const child of node.children) {
                const found = visit(child);
                if (found) return found;
            }
            return undefined;
        };
        return visit(data.root);
    };
    const applyComponentSelection = (instance: PlacedProduct, data: ReturnType<typeof solveVarenda>['componentData']) => {
        const node = findComponent(data, selectedRow);
        if (!node) {
            selectedRow = undefined;
            partSelection = undefined;
            instance.view.clearSelection();
            return undefined;
        }
        const ids = containedInstanceIds(node).flatMap(id => componentGeometryIds(id, data));
        partSelection = ids.length ? { id: ids[0], path: [ids[0]] } : undefined;
        return instance.view.select(ids, [], false);
    };
    const renderDetailParts = (instance: PlacedProduct, host: HTMLElement) => {
        syncDetailContext();
        const data = solveVarenda(instance.params).componentData;
        if (detailMode === 'production') {
            const rows = componentProductionRows(data);
            renderProductionList(host, rows, selectedRow, id => {
                const row = rows.find(row => row.id === id);
                if (!row) return;
                if (menus.has(id)) menus.delete(id);
                else menus.set(id, new Set());
                selectedRow = id;
                partSelection = undefined;
                focus?.(instance.view.select(row.instanceIds.flatMap(part => componentGeometryIds(part, data)), [], false));
                renderDetailParts(instance, host);
            }, partSelection, id => {
                const row = rows.find(row => row.instanceIds.includes(id));
                selectedRow = row?.id;
                partSelection = { id, path: [id] };
                focus?.(instance.view.select(componentGeometryIds(id, data), [], false), true);
                renderDetailParts(instance, host);
            }, menus, new Map(), data, true);
            return;
        }
        renderComponentTree(host, data, new Set(menus.keys()), selectedRow, id => {
            const node = findComponent(data, id);
            if (!node) return;
            if (selectedRow === id) {
                const parentOf = (current: typeof data.root): typeof data.root | undefined => {
                    if (current.kind !== 'assembly') return undefined;
                    if (current.children.some(child => (child.kind === 'assembly' ? child.id : child.instanceId) === id)) return current;
                    for (const child of current.children) {
                        const parent = parentOf(child);
                        if (parent) return parent;
                    }
                    return undefined;
                };
                const parent = parentOf(data.root);
                selectedRow = parent && parent !== data.root && parent.kind === 'assembly' ? parent.id : undefined;
                if (selectedRow) focus?.(applyComponentSelection(instance, data));
                else {
                    partSelection = undefined;
                    instance.view.clearSelection();
                    syncDetailContext();
                    focus?.(instance.view.getBounds());
                }
                renderDetailParts(instance, host);
                return;
            }
            // Keep the selected containment path visible.
            const reveal = (current: typeof data.root): boolean => {
                if ((current.kind === 'assembly' ? current.id : current.instanceId) === id) return true;
                if (current.kind === 'assembly' && current.children.some(reveal)) {
                    menus.set(current.id, new Set());
                    return true;
                }
                return false;
            };
            reveal(data.root);
            selectedRow = id;
            focus?.(applyComponentSelection(instance, data), node.kind !== 'assembly');
            renderDetailParts(instance, host);
        }, id => {
            if (menus.has(id)) menus.delete(id);
            else menus.set(id, new Set());
            renderDetailParts(instance, host);
        });
    };
    const openDetail = (instance: PlacedProduct) => {
        selectedProduct = undefined;
        closeDetail();
        selectedId = instance.id;
        detailId = instance.id;
        onEditModeChange?.(true);
        instance.view.setFastenerAxesVisible(true);
        syncPlacementMode();
        refreshAvailableAreas();
        renderCards();
        detailContent.replaceChildren();
        showPlacementPage(true);
        const fields = document.createElement('div');
        fields.className = 'placed-parameter-grid';
        const error = document.createElement('p');
        error.className = 'placement-edit-error';
        error.setAttribute('role', 'status');
        const inputs = new Map<keyof VarendaParams, HTMLInputElement>();
        for (const [key, label] of productParameterLabels) {
            const wrapper = document.createElement('label');
            wrapper.textContent = `${label} (mm)`;
            const input = document.createElement('input');
            input.type = 'number';
            input.step = '100';
            input.value = String(instance.params[key]);
            inputs.set(key, input);
            wrapper.append(input);
            fields.append(wrapper);
        }
        const parameters = document.createElement('section');
        parameters.className = 'product-parameter-panel';
        parameters.append(fields, error);
        const partsPanel = document.createElement('section');
        partsPanel.className = 'product-parts-panel';
        partsPanel.hidden = true;
        const parts = document.createElement('div');
        parts.className = 'placed-parts-list';
        const showAllParts = () => {
            instance.view.clearSelection();
            selectedRow = undefined;
            partSelection = undefined;
            menus.clear();
            renderDetailParts(instance, parts);
            focus?.(instance.view.getBounds());
        };
        const updateParameters = (nextParams?: VarendaParams): string | undefined => {
            try {
                const params = nextParams ?? { ...instance.params };
                if (!nextParams)
                    for (const [key, input] of inputs) params[key] = input.value.trim() === '' ? NaN : input.valueAsNumber;
                for (const [key] of inputs)
                    if (parameterLocked(instance, key) && params[key] !== instance.params[key])
                        throw new Error('This parameter is locked. Unlock it before editing.');
                const widthChanged = params.widthMm !== instance.params.widthMm;
                const envelope = widthChanged
                    ? editPreviewDimension(instance.envelope, instance.wall, instance.params.wallHeightMm,
                        'width', params.widthMm, instance.lockedDimensions).envelope
                    : instance.envelope;
                updateInstance(instance, params, { ...envelope, depthMm: params.depthMm });
                const data = solveVarenda(params).componentData;
                for (const id of menus.keys()) if (!findComponent(data, id)) menus.delete(id);
                applyComponentSelection(instance, data);
                for (const [key, input] of inputs) input.value = String(instance.params[key]);
                error.textContent = '';
                renderCards();
                renderDetailParts(instance, parts);
            } catch (cause) {
                for (const [key, input] of inputs) input.value = String(instance.params[key]);
                error.textContent = cause instanceof Error ? cause.message : 'Invalid product parameters.';
                return error.textContent;
            }
        };
        refreshDetail = () => {
            for (const [key, input] of inputs) input.value = String(instance.params[key]);
            for (const [key, input] of inputs) input.disabled = parameterLocked(instance, key);
            applyComponentSelection(instance, solveVarenda(instance.params).componentData);
            renderDetailParts(instance, parts);
        };
        for (const [key, input] of inputs) input.disabled = parameterLocked(instance, key);
        editDetailParameter = (key, value) => updateParameters({ ...instance.params, [key]: value });
        for (const [key, input] of inputs) {
            input.oninput = () => {
                if (input.value.trim() === '' || !Number.isFinite(input.valueAsNumber)) return;
                updateParameters({ ...instance.params, [key]: input.valueAsNumber });
            };
            input.onblur = () => {
                input.value = String(instance.params[key]);
            };
        }
        const setTab = (mode: typeof detailMode) => {
            detailMode = mode;
            parameters.hidden = mode !== 'parameters';
            partsPanel.hidden = mode === 'parameters';
            parameterTab.setAttribute('aria-pressed', String(mode === 'parameters'));
            partsTab.setAttribute('aria-pressed', String(mode === 'components'));
            productionTab.setAttribute('aria-pressed', String(mode === 'production'));
            showAllParts();
        };
        exitEdit.onclick = () => {
            closeDetail();
            selectedId = instance.id;
            focus?.(placementBounds(instance));
            renderCards();
        };
        parameterTab.onclick = () => setTab('parameters');
        partsTab.onclick = () => setTab('components');
        productionTab.onclick = () => setTab('production');
        detailMode = 'parameters';
        productionTab.setAttribute('aria-pressed', 'false');
        parameterTab.setAttribute('aria-pressed', 'true');
        partsTab.setAttribute('aria-pressed', 'false');
        const glazing = document.createElement('label');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.onchange = () => instance.view.setGlazingDetailVisible(check.checked);
        glazing.append(check, document.createTextNode(' Show glazing detail'));
        partsPanel.append(glazing, parts);
        detailContent.append(parameters, partsPanel);
        renderDetailParts(instance, parts);
        focus?.(instance.view.getBounds());
    };
    function renderCards() {
        list.replaceChildren();
        empty.hidden = instances.size > 0;
        for (const instance of instances.values()) {
            const card = document.createElement('article');
            card.className = 'placed-product-card';
            card.classList.toggle('selected', instance.id === selectedId);
            const select = button('', () => {
                selectedProduct = undefined;
                closeDetail();
                selectedId = selectedId === instance.id ? undefined : instance.id;
                syncPlacementMode();
                refreshAvailableAreas();
                renderCards();
                focus?.(selectedId ? placementBounds(instance) : undefined, Boolean(selectedId));
            });
            select.className = 'placed-product-select';
            select.setAttribute('aria-pressed', String(instance.id === selectedId));
            const icon = productButton.querySelector('.product-placeholder')!.cloneNode(true);
            const caption = document.createElement('span');
            const name = document.createElement('strong');
            name.textContent = instance.name;
            const dimensions = document.createElement('span');
            dimensions.textContent = `${instance.wall.side} · ${instance.params.widthMm / 1000} × ${instance.params.depthMm / 1000} m`;
            caption.append(name, dimensions);
            select.append(icon, caption);
            card.append(select);
            if (instance.id === selectedId) {
                const actions = document.createElement('div');
                actions.className = 'product-card-actions';
                actions.append(
                    iconButton(`Edit ${instance.name}`, 'M15 4l5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16z', () =>
                        openDetail(instance)
                    ),
                    iconButton(
                        `Delete ${instance.name}`,
                        'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
                        () => {
                            closeDetail();
                            instance.view.destroy();
                            instances.delete(instance.id);
                            selectedId = undefined;
                            focus?.(undefined);
                            renderCards();
                            refreshAvailableAreas();
                            onChange?.();
                        },
                        true
                    )
                );
                card.append(actions);
            }
            list.append(card);
        }
    }
    const followPointer = (event: PointerEvent) => {
        if (event.pointerType === 'touch' || !isPlacing() || committing) return;
        const bounds = viewport.getBoundingClientRect();
        pointerInside = true;
        cursorIcon.style.left = `${event.clientX - bounds.left - 8}px`;
        cursorIcon.style.top = `${event.clientY - bounds.top - 6}px`;
        const canvas = viewport.querySelector('canvas')!;
        if ((event.target as Element).closest('.editable-measurement') || measurements.isEditing()) return;
        preview.setDimensionEditing(false);
        if (event.target !== canvas) {
            preview.leave();
            return;
        }
        cursorIcon.hidden = false;
        const rect = canvas.getBoundingClientRect();
        preview.move(event.clientX - rect.left, event.clientY - rect.top);
    };
    let pressed: { x: number; y: number } | undefined;
    const pointerDown = (event: PointerEvent) => {
        if (event.button === 0 && event.target === viewport.querySelector('canvas'))
            pressed = { x: event.clientX, y: event.clientY };
    };
    const confirm = async (event: PointerEvent) => {
        const down = pressed;
        pressed = undefined;
        if (
            !down ||
            Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5 ||
            !isPlacing() ||
            committing ||
            measurements.isEditing() ||
            event.target !== viewport.querySelector('canvas')
        )
            return;
        const canvas = viewport.querySelector('canvas')!,
            rect = canvas.getBoundingClientRect();
        preview.setDimensionEditing(false);
        preview.move(event.clientX - rect.left, event.clientY - rect.top);
        const state = preview.getDimensionState();
        if (!state) return;
        const params = { ...preview.getParams(), widthMm: state.envelope.widthMm, depthMm: state.envelope.depthMm };
        const id = `varenda-${++serial}`;
        const envelope = { ...state.envelope, instanceId: id };
        committing = true;
        syncPlacementMode();
        showFeedback('Placing Varenda…');
        let failure: string | undefined;
        try {
            const instance = await buildInstance({ id, name: `Varenda ${serial}`, wall: state.wall, envelope, params, lockedDimensions: preview.getDimensionLocks(), lockedParameters: new Set<keyof VarendaParams>() });
            if (!instance) return;
            selectedId = undefined;
            selectedProduct = undefined;
            closeDetail();
            renderCards();
            showFeedback();
            onChange?.();
        } catch (error) {
            failure = error instanceof Error ? error.message : 'Unable to place Varenda.';
        } finally {
            committing = false;
            if (!disposed) {
                syncPlacementMode();
                refreshAvailableAreas();
                if (failure) showFeedback(failure);
            }
        }
    };
    const leaveViewport = () => {
        pointerInside = false;
        preview.leave();
        cursorIcon.hidden = true;
    };
    const cancelPlacement = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || !selectedProduct || committing) return;
        selectedProduct = undefined;
        syncPlacementMode();
        refreshAvailableAreas();
    };
    viewport.addEventListener('pointermove', followPointer);
    viewport.addEventListener('pointerleave', leaveViewport);
    viewport.addEventListener('pointerdown', pointerDown);
    viewport.addEventListener('pointerup', confirm);
    window.addEventListener('keydown', cancelPlacement);
    renderCards();

    return {
        refresh() {
            refreshAvailableAreas();
            preview.refresh();
        },
        setProduct(product: 'varenda' | undefined) {
            if (committing) return;
            closeDetail();
            selectedProduct = product;
            if (product) {
                selectedId = undefined;
                preview.reset();
                focus?.(undefined);
            }
            renderCards();
            syncPlacementMode();
            refreshAvailableAreas();
        },
        toggleProduct(product: 'varenda') {
            if (committing) return;
            closeDetail();
            selectedProduct = selectedProduct === product ? undefined : product;
            if (selectedProduct) {
                selectedId = undefined;
                preview.reset();
                focus?.(undefined);
            }
            renderCards();
            syncPlacementMode();
            refreshAvailableAreas();
        },
        setPlacementActive(active: boolean) {
            placementActive = active;
            siteBack.hidden = !active || Boolean(detailId);
            if (!active) {
                selectedProduct = undefined;
                closeDetail();
            }
            syncPlacementMode();
            refreshAvailableAreas();
        },
        refreshLabels() {
            preview.refresh();
        },
        /** Placed products in creation order, in the project file's `products` format. */
        snapshot(): ProductRecord[] {
            return [...instances.values()].map((instance) => ({
                instanceId: instance.id,
                productType: 'varenda',
                name: instance.name,
                attachment: {
                    wallFaceId: instance.envelope.attachment.wallFaceId,
                    alongWallOffsetMm: instance.envelope.attachment.alongWallOffsetMm
                },
                params: { ...instance.params },
                lockedDimensions: [...instance.lockedDimensions],
                lockedParameters: [...instance.lockedParameters]
            }));
        },
        /** Re-creates saved products without notifying onChange; records that fail validation are skipped. */
        async restore(records: ProductRecord[]): Promise<{ restored: number; skipped: number }> {
            let restored = 0;
            let skipped = 0;
            for (const record of records) {
                const suffix = Number(/(\d+)$/.exec(record.instanceId)?.[1]);
                if (Number.isFinite(suffix)) serial = Math.max(serial, suffix);
                const wall = faces.find((face) => face.wallFaceId === record.attachment.wallFaceId);
                if (!wall || record.productType !== 'varenda' || instances.has(record.instanceId)) {
                    skipped++;
                    continue;
                }
                const envelope: CustomizableEnvelope = {
                    instanceId: record.instanceId,
                    productType: 'varenda',
                    attachment: {
                        kind: 'wall',
                        structureId: 'house-1',
                        wallFaceId: record.attachment.wallFaceId,
                        alongWallOffsetMm: record.attachment.alongWallOffsetMm
                    },
                    widthMm: record.params.widthMm,
                    depthMm: record.params.depthMm
                };
                try {
                    const instance = await buildInstance({
                        id: record.instanceId,
                        name: record.name,
                        wall,
                        envelope,
                        params: record.params,
                        lockedDimensions: new Set(record.lockedDimensions as PreviewDimensionKey[]),
                        lockedParameters: new Set(record.lockedParameters as (keyof VarendaParams)[])
                    });
                    if (!instance) break;
                    restored++;
                } catch {
                    skipped++;
                }
            }
            if (!disposed) {
                renderCards();
                refreshAvailableAreas();
            }
            return { restored, skipped };
        },
        getProductBounds(id: string) {
            return instances.get(id)?.view.getBounds();
        },
        focusBasis,
        focusBounds: () => {
            const instance = selected();
            if (!placementActive || isPlacing() || !instance) return undefined;
            return focusedBounds ?? placementBounds(instance);
        },
        destroy() {
            disposed = true;
            setContextVisible?.(true);
            viewport.removeEventListener('pointermove', followPointer);
            viewport.removeEventListener('pointerleave', leaveViewport);
            viewport.removeEventListener('pointerdown', pointerDown);
            viewport.removeEventListener('pointerup', confirm);
            window.removeEventListener('keydown', cancelPlacement);
            exitEdit.onclick = null;
            parameterTab.onclick = null;
            partsTab.onclick = null;
            productionTab.remove();
            viewport.classList.remove('is-placing-product');
            measurements.destroy();
            parameterMeasurements.destroy();
            preview.destroy();
            availableAreas.destroy();
            for (const instance of instances.values()) instance.view.destroy();
            instances.clear();
            assets.destroy();
            feedback.remove();
            cursorIcon.remove();
        }
    };
}
