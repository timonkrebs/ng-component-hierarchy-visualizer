import fs from 'node:fs';
import path from 'path';
import { parse } from '@typescript-eslint/typescript-estree';
import { extractRoutesFromTS } from './route.helper.js';
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

    const importNodes = parse(fileContent, { range: true }).body
        .filter(n => (n.type === 'ExportDefaultDeclaration' || n.type === 'ExportNamedDeclaration') && n.declaration?.decorators)?.flatMap(n => n
            .declaration.decorators.filter(d => d.expression.callee?.name === 'Component')?.[0]
            ?.expression.arguments[0].properties.filter(n => n.key.name === 'imports' || n.key.name === 'hostDirectives')?.[0]
            ?.value.elements);

    // ToDo: add tests for this
    const components = handleRoutes(importNodes, fileContent, withNestedDependencies, path.join(path.relative(cwd, p), "../"), c.componentName, recursionDepth);

    if (!withNestedDependencies) {
        return [c, ...components];
    }

    // Extract both direct identifiers and hostDirective property expressions
    const identifierNodes = importNodes.filter(n => 
        n?.type === 'Identifier' || 
        (n?.type === 'ObjectExpression' && n.properties.some(p => p.key.name === 'directive'))
    );

    if (identifierNodes?.length) {
        try {
            // Extract component names from both regular imports and hostDirectives
            const importsContent = identifierNodes.map(e => {
                if (e.type === 'Identifier') {
                    return e.name;
                } else if (e.type === 'ObjectExpression') {
                    const directiveProp = e.properties.find(p => p.key.name === 'directive');
                    return directiveProp?.value?.name;
                }
                return null;
            }).filter(Boolean);

            importsContent.forEach(componentName => {
                const comp = handleComponent(componentName, fileContent, c.componentName, path.relative(cwd, p));
                if (comp) {
                    components.push(comp);
                }
            });

            const x = addTemplateElements(components, recursionDepth + 1);
            return [c, ...x];
        } catch {
            console.error(`Could not resolve imports for component: ${c.componentName}`);
        }
    }

    return [c, ...components];
}

const handleRoutes = (importNodes, fileContent, withNestedDependencies, p, componentName, recursionDepth) => {
    const provideRouter = importNodes.filter(n => n?.type === 'CallExpression' && n.callee.name === 'provideRouter')?.[0]?.arguments?.[0];

    if (provideRouter?.type === 'ArrayExpression') {
        const routes = extractRoutesFromTS(fileContent.substring(...provideRouter.range), componentName);
        const flattenedRoutes = handleRoutePaths(routes);

        const resolvedComponents = resolveComponents(flattenedRoutes, fileContent, p);

        return resolvedComponents.flatMap(c => loadDependencies(c, withNestedDependencies, recursionDepth));
    }

    return [];
}

const handleComponent = (componentName, routesFileContent, parent, relativePath = null) => {
    const regex = new RegExp(`import\\s*{\\s*([^}]*\\b${componentName}\\b[^}]*)\\s*}\\s*from\\s*['"]([^'"]+)['"]`);
    const match = routesFileContent.match(regex);
    if (match && match[2] && match[2].startsWith('@angular')) {
        return null;
    } else if (match && match[2]) {
        const cwd = process.env.INIT_CWD ?? process.cwd();
        const modulePath = match[2];
        const loadComponent = relativePath ? path.relative(cwd, path.resolve(cwd, relativePath, modulePath)) : modulePath;
        return { loadComponent, componentName, parent, lazy: false, type: 'import' };
    } else {
        return { loadComponent: null, componentName, parent, lazy: false, type: 'import', skipLoadingDependencies: true };
    }
};