import {
    AppBase,
    AppOptions,
    CameraComponentSystem,
    Color,
    ContainerHandler,
    Entity,
    FILLMODE_FILL_WINDOW,
    LightComponentSystem,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    TextureHandler,
    createGraphicsDevice,
    BoundingBox,
} from 'playcanvas';

import type { ContainerResource } from 'playcanvas';

import './style.css';

const canvas = document.getElementById('application-canvas') as HTMLCanvasElement;

const device = await createGraphicsDevice(canvas);
device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

const createOptions = new AppOptions();
createOptions.graphicsDevice = device;
createOptions.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem];
createOptions.resourceHandlers = [TextureHandler, ContainerHandler];

const app = new AppBase(canvas);
app.init(createOptions);
app.start();

// Set the canvas to fill the window and automatically change resolution to be the same as the canvas size
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);

// Ensure canvas is resized when window changes size
const resize = () => app.resizeCanvas();
window.addEventListener('resize', resize);
app.on('destroy', () => {
    window.removeEventListener('resize', resize);
});


// Create camera entity
const camera = new Entity('camera');
camera.addComponent('camera', {
    clearColor: new Color(0.5, 0.6, 0.9)
});
camera.setPosition(0, 0, 3);
app.root.addChild(camera);

// Create directional light entity
const light = new Entity('light');
light.addComponent('light');
light.setEulerAngles(45, 0, 0);
app.root.addChild(light);


// load glb house model
// 给没有被直射光照到的表面一点基础亮度
app.scene.ambientLight = new Color(0.35, 0.35, 0.35);

app.assets.loadFromUrl('/models/house.glb', 'container', (err, asset) => {
    if (err || !asset) {
        console.error('failed to load house model:', err);
        return;
    }

    // 资源是模型数据；实例化后才是可以加入场景的对象
    const resource = asset.resource as ContainerResource;
    const house = resource.instantiateRenderEntity();

    house.name = 'House';
    app.root.addChild(house);

    let bounds: BoundingBox | undefined;

    house.forEach((entity) => {
        if (!(entity instanceof Entity) || !entity.render) return;

        for (const mesh of entity.render.meshInstances) {
            if (!bounds) {
                bounds = mesh.aabb.clone();
            } else {
                bounds.add(mesh.aabb);
            }
        }
    });

    if (!bounds || !camera.camera) return;
    const center = bounds.center;
    const radius = Math.max(bounds.halfExtents.length(), 0.01);

    // 同时考虑横屏和竖屏，留出一些边距
    const verticalFov = camera.camera.fov * Math.PI / 180;
    const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
    const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2);

    const direction = new Entity(); // 不需要加入场景；这里只是避免手算方向也可用 Vec3
    direction.destroy();

    camera.setPosition(
        center.x + distance,
        center.y + distance * 0.6,
        center.z + distance
    );

    camera.camera.nearClip = Math.max(radius / 1000, 0.001);
    camera.camera.farClip = distance * 4 + radius;
    camera.lookAt(center);

    console.log('Fariy House Added: ', house);
});