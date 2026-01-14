import fs from 'node:fs';
import path from 'path';
import { parse } from '@typescript-eslint/typescript-estree';
import { findImportPath } from './route.helper.js';
import { isSafePath } from './component.helper.js';

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
    const services = components.filter(c => !c.skipLoadingDependencies).flatMap(c => {
        try {
            return loadAllServices(fs.readFileSync(path.join(process.env.INIT_CWD ?? process.cwd(), c.loadComponent + '.ts'), 'utf-8'), c, recursionDepth);
        } catch { return []; }
    });
    return [...components, ...uniqueByProperty(services)];
};

const loadAllServices = (code, parent, depth = 0) => {
    let ast; try { ast = parse(code, { range: true }); } catch { return []; }
    const services = extractServiceNames(ast).map(n => createService(n, ast, parent)).filter(Boolean);
    return (depth > 100 || !services.length) ? uniqueByProperty(services) : addServices(uniqueByProperty(services), depth + 1);
};

const extractServiceNames = (ast) => {
    const services = new Set();
    const traverse = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(traverse);
        if (node.type === 'MethodDefinition' && node.kind === 'constructor') {
            node.value.params.forEach(p => {
                const type = (p.type === 'TSParameterProperty' ? p.parameter : p).typeAnnotation?.typeAnnotation?.typeName;
                if (type?.type === 'Identifier') services.add(type.name);
            });
        } else if (node.type === 'CallExpression' && node.callee.name === 'inject' && node.arguments[0]?.type === 'Identifier') {
            services.add(node.arguments[0].name);
        }
        Object.keys(node).forEach(key => key !== 'parent' && key !== 'loc' && key !== 'range' && traverse(node[key]));
    };
    traverse(ast);
    return Array.from(services);
};

const createService = (serviceName, ast, parent) => {
    const importPath = findImportPath(ast, serviceName);
    if (!importPath || importPath.startsWith('@angular')) return null;

    const cwd = process.env.INIT_CWD ?? process.cwd();
    const relativePath = path.relative(cwd, path.resolve(cwd, parent.loadComponent, ".."));
    const thisPath = path.relative(cwd, path.resolve(cwd, relativePath, replacePath(importPath)));

    if (!isSafePath(thisPath, cwd)) {
        console.warn(`Security Warning: Access denied to ${thisPath}. Path traversal attempted.`);
        return null;
    }

    return { componentName: serviceName, loadComponent: `./${thisPath}`, path: parent.path, parent: parent.componentName, lazy: false, type: 'service' };
};

const uniqueByProperty = (arr) => [...new Map(arr.map(item => [item.componentName + item.parent, item])).values()];
