import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);

/** Stylesheets in the order Foundry loads them (module.json "styles"). */
export const stylesheetPaths=()=>JSON.parse(readFileSync(new URL('module.json',root),'utf8')).styles;

/** The full module stylesheet, as the browser cascades it. */
export const readCssBundle=()=>stylesheetPaths().map(path=>readFileSync(new URL(path,root),'utf8').replace(/\r\n/g,'\n')).join('\n');
