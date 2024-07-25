#!/usr/bin/env node
import fs from 'node:fs';
import path from 'path';

const DEFAULT_ROUTES_FILE = 'app.routes.ts';
const rootComponent = 'AppComponent';

const main = () => {
    const routesFilePath = process.argv[2] ?? DEFAULT_ROUTES_FILE;

    const routesFileContent = fs.readFileSync(path.join(process.env.INIT_CWD ?? process.cwd(), `./${routesFilePath}`), 'utf-8');
    const routes = extractRoutesFromTS(routesFileContent);
    const flattenedRoutes = flattenRoutes(routes);
    const components = resolveComponents(flattenedRoutes, routesFileContent);
    const dependencies = addDependencies(components);

    generateMermaid(dependencies);
};

const extractRoutesFromTS = (fileContent, relativePath = null, rootName = rootComponent, parentName = null) => {
    const regex = /.*:\s*Routes\s*=\s*(\[[\s\S]*?\]);/m;
    const match = fileContent.match(regex);
    if (!match) {
        const matchImport = fileContent.match(/import\s+\{[^}]+\}\s+from\s+'(.+\/.+routing\.module)'/);
        const cwd = process.env.INIT_CWD ?? process.cwd();

        const thisPath = path.relative(cwd, path.resolve(cwd, relativePath, matchImport[1]));
        const routesFileContent = fs.readFileSync(path.join(cwd, thisPath + ".ts"), 'utf-8');
        const r = extractRoutesFromTS(routesFileContent, path.relative(cwd, path.resolve(cwd, thisPath, "..")), rootName);
        return [...r, { componentType: rootName, path: thisPath, parent: parentName, lazy: false, type: 'route', skipLoadingDependencies: true }];
    }

    const wrappedRoutesString = match[1]
        // 1. Remove canActivate Guards:
        .replace(
            /canActivate:\s*\[[^\]]*\],?\s*/g,
            ''
        )
        // 1.2 Remove canMatch Guards:
        .replace(
            /canActivateChild:\s*\[[^\]]*\],?\s*/g,
            ''
        )
        // 1.3 Remove canDeactivate Guards:
        .replace(
            /canDeactivate:\s*\[[^\]]*\],?\s*/g,
            ''
        )
        // 1.4 Remove canMatch Guards:
        .replace(
            /canMatch:\s*\[[^\]]*\],?\s*/g,
            ''
        )

        // 1.5 Remove data:
        .replace(
            /data:\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\},?\s*/g,
            ''
        )
        // 1.6 Remove resolve:
        .replace(
            /resolve:\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\},?\s*/g,
            ''
        )

        // 2. Replace Lazy Loaded Routes with Simplified Syntax:
        //    This matches routes with the pattern `() => import(path).then(m => m.componentType)`
        //    and transforms them into `{ path, componentType, parent }` objects
        .replace(
            /\(\) => import\((.*?)\).then\(m => m\.(\w+)\)/g,
            `$1, componentType: "$2", parent: "${rootName}"`
        )
        // 3. Replace Lazy Loaded Routes wothout explicit Type .then(m => m.componentType) with Simplified Syntax:
        //    This matches routes with the pattern `() => import(path)` and 
        //    transforms them into `{ path, componentType, parent }` objects
        //    It uses the path also as the componentType
        .replace(
            /\(\)\s*=>\s*import\(([\s\S]*?)\)/g,
            `$1, componentType: $1, parent: "${rootName}"`
        )
        // 4. Handle Routes with the 'component' Property:
        //    This matches routes with the pattern `component: SomeComponent`
        //    and adds the 'parent' property to them
        .replace(
            /(component:\s*)(\w+)/g,
            `$1"$2", parent: "${rootName}"`
        )
        // 5. Remove Newlines and Carriage Returns:
        //    This simplifies the string for further processing
        .replace(
            /(\r\n|\n|\r)/gm,
            ""
        )
        // 6. Convert Keys to strings
        .replace(
            /(?<=\{|\s)(\w+)(?=\s*:|\s*:)/g,
            '"$1"'
        )
        // 7. Convert Values wrapped in single quotes to strings
        .replaceAll(
            "'",
            '"'
        )
        // 8.remove all trailing commas
        .replaceAll(/\,(?=\s*?[\}\]])/g, "");

    const routes = JSON.parse(wrappedRoutesString).filter(r => !r.redirectTo);
    return parentName
        ? [...routes, { componentType: rootName, path: relativePath, parent: parentName, lazy: false, type: 'route', skipLoadingDependencies: true }]
        : routes;
};

const flattenRoutes = (routes) => {
    return routes.flatMap(r => {
        return r.children
            ? r.component || r.loadComponent
                ? [r, ...flattenRoutes(r.children)]
                : flattenRoutes(r.children)
            : [r]
    });
};

const resolveComponents = (routes, routesFileContent) => {
    return routes.flatMap(r => {
        if (r.loadComponent) {
            return [{ ...r, lazy: true, type: 'component' }];
        } else if (r.loadChildren) {
            return handleLoadChildren(r);
        } else if (r.skipLoadingDependencies) {
            return [r];
        }
        else {
            return handleComponent(r, routesFileContent);
        }
    }).filter(Boolean);
};

const handleLoadChildren = (route) => {
    const cwd = process.env.INIT_CWD ?? process.cwd();
    const routesFileContent = fs.readFileSync(path.join(cwd, route.loadChildren + ".ts"), 'utf-8');

    const relativePath = path.relative(cwd, path.resolve(cwd, route.loadChildren, ".."));

    const routes = extractRoutesFromTS(routesFileContent, relativePath, route.path, route.componentType);

    const flattenedRoutes = flattenRoutes(routes);
    const components = resolveComponents(flattenedRoutes, routesFileContent).map(fr => {
        if (fr.skipLoadingDependencies) {
            return fr;
        }
        const thisPath = path.relative(cwd, path.resolve(cwd, relativePath, fr.loadComponent));
        return {
            ...fr,
            componentType: thisPath,
            loadComponent: thisPath,
        };
    });

    return [...components, { componentType: route.componentType, path: route.path, parent: route.parent, lazy: true, type: 'route', skipLoadingDependencies: true }];
};

const handleComponent = (route, routesFileContent) => {
    const regex = new RegExp(`(?<=(?:import\\s*{\\s*|\\b))${route.component}\\b\\s*(?:,?\\s*\\w+\\s*)*}?\\s*from\\s*['"]([^'"]+)['"]`);
    const match = routesFileContent.match(regex);

    if (match) {
        const modulePath = match[1];
        return [{ path: route.path, loadComponent: modulePath, componentType: route.component, parent: route.parent, lazy: false, type: 'component' }];
    } else {
        console.error(`Could not find path for component: ${route.componentType}`);
        return [null];
    }
};

const addDependencies = (components, recursionDepth = 0) => {
    const services = components
        .filter(c => !c.skipLoadingDependencies)
        .flatMap(c =>
            loadAllServices(fs.readFileSync(path.join(process.env.INIT_CWD ?? process.cwd(), c.loadComponent + '.ts'), 'utf-8'), c, recursionDepth)
        );
    return uniqueByProperty([...components, ...services]);
};

const loadAllServices = (componentCode, parent, recursionDepth = 0) => {
    const services = [
        ...loadAllInjectedServices(componentCode, parent),
        ...loadAllConstructorInjectedServices(componentCode, parent),
    ];

    if (recursionDepth > 2 || !services.length) {
        return uniqueByProperty(services);
    }

    return addDependencies(uniqueByProperty(services), recursionDepth + 1);
};

const loadAllInjectedServices = (componentCode, parent) => {
    const injectRegex = /(?<=inject\()\w+(?=\))/g;
    const matches = componentCode.match(injectRegex);
    if (!matches) return [];

    return matches.map(s => createService(s, componentCode, parent)).filter(Boolean);
};

const loadAllConstructorInjectedServices = (componentCode, parent) => {
    const constructorRegex = /constructor\s*\(\s*([^)]+)\)/;
    const match = componentCode.match(constructorRegex);
    if (!match) return [];

    const serviceNames = [...match[1].matchAll(/:\s*([A-Za-z0-9_]+)/g)].map(m => m[1]);
    return serviceNames.map(s => createService(s, componentCode, parent)).filter(Boolean);
};

const createService = (serviceName, componentCode, parent) => {
    const importRegex = new RegExp(`(?<=(?:import\\s*{\\s*|\\b))${serviceName}\\b\\s*(?:,?\\s*\\w+\\s*)*}?\\s*from\\s*['"]([^'"]+)['"]`);
    const match = componentCode.match(importRegex);
    if (!match || !match[1].startsWith('.')) return null;

    const cwd = process.env.INIT_CWD ?? process.cwd();
    const relativePath = path.relative(cwd, path.resolve(cwd, parent.loadComponent, ".."));
    const thisPath = path.relative(cwd, path.resolve(cwd, relativePath, match[1]));

    return { componentType: serviceName, loadComponent: `./${thisPath.toString()}`, path: parent.path, parent: parent.componentType, lazy: false, type: 'service' };
};

const uniqueByProperty = (arr) => [...new Map(arr.map(item => [item.componentType + item.parent, item])).values()];

const generateMermaid = (routes) => {
    const lines = routes.map(r => {
        if (r.lazy) {
            return r.type === 'service'
                ? `${r.parent} -.-> ${r.componentType}{{${r.componentType}}}`
                : `${r.parent} -.-> ${r.componentType}(${r.componentType})`;
        } else {
            return r.type === 'service'
                ? `${r.parent} --> ${r.componentType}{{${r.componentType}}}`
                : `${r.parent} --> ${r.componentType}(${r.componentType})`;
        }
    });
    console.log(['flowchart', ...lines].join('\n'));
};

main();
