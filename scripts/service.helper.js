import fs from 'node:fs';
import path from 'path';
import { parse } from '@typescript-eslint/typescript-estree';
import { findImportPath } from './route.helper.js';

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
                const p = path.join(process.env.INIT_CWD ?? process.cwd(), c.loadComponent + '.ts');
                const componentCode = fs.readFileSync(p, 'utf-8');
                return loadAllServices(componentCode, c, recursionDepth);
            } catch (e) {
                // Silently ignore missing files during normal operation, or log if debugging needed.
                // console.error("Error in addServices:", e);
                return [];
            }
        });
    return [...components, ...uniqueByProperty(services)];
};

const loadAllServices = (componentCode, parent, recursionDepth = 0) => {
    let ast;
    try {
        ast = parse(componentCode, { range: true });
    } catch (e) {
        return [];
    }

    const services = [
        ...loadAllInjectedServices(ast, parent),
        ...loadAllConstructorInjectedServices(ast, parent),
    ];

    if (recursionDepth > 100 || !services.length) {
        return uniqueByProperty(services);
    }

    return addServices(uniqueByProperty(services), recursionDepth + 1);
};

const visit = (node, callback) => {
    if (!node) return;
    callback(node);

    if (typeof node === 'object') {
        Object.keys(node).forEach(key => {
            if (key === 'range' || key === 'loc' || key === 'tokens' || key === 'comments' || key === 'parent') return;
            const child = node[key];
            if (Array.isArray(child)) {
                child.forEach(c => visit(c, callback));
            } else if (child && typeof child === 'object') {
                visit(child, callback);
            }
        });
    }
};

const loadAllInjectedServices = (ast, parent) => {
    const services = [];
    visit(ast, (node) => {
        if (node?.type === 'CallExpression' && node.callee?.name === 'inject' && node.arguments?.length > 0) {
            const arg = node.arguments[0];
            if (arg.type === 'Identifier') {
                const service = createService(arg.name, ast, parent);
                if (service) services.push(service);
            }
        }
    });
    return services;
};

const loadAllConstructorInjectedServices = (ast, parent) => {
    const services = [];

    visit(ast, (node) => {
        if (node?.type === 'MethodDefinition' && node.key?.name === 'constructor') {
            node.value?.params?.forEach(param => {
                let typeName;
                if (param.type === 'TSParameterProperty') {
                     typeName = param.parameter?.typeAnnotation?.typeAnnotation?.typeName?.name;
                } else if (param.type === 'Identifier') {
                     typeName = param.typeAnnotation?.typeAnnotation?.typeName?.name;
                }

                if (typeName) {
                    const service = createService(typeName, ast, parent);
                    if (service) services.push(service);
                }
            });
        }
    });

    return services;
};

const createService = (serviceName, ast, parent) => {
    const importPath = findImportPath(ast, serviceName);

    if (!importPath || importPath.startsWith('@angular')) return null;

    const cwd = process.env.INIT_CWD ?? process.cwd();
    const relativePath = path.relative(cwd, path.resolve(cwd, parent.loadComponent, ".."));
    const thisPath = path.relative(cwd, path.resolve(cwd, relativePath, replacePath(importPath)));

    return { componentName: serviceName, loadComponent: `./${thisPath}`, path: parent.path, parent: parent.componentName, lazy: false, type: 'service' };
};

const uniqueByProperty = (arr) => [...new Map(arr.map(item => [item.componentName + item.parent, item])).values()];
