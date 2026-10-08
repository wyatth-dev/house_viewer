// Legacy intake links enter the main application and reuse its scene and panels.
const params = new URLSearchParams(window.location.search);
const project = params.get('project');
window.location.replace(project ? `/?project=${encodeURIComponent(project)}` : '/?photo=new');
