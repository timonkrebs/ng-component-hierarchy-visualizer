import fs from 'node:fs';
import path from 'path';
import { addTemplateElements } from './template.helper.js';
import { extractRoutesFromTS } from './route.helper.js';
import { ROUTES_REGEX_LIST, flattenRoutes, resolveComponents } from './component.helper.js'



export const main = (args) => {
    process.env.INIT_CWD = args.basePath;
    const routesFileContent = fs.readFileSync(path.join(args.basePath, `./${args.routesFilePath}`), 'utf-8');
    const match = ROUTES_REGEX_LIST.map(regex => routesFileContent.match(regex)).find(match => match);
    const routes = extractRoutesFromTS(match[1]);
    const flattenedRoutes = flattenRoutes(routes);
    let elements = resolveComponents(flattenedRoutes, routesFileContent);

    elements = addTemplateElements(elements, args.withNestedTemplateElements);

    if (args.withServices) {
        elements = addServices(elements);
    }

    return generateMermaid(elements);
};

export const addServices = (components, recursionDepth = 0) => {
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

    return addServices(uniqueByProperty(services), recursionDepth + 1);
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

    return { componentName: serviceName, loadComponent: `./${thisPath}`, path: parent.path, parent: parent.componentName, lazy: false, type: 'service' };
};

const uniqueByProperty = (arr) => [...new Map(arr.map(item => [item.componentName + item.parent, item])).values()];

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
            l.push(`${r.parent ?? 'empty'} -.-o ${r.componentName}(${r.componentName})`);
        } else {
            l.push(r.type === 'service'
                ? `${r.parent ?? 'empty'} --- ${r.componentName}{{${r.componentName}}}`
                : r.type === 'import'
                    ? `${r.parent ?? 'empty'} ---${r.componentName}([${r.componentName}])`
                    : `${r.parent ?? 'empty'} --o ${r.componentName}(${r.componentName})`);
        }

        return l.join('\n');
    });
    return ['flowchart LR', ...lines].join('\n');
};
