import fs from 'node:fs';
import path from 'path';

const ROOT_COMPONENT = 'AppComponent';

const ROUTES_REGEX_LIST = [
    /.*:\s*Routes\s*=\s*(\[[\s\S]*?\]);/m,
    /.*:\s*Route\[\]\(\s*(\[[\s\S]*?\]);/m,
    /.*:\s*provideRouter\s*\(\s*(\[[\s\S]*?\])\s*(?:,\s*\{[\s\S]*?\})?\s*\)/m,
    /RouterModule\.forRoot\s*\(\s*(\[[\s\S]*?\])\s*(?:,\s*\{[\s\S]*?\})?\s*\)/m,
    /.*:\s*RouterModule.forChild\s*\(\s*(\[[\s\S]*?\])\s*(?:,\s*\{[\s\S]*?\})?\s*\)/m,
    /.*(\[[\s\S]*?\])satisfies Routes;/m,
    /.*(\[[\s\S]*?\])satisfies Route\[\];/m
];

export const main = (args) => {
    process.env.INIT_CWD = args.basePath;
    const routesFileContent = fs.readFileSync(path.join(args.basePath, `./${args.routesFilePath}`), 'utf-8');
    const routes = extractRoutesFromTS(routesFileContent);
    const flattenedRoutes = flattenRoutes(routes);
    let components = resolveComponents(flattenedRoutes, routesFileContent);
    
    if(args.withServices){
        const dependencies = addDependencies(components);
        return generateMermaid(dependencies);
    }
    
    return generateMermaid(components);
};

export const extractRoutesFromTS = (fileContent, rootName = ROOT_COMPONENT) => {
    const match = ROUTES_REGEX_LIST.map(regex => fileContent.match(regex)).find(match => match);
    if (!match) throw new Error('Routes not found in the provided file content.');

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
            /\(\)\s*=>\s*import\((.*?)\)\s*\.then\(\s*(\w+)\s*=>\s*\2\.(\w+),?\s*\)/g,
            `$1, componentType: "$3", parent: "${rootName}"`
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
        .replaceAll(
            /\,(?=\s*?[\}\]])/g,
            "");

    const routes = JSON.parse(wrappedRoutesString)
    return routes;
};

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
    const match = ROUTES_REGEX_LIST.map(regex => routesFileContent.match(regex)).find(match => match);

    let routes = [];
    // if routes are not configured directly in the module we have to analyze the routing.module
    if (!match) {
        const matchImport = routesFileContent.match(/import\s+\{[^}]+\}\s+from\s+'(.+\/.+routing\.module)'/);
        const thisPath = path.relative(cwd, path.resolve(cwd, relativePath, matchImport[1]));
        routesFileContent = fs.readFileSync(path.join(cwd, thisPath + ".ts"), 'utf-8');
        const r = extractRoutesFromTS(routesFileContent, route.path);
        // Add connection from module to path
        routes = [{ componentType: route.path, path: thisPath, parent: route.componentType, lazy: false, type: 'route', subgraph: 'start', skipLoadingDependencies: true }, ...r];
    } else {
        const r = extractRoutesFromTS(routesFileContent, route.path);
        // Add connection from module to path
        routes = [{ componentType: route.path, path: relativePath, parent: route.componentType, lazy: false, type: 'route', subgraph: 'start', skipLoadingDependencies: true }, ...r];
    }

    const flattenedRoutes = flattenRoutes(routes)
        .map(r => relativePath && r.loadChildren
            ? ({ ...r, loadChildren: path.relative(cwd, path.resolve(cwd, relativePath, r.loadChildren)) })
            : r);

    const components = resolveComponents(flattenedRoutes, routesFileContent, relativePath);

    // Add connection to module
    return [...components, { componentType: route.componentType, path: route.path, parent: route.parent, lazy: true, subgraph: 'end', type: 'route', skipLoadingDependencies: true, module: true }];
};

const handleComponent = (route, routesFileContent, relativePath = null) => {
    const regex = new RegExp(`import\\s*{\\s*([^}]*\\b${route.component}\\b[^}]*)\\s*}\\s*from\\s*['"]([^'"]+)['"]`);
    const match = routesFileContent.match(regex);
    if (match) {
        const cwd = process.env.INIT_CWD ?? process.cwd();
        const modulePath = match[2];
        const loadComponent = relativePath ? path.relative(cwd, path.resolve(cwd, relativePath, modulePath)) : modulePath;
        return [{ path: route.path, loadComponent, componentType: route.component, parent: route.parent, lazy: false, type: 'component' }];
    } else if (!route.hasOwnProperty('redirectTo')) {
        console.error(`Could not find path for component: ${route.component}`);
        return [null];
    }
};

export const addDependencies = (components, recursionDepth = 0) => {
    const services = components
        .filter(c => !c.skipLoadingDependencies)
        .flatMap(c => {
            try {
                return loadAllServices(fs.readFileSync(path.join(process.env.INIT_CWD ?? process.cwd(), c.loadComponent + '.ts'), 'utf-8'), c, recursionDepth);
            } catch {
                return [];
            }
        });
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
    const importRegex = new RegExp(`import\\s*{\\s*([^}]*\\b${serviceName}\\b[^}]*)\\s*}\\s*from\\s*['"]([^'"]+)['"]`);
    const match = componentCode.match(importRegex);
    if (!match || !match[2] || match[2].startsWith('@angular')) return null;

    const cwd = process.env.INIT_CWD ?? process.cwd();
    const relativePath = path.relative(cwd, path.resolve(cwd, parent.loadComponent, ".."));
    const thisPath = path.relative(cwd, path.resolve(cwd, relativePath, match[2]));

    return { componentType: serviceName, loadComponent: `./${thisPath}`, path: parent.path, parent: parent.componentType, lazy: false, type: 'service' };
};

const uniqueByProperty = (arr) => [...new Map(arr.map(item => [item.componentType + item.parent, item])).values()];

export const generateMermaid = (routes) => {
    const lines = routes.map(r => {
        const l = [];
        if (r.subgraph === 'end') {
            l.push('end');
        }

        if (r.subgraph === 'start') {
            l.push(`subgraph ${r.parent ?? 'empty'}`);
            l.push('direction LR');
        } else if (r.lazy) {
            l.push(r.type === 'service'
                ? `${r.parent ?? 'empty'} -.-> ${r.componentType}{{${r.componentType}}}`
                : `${r.parent ?? 'empty'} -.-> ${r.componentType}(${r.componentType})`);
        } else {
            l.push(r.type === 'service'
                ? `${r.parent ?? 'empty'} --> ${r.componentType}{{${r.componentType}}}`
                : `${r.parent ?? 'empty'} --> ${r.componentType}(${r.componentType})`);
        }

        return l.join('\n');
    });
    return ['flowchart LR', ...lines].join('\n');
};
