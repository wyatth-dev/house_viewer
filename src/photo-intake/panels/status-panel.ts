/** 状态面板：宽度、版本、LM 提交说明、问题清单。 */
import type { JobState, ProjectSummary } from '../api.ts';

import { el } from './dom.ts';

const SOURCES: Record<string, string> = { user: 'entered by user', 'photo-estimate': 'estimated by LM', 'photo-measured': 'measured from photo', default: 'default' };

export type StatusActions = { runAgain: (projectId: string) => Promise<void>; publish: (projectId: string) => Promise<void> };

export function createStatusPanel(host: HTMLElement, actions: StatusActions) {
    const body = el('div', { className: 'status-body' });
    host.append(el('h2', {}, el('span', {}, '03'), ' Model status'), body);
    return {
        update(summary: ProjectSummary | null) {
            if (!summary) {
                body.replaceChildren(el('p', { className: 'muted' }, 'Upload photos of the front of a house. Modelling starts automatically; when it is submitted, the house is saved as a typology.'));
                return;
            }
            const { width, latestBuild, status, issues } = summary;
            const widthText = width.widthMm
                ? `${(width.widthMm / 1000).toFixed(3)} m (${SOURCES[width.source ?? ''] ?? 'unknown source'})`
                : width.skipped
                  ? 'Skipped by user; waiting for the LM estimate'
                  : 'Unknown';
            body.replaceChildren(
                row('Project', summary.id),
                row(summary.facadeSide === 'front' ? 'Facade width' : `${summary.facadeSide.charAt(0).toUpperCase() + summary.facadeSide.slice(1)} wall width`, widthText),
                row('Facade side', summary.facadeSide.charAt(0).toUpperCase() + summary.facadeSide.slice(1)),
                row('Version', latestBuild ? `v${latestBuild}` : 'Not built yet'),
                row('Status', statusText(summary)),
                ...typologyDetails(summary, actions.publish),
                ...jobDetails(summary, actions.runAgain),
                ...(status.note ? [el('p', { className: 'model-note' }, status.note)] : []),
                issues.length
                    ? el('ul', { className: 'issues' }, ...issues.map((issue) => el('li', {}, issue.message)))
                    : el('p', { className: 'muted' }, 'No issues')
            );
        }
    };
}

/** 已发布：链接到 house-viewer；有 build 但没发布（例如 LM 没有提交）：给一个手动保存按钮。 */
function typologyDetails(summary: ProjectSummary, onPublish: (projectId: string) => Promise<void>): HTMLElement[] {
    const { typology, latestBuild } = summary;
    if (typology) {
        const stale = typology.buildVersion !== latestBuild;
        return [
            row('Typology', `${typology.name} (v${typology.buildVersion})`),
            ...(stale ? [publishButton(summary.id, `Update typology to v${latestBuild}`, onPublish)] : [])
        ];
    }
    if (!latestBuild || summary.job?.state === 'running' || summary.job?.state === 'queued') return [];
    return [publishButton(summary.id, 'Save as typology', onPublish)];
}

function publishButton(projectId: string, label: string, onPublish: (projectId: string) => Promise<void>) {
    const button = el('button', { type: 'button', className: 'secondary' }, label);
    button.onclick = async () => {
        button.disabled = true;
        button.textContent = 'Saving…';
        await onPublish(projectId).catch(() => undefined);
    };
    return button;
}

function row(label: string, value: string) {
    return el('div', { className: 'row' }, el('span', {}, label), el('strong', {}, value));
}

const STEP_NAMES: Record<string, string> = {
    rectify_photo: 'rectifying the photo', measure: 'measuring', estimate_width: 'estimating the width',
    add_opening: 'adding openings', update_opening: 'adjusting openings', remove_opening: 'adjusting openings',
    set_roof: 'setting the roof', set_materials: 'setting materials', build: 'building the model', submit: 'finishing'
};

/** 状态文字：自动建模任务优先，其次是 LM 是否已提交。 */
export function statusText(summary: ProjectSummary): string {
    const job = summary.job;
    if (job?.state === 'queued') return 'Starting the LM…';
    if (job?.state === 'running') {
        const step = summary.lastStep ? STEP_NAMES[summary.lastStep.tool] ?? summary.lastStep.tool : 'reading the photo';
        return `Modelling: ${step} (${elapsed(job.startedAt)})`;
    }
    if (job?.state === 'failed') return 'Modelling failed';
    if (summary.status.state === 'submitted') return summary.typology ? 'Saved as typology' : 'Submitted';
    return job?.state === 'done' ? 'Finished without submitting' : 'Waiting for the LM';
}

/** 失败时显示原因、日志末尾和 Run again 按钮；这是除上传外唯一的手动操作。 */
function jobDetails(summary: ProjectSummary, onRunAgain: (projectId: string) => Promise<void>): HTMLElement[] {
    const job: JobState | null = summary.job;
    if (!job || job.state !== 'failed') return [];
    const button = el('button', { type: 'button', className: 'primary' }, 'Run again');
    button.onclick = async () => {
        button.disabled = true;
        button.textContent = 'Starting…';
        await onRunAgain(summary.id).catch(() => undefined);
    };
    return [
        el('p', { className: 'job-error' }, job.error ?? 'The modelling run failed.'),
        ...(job.logTail ? [el('pre', { className: 'job-log' }, job.logTail)] : []),
        button
    ];
}

function elapsed(startedAt: string | null | undefined): string {
    if (!startedAt) return 'just started';
    const seconds = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
    return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
