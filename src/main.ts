import { resolveActiveTypology } from './typology/catalog.ts';
// Load the stylesheet with the entry, not with the lazily imported app chunk: a failed
// web-font request inside a lazy chunk's CSS would otherwise stop the app from starting.
import './site-definition/style.css';

// The typology must be chosen before the app modules load: house-config and
// installation-faces read the active typology when they are first imported.
const { entry, warning } = await resolveActiveTypology();
if (warning) console.warn(warning);
const { startSiteDefinition } = await import('./site-definition/start.ts');
startSiteDefinition(entry);
