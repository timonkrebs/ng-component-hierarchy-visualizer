import fs from 'node:fs';
import path from 'path';
import { extractRouteRanges, extractRoutesFromTS } from './route.helper.js';

let pathAliases = new Map();
let aliasKeys = [];

export const setPathAliases = (aliases) => {
    for (let [alias, paths] of Object.entries(aliases)) {
        const cleanedAlias = alias.endsWith('*') ? alias.slice(0, -1) : alias;
        
        const resolvedPath = path.join(process.env.INIT_CWD ?? process.cwd(), paths[0].endsWith?.('*') ? paths[0].slice(0, -1) : paths[0]);
        pathAliases.set(cleanedAlias, resolvedPath);
        aliasKeys.push(cleanedAlias);
    }
    aliasKeys = aliasKeys.sort((a, b) => b.length - a.length);
};

export const flattenRoutes = (routes) => {
    const flattened = routes.flatMap(route => 
        route.children
            ? route.component || route.loadComponent
                ? [...flattenRoutes(route.children), { ...route, children: null }]
                : flattenRoutes(route.children)
            : [route]
    ).filter(Boolean);

    flattened.forEach(route => {
        if (route.loadChildren) {
            route.loadChildren = replacePath(route.loadChildren);
        } else if (route.loadComponent) {
            route.loadComponent = replacePath(route.loadComponent);
        }
    });

    return flattened;
};

const replacePath = (basePath) => {
    const matchingKey = aliasKeys.find(alias => basePath.startsWith(alias));
    if (matchingKey) {
        return basePath.replace(matchingKey, path.relative(process.env.INIT_CWD, pathAliases.get(matchingKey)));
    }
    return basePath;
};

export const resolveComponents = (routes, routesFileContent, relativePath = null) => {
    const cwd = process.env.INIT_CWD ?? process.cwd();
    return routes.flatMap(route => {
        if (route.loadComponent) {
            return [{
                ...route,
                lazy: true,
                type: 'component',
                loadComponent: path.relative(cwd, path.resolve(cwd, relativePath ?? '', route.loadComponent))
            }];
        } else if (route.loadChildren) {
            return handleLoadChildren(route);
        } else if (route.skipLoadingDependencies) {
            return [route];
        } else {
            return handleComponent(route, routesFileContent, relativePath);
        }
    }).filter(Boolean);
};

const handleLoadChildren = (route) => {
    const projectRoot = process.env.INIT_CWD ?? process.cwd();

    const isTsFileDirectlyInFolder = fs.existsSync(path.join(projectRoot, route.loadChildren + ".ts"));
    const isFileDirectlyInFolder = fs.existsSync(path.join(projectRoot, route.loadChildren)) && fs.lstatSync(path.join(projectRoot, route.loadChildren)).isFile();

    const childrenFilePath = isTsFileDirectlyInFolder
        ? path.join(projectRoot, route.loadChildren + ".ts")
        : isFileDirectlyInFolder
        ? path.join(projectRoot, route.loadChildren)
        : path.join(projectRoot, route.loadChildren, "index.ts");

    let routesFileContent = fs.readFileSync(childrenFilePath, 'utf-8');
    const relativePathToParent = isTsFileDirectlyInFolder || isFileDirectlyInFolder
        ? path.relative(projectRoot, path.resolve(projectRoot, route.loadChildren, "..")) 
        : path.relative(projectRoot, path.resolve(projectRoot, route.loadChildren));

    let extractedRoutesData = extractRouteRanges(routesFileContent);

    let routes = [];

    // Check if routes are configured directly (convention: .+\/.+routing\.module|.+routes)
    if (!extractedRoutesData) {
        const moduleImportMatch = routesFileContent.match(/(import|export)\s+\{?[^}]+\}?\s+from\s+'(.+\/.*routing.*|.+routes)'/);
        const originalModulePath = moduleImportMatch[2];
        const resolvedModulePath = replacePath(originalModulePath);

        const moduleFilePath = originalModulePath === resolvedModulePath
            ? path.relative(projectRoot, path.resolve(projectRoot, relativePathToParent, originalModulePath))
            : path.relative(projectRoot, path.resolve(projectRoot, resolvedModulePath));
        
        const moduleFilePathWithExtension = moduleFilePath.endsWith('.ts') ? moduleFilePath : moduleFilePath + ".ts";
        routesFileContent = fs.readFileSync(path.join(projectRoot, moduleFilePathWithExtension), 'utf-8');
        extractedRoutesData = extractRouteRanges(routesFileContent);
        const extractedRoutes = extractRoutesFromTS(extractedRoutesData, route.path);

        // Connect module to path
        routes = [
            { 
                componentName: route.path, 
                path: moduleFilePath, 
                parent: route.componentName, 
                lazy: false, 
                type: 'route', 
                subgraph: 'start', 
                skipLoadingDependencies: true 
            }, 
            ...extractedRoutes
        ];
    } else {
        const extractedRoutes = extractRoutesFromTS(extractedRoutesData, route.path);

        // Connect module to path
        routes = [
            { 
                componentName: route.path, 
                path: relativePathToParent, 
                parent: route.componentName, 
                lazy: false, 
                type: 'module', 
                subgraph: 'start', 
                skipLoadingDependencies: true 
            },
            ...extractedRoutes
        ];
    }

    const flattenedRoutes = flattenRoutes(routes).map(route => {
        if (relativePathToParent && route.loadChildren) {
            return { 
                ...route, 
                loadChildren: path.relative(projectRoot, path.resolve(projectRoot, relativePathToParent, route.loadChildren))
            };
        }
        return route;
    });

    const components = resolveComponents(flattenedRoutes, routesFileContent, relativePathToParent);

    // Add connection back to the original module
    return [
        ...components,
        { 
            componentName: route.componentName, 
            path: route.path, 
            parent: route.parent, 
            lazy: true, 
            subgraph: 'end', 
            type: 'route', 
            skipLoadingDependencies: true, 
            module: true 
        }
    ];
};

const handleComponent = (route, routesFileContent, relativePath = null) => {
    const regex = new RegExp(`import\\s*{\\s*([^}]*\\b${route.component}\\b[^}]*)\\s*}\\s*from\\s*['"]([^'"]+)['"]`);
    const match = routesFileContent.match(regex);
    if (match) {
        const cwd = process.env.INIT_CWD ?? process.cwd();
        const modulePath = match[2];
        
        const loadComponentPath = relativePath ? path.relative(cwd, path.resolve(cwd, relativePath, modulePath)) : modulePath;
        
        return [{
            path: route.path,
            loadComponent: loadComponentPath,
            componentName: route.component,
            parent: route.parent,
            lazy: false,
            type: 'component'
        }];
    } else {
        console.error(`Could not find path for component: ${route.component}`, route);
        return [null];
    }
};
