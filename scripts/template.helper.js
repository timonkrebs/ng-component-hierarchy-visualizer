import fs from 'node:fs';
import path from 'path';
import { parse } from '@typescript-eslint/typescript-estree';
import { extractRoutesFromTS, findImportPath } from './route.helper.js';
import { handleRoutePaths, resolveComponents } from './component.helper.js';

export const addTemplateElements = (elements, withNestedDependencies, recursionDepth = 0) => {
    if (recursionDepth > 100) {
        return elements;
    }
    return elements
        .flatMap(e => loadDependencies(e, withNestedDependencies, recursionDepth));
}


const loadDependencies = (c, withNestedDependencies, recursionDepth) => {
    if (c.type !== 'component' || !c.loadComponent) {
        return [c];
    }
    const cwd = process.env.INIT_CWD ?? process.cwd();
    const p = path.join(cwd, c.loadComponent + ".ts");
    if (!fs.existsSync(p, 'utf-8')) {
        return [c];
    }

    const fileContent = fs.readFileSync(p, 'utf-8');

    const componentNameRegex = /export\s+(?:default\s+)?class\s+(\w+)/g;
    const nameMatches = [...fileContent.matchAll(componentNameRegex)];

    if (nameMatches.length === 1) {
        c.componentName = nameMatches[0][1];
    }

    const ast = parse(fileContent, { range: true });
    const componentDecorator = ast.body
        .filter(n => (n.type === 'ExportDefaultDeclaration' || n.type === 'ExportNamedDeclaration') && n.declaration?.decorators)
        .flatMap(n => n.declaration.decorators)
        .find(d => d.expression.callee?.name === 'Component');

    const decoratorProperties = componentDecorator?.expression.arguments[0].properties;

    const importNodes = decoratorProperties?.find(p => p.key.name === 'imports')?.value.elements || [];
    const hostDirectiveNodes = decoratorProperties?.find(p => p.key.name === 'hostDirectives')?.value.elements || [];

    const components = handleRoutes(importNodes, fileContent, withNestedDependencies, path.join(path.relative(cwd, p), "../"), c.componentName, recursionDepth);

    if (!withNestedDependencies) {
        return [c, ...components];
    }

    const importedComponents = extractDependencies(importNodes, 'import', fileContent, c.componentName, path.relative(cwd, p));
    const hostDirectives = extractDependencies(hostDirectiveNodes, 'hostDirective', fileContent, c.componentName, path.relative(cwd, p));

    components.push(...importedComponents, ...hostDirectives);

    const x = addTemplateElements(components, recursionDepth + 1);
    return [c, ...x];
}

const extractDependencies = (nodes, type, fileContent, parentComponent, relativePath) => {
    if (!nodes || nodes.length === 0) {
        return [];
    }

    const identifierNodes = nodes.filter(n =>
        n?.type === 'Identifier' ||
        (n?.type === 'ObjectExpression' && n.properties.some(p => p.key.name === 'directive'))
    );

    const dependencyNames = identifierNodes.map(e => {
        if (e.type === 'Identifier') {
            return e.name;
        } else if (e.type === 'ObjectExpression') {
            const directiveProp = e.properties.find(p => p.key.name === 'directive');
            return directiveProp?.value?.name;
        }
        return null;
    }).filter(Boolean);

    return dependencyNames.map(componentName => {
        const comp = handleComponent(componentName, fileContent, parentComponent, relativePath);
        if (comp) {
            comp.type = type;
            return comp;
        }
        return null;
    }).filter(Boolean);
};


const handleRoutes = (importNodes, fileContent, withNestedDependencies, p, componentName, recursionDepth) => {
    const provideRouter = importNodes?.filter(n => n?.type === 'CallExpression' && n.callee.name === 'provideRouter')?.[0]?.arguments?.[0];

    if (provideRouter?.type === 'ArrayExpression') {
        const routes = extractRoutesFromTS(fileContent.substring(...provideRouter.range), componentName);
        const flattenedRoutes = handleRoutePaths(routes);

        const resolvedComponents = resolveComponents(flattenedRoutes, fileContent, p);

        return resolvedComponents.flatMap(c => loadDependencies(c, withNestedDependencies, recursionDepth));
    }

    return [];
}

const handleComponent = (componentName, routesFileContent, parent, relativePath = null) => {
    const modulePath = findImportPath(routesFileContent, componentName);

    if (modulePath && modulePath.startsWith('@angular')) {
        return null;
    } else if (modulePath) {
        const cwd = process.env.INIT_CWD ?? process.cwd();
        const loadComponent = relativePath ? path.relative(cwd, path.resolve(cwd, relativePath, modulePath)) : modulePath;
        return { loadComponent, componentName, parent, lazy: false, type: 'import' };
    } else {
        return { loadComponent: null, componentName, parent, lazy: false, type: 'import', skipLoadingDependencies: true };
    }
};