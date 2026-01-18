import fs from 'node:fs';
import path from 'path';
import { extractRoutesFromTS, findImportPath, findImports } from './route.helper.js';

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

export const handleRoutePaths = (routes) => {

    routes.forEach(route => {
        if (route.loadChildren) {
            route.loadChildren = replacePath(route.loadChildren);
        } else if (route.loadComponent) {
            route.loadComponent = replacePath(route.loadComponent);
        }
    });

    return routes;
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
            const loadComponent = path.relative(cwd, path.resolve(cwd, relativePath ?? '', route.loadComponent));
            if (!isSafePath(loadComponent, cwd)) {
                console.warn(`Security Warning: Access denied to ${loadComponent}. Path traversal attempted.`);
                return [null];
            }

            return [{
                ...route,
                lazy: true,
                type: 'component',
                loadComponent
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

    const potentialTsPath = path.join(projectRoot, route.loadChildren + ".ts");
    const potentialFilePath = path.join(projectRoot, route.loadChildren);
    const potentialIndexPath = path.join(projectRoot, route.loadChildren, "index.ts");

    const isTsFileDirectlyInFolder = isSafePath(potentialTsPath, projectRoot) && fs.existsSync(potentialTsPath);
    const isFileDirectlyInFolder = isSafePath(potentialFilePath, projectRoot) && fs.existsSync(potentialFilePath) && fs.lstatSync(potentialFilePath).isFile();

    const childrenFilePath = isTsFileDirectlyInFolder
        ? potentialTsPath
        : isFileDirectlyInFolder
            ? potentialFilePath
            : potentialIndexPath;

    if (!isSafePath(childrenFilePath, projectRoot)) {
        console.warn(`Security Warning: Access denied to ${childrenFilePath}. Path traversal attempted.`);
        return [null];
    }

    let routesFileContent = fs.readFileSync(childrenFilePath, 'utf-8');
    const relativePathToParent = isTsFileDirectlyInFolder || isFileDirectlyInFolder
        ? path.relative(projectRoot, path.resolve(projectRoot, route.loadChildren, ".."))
        : path.relative(projectRoot, path.resolve(projectRoot, route.loadChildren));

    let routes = [];

    const extractedRoutes = extractRoutesFromTS(routesFileContent, route.path);
    if (extractedRoutes?.length) {
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
    } else {
        // Check if routes are configured directly (convention: .+\/.+routing.*|.+routes)
        const imports = findImports(routesFileContent);
        const moduleImportPath = imports.find(path => {
            return path.match(/routing/) || path.match(/routes/);
        });

        const originalModulePath = moduleImportPath ?? imports[0];
        const resolvedModulePath = replacePath(originalModulePath);

        const moduleFilePath = originalModulePath === resolvedModulePath
            ? path.relative(projectRoot, path.resolve(projectRoot, relativePathToParent, originalModulePath))
            : path.relative(projectRoot, path.resolve(projectRoot, resolvedModulePath));

        const moduleFilePathWithExtension = moduleFilePath.endsWith('.ts') ? moduleFilePath : moduleFilePath + ".ts";
        const fullModulePath = path.join(projectRoot, moduleFilePathWithExtension);

        if (!isSafePath(fullModulePath, projectRoot)) {
            console.warn(`Security Warning: Access denied to ${fullModulePath}. Path traversal attempted.`);
            return [null];
        }

        routesFileContent = fs.readFileSync(fullModulePath, 'utf-8');

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
            ...extractRoutesFromTS(routesFileContent, route.path)
        ];
    }

    const flattenedRoutes = handleRoutePaths(routes).map(route => {
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

export const isSafePath = (targetPath, basePath) => {
    let resolvedBasePath = path.resolve(basePath);
    const resolvedTarget = path.resolve(resolvedBasePath, targetPath);

    // 1. String-based check (fast, handles non-existent files safely, prevents obvious traversal)
    if (!(resolvedTarget.startsWith(resolvedBasePath + path.sep) || resolvedTarget === resolvedBasePath)) {
        return false;
    }

    // 2. Symlink resolution (prevents bypassing #1 via symlinks)
    try {
        // Resolve basePath if it exists
        if (fs.existsSync(resolvedBasePath)) {
            resolvedBasePath = fs.realpathSync(resolvedBasePath);
        }

        // If target exists, resolve it and check again
        if (fs.existsSync(resolvedTarget)) {
            const realTarget = fs.realpathSync(resolvedTarget);
            return realTarget.startsWith(resolvedBasePath + path.sep) || realTarget === resolvedBasePath;
        }
    } catch {
        // If any error occurs during realpath (e.g. permission), deny access
        return false;
    }

    // If target does not exist, we rely on the string-based check from #1
    return true;
};

const handleComponent = (route, routesFileContent, relativePath = null) => {
    const modulePath = findImportPath(routesFileContent, route.component);
    if (modulePath) {
        const cwd = process.env.INIT_CWD ?? process.cwd();

        const loadComponentPath = relativePath ? path.relative(cwd, path.resolve(cwd, relativePath, modulePath)) : modulePath;

        if (!isSafePath(loadComponentPath, cwd)) {
            console.warn(`Security Warning: Access denied to ${loadComponentPath}. Path traversal attempted.`);
            return [null];
        }

        return [{
            path: route.path,
            loadComponent: loadComponentPath,
            componentName: route.component,
            parent: route.parent,
            lazy: false,
            type: 'component'
        }];
    } else if (routesFileContent.includes('@Component')) {
        return [{
            path: route.path,
            loadComponent: relativePath,
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
