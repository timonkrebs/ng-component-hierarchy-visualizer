import fs from 'node:fs';
import path from 'path';
import { extractRouteRanges, extractRoutesFromTS } from './route.helper.js';

let pathAlias = new Map();
let pathKeys = [];

export const setPathAlias = (a) => {
    for (let [key, value] of Object.entries(a)) {
        const k = key.slice(0, -1);
        pathAlias.set(k, path.join(process.env.INIT_CWD ?? process.cwd(), value[0].slice(0, -1)));
        pathKeys.push(k);
    }
}

export const flattenRoutes = (routes) => {
    const r = routes.flatMap(r => r.children
        ? r.component || r.loadComponent
            ? [...flattenRoutes(r.children), { ...r, children: null }]
            : flattenRoutes(r.children)
        : [r]
    ).filter(Boolean);

    r.forEach(r => {
        if (r.loadChildren) {
            r.loadChildren = replacePath(r.loadChildren);
        } else if (r.loadComponent){
            r.loadComponent = replacePath(r.loadComponent);
        }
    });

    return r;
}

const replacePath = (basePath) => {
    const key = pathKeys.find(p => basePath.startsWith(p));
    if(key) {
        return basePath.replace(key, path.relative(process.env.INIT_CWD, pathAlias.get(key)));
    }
    return basePath;
}

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
    const isLoadChildren = fs.existsSync(path.join(cwd, route.loadChildren + ".ts"));
    let routesFileContent = isLoadChildren
    ? fs.readFileSync(path.join(cwd, route.loadChildren + ".ts"), 'utf-8')
    : fs.readFileSync(path.join(cwd, route.loadChildren + "/index.ts"), 'utf-8');
    const relativePath = isLoadChildren 
    ? path.relative(cwd, path.resolve(cwd, route.loadChildren, ".."))
    : path.relative(cwd, path.resolve(cwd, route.loadChildren));
    let routesString = extractRouteRanges(routesFileContent);

    let routes = [];
    
    // if routes are not configured directly in the module we have to analyze the routing.module
    if (!routesString) {
        const matchImport = routesFileContent.match(/import\s+\{?[^}]+\}?\s+from\s+'(.+\/.+routing\.module|.+routes)'/);
        const initialPath = matchImport[1];
        const replacedPath = replacePath(matchImport[1]);
        const thisPath = initialPath === replacedPath 
        ? path.relative(cwd, path.resolve(cwd, relativePath, initialPath)) 
        : path.relative(cwd, path.resolve(cwd, replacedPath));
        routesFileContent = fs.readFileSync(path.join(cwd, thisPath + ".ts"), 'utf-8');
        routesString = extractRouteRanges(routesFileContent);
        const r = extractRoutesFromTS(routesString, route.path);
        // Add connection from module to path
        routes = [{ componentName: route.path, path: thisPath, parent: route.componentName, lazy: false, type: 'route', subgraph: 'start', skipLoadingDependencies: true }, ...r];
    } else {
        const r = extractRoutesFromTS(routesString, route.path);
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
