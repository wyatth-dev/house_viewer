import type { AppBase } from 'playcanvas';

import { groupProductionRows } from '../customization/production-groups.ts';
import { renderProductionList } from '../customization/production-list.ts';
import {
    toggleInstance,
    reconcileSelection,
    selectionContext,
    toggleGroup
} from '../customization/selection-state.ts';
import type { InstanceSelection } from '../customization/selection-state.ts';
import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import { buildProductionList } from '../products/parametric-engine/varenda/production-list.ts';
import { buildInstallationMenus } from '../products/parametric-engine/varenda/production-relations.ts';
import { solveVarenda } from '../products/parametric-engine/varenda/solution.ts';
import { createVarendaView } from '../products/varenda/view/varenda-view.ts';
import type { VarendaView } from '../products/varenda/view/varenda-view.ts';
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
    onFocus?: (bounds: Bounds3 | undefined, basis?: CameraBasis) => void,
    setContextVisible?: (visible: boolean) => void
) {
    let placementActive = false;
    let selectedProduct: 'varenda' | undefined;
    let pointerInside = false;
    let selectedId: string | undefined;
    let detailId: string | undefined;
    let productionVisible = false;
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
    const production = document.querySelector<HTMLElement>('#placed-production-list')!;
    const productionButton = document.querySelector<HTMLButtonElement>('#placement-production')!;

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
    const preview = createPlacementPreview(
        app,
        houseInstallationFaces,
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
    const focus = (bounds: Bounds3 | undefined) => {
        focusedBounds = bounds;
        onFocus?.(bounds, bounds ? focusBasis() : undefined);
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
            solveInstallationAreas(houseInstallationFaces, getProperty(), occupied()).map((area) => area.corners)
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
        if (!placementActive || detailId || productionVisible) return undefined;
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
        if (selectedId === instance.id && !detailId) focus?.(placementBounds(instance));
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
                    focus?.(instance.view.getBounds());
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
    const closeProduction = () => {
        productionVisible = false;
        production.hidden = true;
    };
    const renderDetailParts = (instance: PlacedProduct, host: HTMLElement) => {
        syncDetailContext();
        const solution = solveVarenda(instance.params);
        const rows = groupProductionRows(buildProductionList(solution));
        const installations = buildInstallationMenus(solution);
        renderProductionList(
            host,
            rows,
            selectedRow,
            (id) => {
                toggleGroup(menus, id);
                selectedRow = menus.has(id) ? id : undefined;
                partSelection = undefined;
                const row = rows.find((candidate) => candidate.id === selectedRow);
                if (row) focus?.(instance.view.select(row.instanceIds));
                else {
                    instance.view.clearSelection();
                    focus?.(instance.view.getBounds());
                }
                renderDetailParts(instance, host);
            },
            partSelection,
            (id, navigation = 'direct', menuId, parentId) => {
                selectedRow = menuId;
                if (menuId && navigation === 'direct') {
                    const wasOpen = menus.get(menuId)?.has(id) ?? false;
                    menus.set(menuId, new Set(wasOpen ? [] : [id]));
                }
                partSelection = toggleInstance(partSelection, id, navigation, parentId);
                const row = rows.find((candidate) => candidate.id === selectedRow);
                focus?.(instance.view.select(
                    partSelection ? [partSelection.id] : row?.instanceIds ?? [],
                    selectionContext(partSelection, row?.instanceIds ?? [])
                ));
                renderDetailParts(instance, host);
            },
            menus,
            installations
        );
    };
    const openDetail = (instance: PlacedProduct) => {
        selectedProduct = undefined;
        closeProduction();
        closeDetail();
        selectedId = instance.id;
        detailId = instance.id;
        instance.view.setFastenerAxesVisible(true);
        syncPlacementMode();
        refreshAvailableAreas();
        renderCards();
        detailContent.replaceChildren();
        showPlacementPage(true);
        const heading = document.createElement('h3');
        heading.textContent = `${instance.name} · Detail edit`;
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
                const rows = groupProductionRows(buildProductionList(solveVarenda(params)));
                for (const [menuId, ids] of menus) {
                    if (!rows.some((row) => row.id === menuId)) menus.delete(menuId);
                    else for (const id of ids) if (!rows.some((row) => row.instanceIds.includes(id))) ids.delete(id);
                }
                const retained = reconcileSelection(rows, selectedRow);
                selectedRow = retained?.id;
                if (!retained || !rows.some((row) => row.instanceIds.includes(partSelection?.id ?? '')))
                    partSelection = undefined;
                if (partSelection)
                    partSelection = {
                        ...partSelection,
                        path: partSelection.path.filter((id) => rows.some((row) => row.instanceIds.includes(id)))
                    };
                const bounds = retained
                    ? instance.view.select(
                          partSelection ? [partSelection.id] : retained.instanceIds,
                          selectionContext(partSelection, retained.instanceIds)
                      )
                    : instance.view.getBounds();
                focus?.(bounds ?? instance.view.getBounds());
                for (const [key, input] of inputs) input.value = String(instance.params[key]);
                error.textContent = '';
                renderCards();
                renderDetailParts(instance, parts);
            } catch (cause) {
                error.textContent = cause instanceof Error ? cause.message : 'Invalid product parameters.';
                return error.textContent;
            }
        };
        refreshDetail = () => {
            for (const [key, input] of inputs) input.value = String(instance.params[key]);
            for (const [key, input] of inputs) input.disabled = parameterLocked(instance, key);
            const rows = groupProductionRows(buildProductionList(solveVarenda(instance.params)));
            const retained = reconcileSelection(rows, selectedRow);
            if (retained) instance.view.select(partSelection ? [partSelection.id] : retained.instanceIds,
                selectionContext(partSelection, retained.instanceIds));
            renderDetailParts(instance, parts);
        };
        for (const [key, input] of inputs) input.disabled = parameterLocked(instance, key);
        editDetailParameter = (key, value) => updateParameters({ ...instance.params, [key]: value });
        for (const input of inputs.values()) input.oninput = () => updateParameters();
        const setTab = (showParts: boolean) => {
            parameters.hidden = showParts;
            partsPanel.hidden = !showParts;
            parameterTab.setAttribute('aria-pressed', String(!showParts));
            partsTab.setAttribute('aria-pressed', String(showParts));
            if (!showParts) showAllParts();
        };
        exitEdit.onclick = () => {
            closeDetail();
            selectedId = instance.id;
            focus?.(placementBounds(instance));
            renderCards();
        };
        parameterTab.onclick = () => setTab(false);
        partsTab.onclick = () => setTab(true);
        parameterTab.setAttribute('aria-pressed', 'true');
        partsTab.setAttribute('aria-pressed', 'false');
        const glazing = document.createElement('label');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.onchange = () => instance.view.setGlazingDetailVisible(check.checked);
        glazing.append(check, document.createTextNode(' Show glazing detail'));
        partsPanel.append(glazing, parts);
        detailContent.append(heading, parameters, partsPanel);
        renderDetailParts(instance, parts);
        focus?.(instance.view.getBounds());
    };
    function renderCards() {
        list.replaceChildren();
        empty.hidden = instances.size > 0;
        productionButton.disabled = instances.size === 0;
        for (const instance of instances.values()) {
            const card = document.createElement('article');
            card.className = 'placed-product-card';
            card.classList.toggle('selected', instance.id === selectedId);
            const select = button('', () => {
                selectedProduct = undefined;
                closeDetail();
                closeProduction();
                selectedId = selectedId === instance.id ? undefined : instance.id;
                syncPlacementMode();
                refreshAvailableAreas();
                renderCards();
                focus?.(selectedId ? placementBounds(instance) : undefined);
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
                            closeProduction();
                            instance.view.destroy();
                            instances.delete(instance.id);
                            selectedId = undefined;
                            focus?.(undefined);
                            renderCards();
                            refreshAvailableAreas();
                        },
                        true
                    )
                );
                card.append(actions);
            }
            list.append(card);
        }
    }
    const showProduction = () => {
        selectedProduct = undefined;
        closeDetail();
        productionVisible = true;
        syncPlacementMode();
        refreshAvailableAreas();
        production.replaceChildren();
        production.hidden = false;
        const title = document.createElement('h3');
        title.textContent = 'Final production list';
        production.append(
            title,
            button('Back to placement', () => {
                closeProduction();
                focus?.(undefined);
            })
        );
        for (const instance of instances.values()) {
            const section = document.createElement('section');
            section.className = 'placed-production-product';
            const heading = document.createElement('h4');
            heading.textContent = instance.name;
            const parts = document.createElement('div');
            section.append(heading, parts);
            production.append(section);
            renderProductionList(
                parts,
                groupProductionRows(buildProductionList(solveVarenda(instance.params))),
                undefined,
                () => openDetail(instance)
            );
        }
    };
    productionButton.onclick = showProduction;
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
        let view: VarendaView | undefined;
        let failure: string | undefined;
        try {
            validateEnvelope(envelope, state.wall);
            const solution = solveVarenda(params);
            view = await createVarendaView(app, assets);
            view.setFastenerAxesVisible(false);
            if (disposed || signal.aborted) {
                view.destroy();
                return;
            }
            validateEnvelope(envelope, state.wall);
            view.update(solution);
            const instance = { id, name: `Varenda ${serial}`, wall: state.wall, envelope, params: { ...params }, view, lockedDimensions: preview.getDimensionLocks(), lockedParameters: new Set<keyof VarendaParams>() };
            placeView(instance);
            instances.set(id, instance);
            selectedId = undefined;
            selectedProduct = undefined;
            closeDetail();
            closeProduction();
            renderCards();
            showFeedback();
        } catch (error) {
            view?.destroy();
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
            closeProduction();
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
            closeProduction();
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
            if (!active) {
                selectedProduct = undefined;
                closeDetail();
                closeProduction();
            }
            syncPlacementMode();
            refreshAvailableAreas();
        },
        refreshLabels() {
            preview.refresh();
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
            productionButton.onclick = null;
            exitEdit.onclick = null;
            parameterTab.onclick = null;
            partsTab.onclick = null;
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
