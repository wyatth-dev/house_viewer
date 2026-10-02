import { Color, Entity } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import type { VarendaParams } from '../products/parametric-engine/varenda/parameters.ts';
import { fitPerspective } from '../shared/camera/framing.ts';

export function createProductCamera(app: AppBase, canvas: HTMLCanvasElement, getParams: () => VarendaParams) {
    let destroyed = false;
    const camera = new Entity('Lab camera');
    camera.addComponent('camera', {
        clearColor: new Color(0.9, 0.92, 0.94),
        nearClip: 1,
        farClip: 10000
    });
    app.root.addChild(camera);

    // Camera: parameter input never refits; Overview and window resizing do.
    const fitProduct = () => {
        if (destroyed) return;
        const params = getParams();

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;

        const frame = fitPerspective(
            {
                min: {
                    x: -params.widthMm / 2 - 100,
                    y: 0,
                    z: -100
                },
                max: {
                    x: params.widthMm / 2 + 100,
                    y: Math.max(params.undersideHeightMm + 150, params.wallHeightMm + 150),
                    z: params.depthMm + 100
                }
            },
            { width, height },
            { x: 0.2, y: 0.7, z: 1 },
            45
        );

        camera.setPosition(frame.position.x, frame.position.y, frame.position.z);

        camera.lookAt(frame.center.x, frame.center.y, frame.center.z);

        camera.camera!.nearClip = frame.near;
        camera.camera!.farClip = frame.far;
    };

    const fitButton = document.querySelector<HTMLButtonElement>('#fit-product')!;

    fitButton.addEventListener('click', fitProduct);

    return {
        entity: camera,
        fit: fitProduct,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            fitButton.removeEventListener('click', fitProduct);
            camera.destroy();
        }
    };
}
