import fs from 'node:fs';
import path from 'path';

let pathAliases = new Map();
let aliasKeys = [];

export const setServicePathAliases = (aliases) => {
    for (let [alias, paths] of Object.entries(aliases)) {
        const cleanedAlias = alias.endsWith('*') ? alias.slice(0, -1) : alias;
        const resolvedPath = path.join(process.env.INIT_CWD ?? process.cwd(), paths[0].endsWith?.('*') ? paths[0].slice(0, -1) : paths[0]);
        pathAliases.set(cleanedAlias, resolvedPath);
        aliasKeys.push(cleanedAlias);
    }
    aliasKeys = aliasKeys.sort((a, b) => b.length - a.length);
};

const replacePath = (basePath) => {
    const matchingKey = aliasKeys.find(alias => basePath.startsWith(alias));
    if (matchingKey) {
        return basePath.replace(matchingKey, path.relative(process.env.INIT_CWD, pathAliases.get(matchingKey)));
    }
    return basePath;
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
    return [...components, ...uniqueByProperty(services)];
};

const loadAllServices = (componentCode, parent, recursionDepth = 0) => {
    const services = [
        ...loadAllInjectedServices(componentCode, parent),
        ...loadAllConstructorInjectedServices(componentCode, parent),
    ];

    if (recursionDepth > 100 || !services.length) {
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
    const thisPath = path.relative(cwd, path.resolve(cwd, relativePath, replacePath(match[2])));

    return { componentName: serviceName, loadComponent: `./${thisPath}`, path: parent.path, parent: parent.componentName, lazy: false, type: 'service' };
};

const uniqueByProperty = (arr) => [...new Map(arr.map(item => [item.componentName + item.parent, item])).values()];
