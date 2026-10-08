/**
 * 照片录入页（intake.html）：上传照片 → 自动建模 → 提交后自动保存为 typology。
 * 轮询项目状态，有新版本时加载模型与尺寸标注。?project=<id> 打开已有项目。
 */
import { fileUrl, getProject, publish, runAgain } from './api.ts';
import type { ProjectSummary } from './api.ts';
import { el } from './panels/dom.ts';
import { createPhotosPanel } from './panels/photos-panel.ts';
import { createStatusPanel } from './panels/status-panel.ts';
import { createUploadPanel } from './panels/upload-panel.ts';
import type { Annotation } from './scene/annotations.ts';
import { createScene } from './scene/app.ts';
import { cameraPresets } from './scene/camera-presets.ts';
import { REPRESENTATIONS } from './scene/facade-model.ts';
import './style.css';

const POLL_MS = 2000;

async function start() {
    const viewport = document.querySelector<HTMLElement>('#viewport')!;
    const status = document.querySelector<HTMLElement>('#scene-status')!;
    const scene = await createScene(
        document.querySelector<HTMLCanvasElement>('#application-canvas')!,
        viewport,
        document.querySelector<HTMLElement>('#measurements')!
    );
    const statusPanel = createStatusPanel(document.querySelector<HTMLElement>('#status-panel')!, {
        runAgain: async (id) => {
            await runAgain(id);
            await refresh();
        },
        publish: async (id) => {
            await publish(id);
            await refresh();
        }
    });
    const photosPanel = createPhotosPanel(document.querySelector<HTMLElement>('#photos-panel')!);
    let projectId: string | null = new URLSearchParams(window.location.search).get('project');
    let shownBuild: string | null = null;

    const refresh = async () => {
        let summary: ProjectSummary | null = null;
        if (projectId) summary = await getProject(projectId).catch(() => null);
        statusPanel.update(summary);
        photosPanel.update(projectId, summary?.photos ?? []);
        const buildKey = summary?.buildDir ? `${summary.id}/${summary.buildDir}` : null;
        if (!summary || !buildKey) {
            status.textContent = !projectId
                ? 'Upload photos to start'
                : summary?.job?.state === 'failed'
                  ? 'Modelling failed — see Model status'
                  : summary?.job
                    ? 'Modelling this facade… the model appears here when the first version is built'
                    : 'Waiting for the first version…';
            status.hidden = false;
            return;
        }
        if (buildKey === shownBuild) return;
        const buildUrl = fileUrl(summary.id, summary.buildDir!);
        const annotations = (await (await fetch(`${buildUrl}/annotations.json`)).json()) as Annotation[];
        await scene.showBuild(buildUrl, annotations);
        shownBuild = buildKey;
        status.hidden = true;
    };
    const upload = createUploadPanel(document.querySelector<HTMLElement>('#upload-panel')!, (id) => {
        projectId = id;
        const url = new URL(window.location.href);
        if (id) url.searchParams.set('project', id);
        else url.searchParams.delete('project');
        window.history.replaceState(null, '', url);
        void refresh();
    });
    await upload.refreshProjects(projectId);

    // 视图控制：表示切换、视角、洞口尺寸开关
    const modes = el('div', { className: 'segmented', ariaLabel: 'Representation' });
    for (const [mode, label] of REPRESENTATIONS) {
        const button = el('button', { type: 'button' }, label);
        button.setAttribute('aria-pressed', String(mode === 'render'));
        button.onclick = () => {
            scene.setRepresentation(mode);
            for (const other of modes.children) other.setAttribute('aria-pressed', String(other === button));
        };
        modes.append(button);
    }
    const views = el('div', { className: 'segmented', ariaLabel: 'View' });
    for (const preset of cameraPresets) {
        const button = el('button', { type: 'button' }, preset.label);
        button.onclick = () => scene.setView(preset.id);
        views.append(button);
    }
    const openings = el('input', { type: 'checkbox', checked: true });
    openings.onchange = () => scene.setOpeningDimensionsVisible(openings.checked);
    viewport.append(el('div', { className: 'scene-controls' }, modes, views, el('label', { className: 'toggle' }, openings, 'Opening dimensions')));

    const loop = async () => {
        try {
            await refresh();
        } catch (error) {
            console.error(error);
        }
        window.setTimeout(loop, POLL_MS);
    };
    void loop();
}

void start().catch((error) => {
    console.error(error);
    const status = document.querySelector<HTMLElement>('#scene-status')!;
    status.textContent = `The photo intake page could not start: ${(error as Error).message}`;
    status.hidden = false;
});
