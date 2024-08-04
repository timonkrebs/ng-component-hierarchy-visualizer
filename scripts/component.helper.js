import fs from 'node:fs';
import path from 'path';
import { extractRoutesFromTS } from './route.helper.js';

export const ROUTES_REGEX_LIST = [
    /.*:\s*Routes\s*=\s*(\[[\s\S]*?\]);/m,
    /.*:\s*Route\[\]\(\s*(\[[\s\S]*?\]);/m,
    /.*:\s*provideRouter\s*\(\s*(\[[\s\S]*?\])\s*(?:,\s*\{[\s\S]*?\})?\s*\)/m,
    /RouterModule\.forRoot\s*\(\s*(\[[\s\S]*?\])\s*(?:,\s*\{[\s\S]*?\})?\s*\)/m,
    /.*:\s*RouterModule.forChild\s*\(\s*(\[[\s\S]*?\])\s*(?:,\s*\{[\s\S]*?\})?\s*\)/m,
    /.*(\[[\s\S]*?\])satisfies Routes;/m,
    /.*(\[[\s\S]*?\])satisfies Route\[\];/m
];

export const flattenRoutes = (routes) =>
    routes.flatMap(r => r.children
        ? r.component || r.loadComponent
            ? [...flattenRoutes(r.children), { ...r, children: null }]
            : flattenRoutes(r.children)
        : [r]
    );

export const resolveComponents = (routes, routesFileContent, relativePath = null) => {
    const cwd = process.env.INIT_CWD ?? process.cwd();

    return routes.flatMap(r => {
        if (r.loadComponent) {

            return relativePath
                ? [{ ...r, lazy: true, type: 'component', loadComponent: path.relative(cwd, path.resolve(cwd, relativePath, r.loadComponent)) }]
                : [{ ...r, lazy: true, type: 'component', loadComponent: path.relative(cwd, path.resolve(cwd, r.loadComponent)) }];
        } else if (r.loadChildren) {
            return handleLoadChildren(r);
        } else if (r.skipLoadingDependencies) {
            return [r];
        } else {
            return handleComponent(r, routesFileContent, relativePath);
        }
    }).filter(Boolean);
};

const handleLoadChildren = (route) => {
    const cwd = process.env.INIT_CWD ?? process.cwd();
    let routesFileContent = fs.readFileSync(path.join(cwd, route.loadChildren + ".ts"), 'utf-8');

    const relativePath = path.relative(cwd, path.resolve(cwd, route.loadChildren, ".."));
    let match = ROUTES_REGEX_LIST.map(regex => routesFileContent.match(regex)).find(match => match);

    let routes = [];
    // if routes are not configured directly in the module we have to analyze the routing.module
    if (!match) {
        const matchImport = routesFileContent.match(/import\s+\{[^}]+\}\s+from\s+'(.+\/.+routing\.module)'/);
        const thisPath = path.relative(cwd, path.resolve(cwd, relativePath, matchImport[1]));
        routesFileContent = fs.readFileSync(path.join(cwd, thisPath + ".ts"), 'utf-8');
        match = ROUTES_REGEX_LIST.map(regex => routesFileContent.match(regex)).find(match => match);
        const r = extractRoutesFromTS(match[1], route.path);
        // Add connection from module to path
        routes = [{ componentName: route.path, path: thisPath, parent: route.componentName, lazy: false, type: 'route', subgraph: 'start', skipLoadingDependencies: true }, ...r];
    } else {
        const r = extractRoutesFromTS(match[1], route.path);
        // Add connection from module to path
        routes = [{ componentName: route.path, path: relativePath, parent: route.componentName, lazy: false, type: 'module', subgraph: 'start', skipLoadingDependencies: true }, ...r];
    }

    const flattenedRoutes = flattenRoutes(routes)
        .map(r => relativePath && r.loadChildren
            ? ({ ...r, loadChildren: path.relative(cwd, path.resolve(cwd, relativePath, r.loadChildren)) })
            : r);

    const components = resolveComponents(flattenedRoutes, routesFileContent, relativePath);

    // Add connection to module
    return [...components, { componentName: route.componentName, path: route.path, parent: route.parent, lazy: true, subgraph: 'end', type: 'route', skipLoadingDependencies: true, module: true }];
};

const handleComponent = (route, routesFileContent, relativePath = null) => {
    const regex = new RegExp(`import\\s*{\\s*([^}]*\\b${route.component}\\b[^}]*)\\s*}\\s*from\\s*['"]([^'"]+)['"]`);
    const match = routesFileContent.match(regex);
    if (match) {
        const cwd = process.env.INIT_CWD ?? process.cwd();
        const modulePath = match[2];
        const loadComponent = relativePath ? path.relative(cwd, path.resolve(cwd, relativePath, modulePath)) : modulePath;
        return [{ path: route.path, loadComponent, componentName: route.component, parent: route.parent, lazy: false, type: 'component' }];
    } else if (!route.hasOwnProperty('redirectTo')) {
        console.error(`Could not find path for component: ${route.component}`);
        return [null];
    }
};
