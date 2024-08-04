import fs from 'node:fs';
import path from 'path';
import { parse } from '@typescript-eslint/typescript-estree';
import { extractRoutesFromTS } from './route.helper.js'

export const addTemplateElements = (elements, withNestedTemplateElements, recursionDepth = 0) => {
    if (recursionDepth > 5) {
        return elements;
    }
    return elements
        .flatMap(e => loadDependencies(e, withNestedTemplateElements, recursionDepth));
}


const loadDependencies = (c, withNestedTemplateElements, recursionDepth) => {
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

    if (!withNestedTemplateElements) {
        return [c];
    }

    const components = [];

    const importNodes = parse(fileContent, { range: true }).body
        .filter(n => n.type === 'ExportDefaultDeclaration' || n.type === 'ExportNamedDeclaration')?.flatMap(n => n
            .declaration.decorators.filter(d => d.expression.callee?.name === 'Component')?.[0]
            .expression.arguments[0].properties.filter(n => n.key.name === 'imports')?.[0]
            ?.value.elements);

    const provideRouter = importNodes.filter(n => n?.type === 'CallExpression' && n.callee.name === 'provideRouter')?.[0]?.arguments?.[0];
    const identifierNodes = importNodes.filter(n => n?.type === 'Identifier');

    if (provideRouter?.type === 'ObjectExpression') {
        // ToDo: add routes
        // console.log(provideRouter.properties)
    }

    if (identifierNodes?.length) {
        try {
            // ToDo: handle provideRouter
            const importsContent = identifierNodes.map(e => e.name);

            importsContent.forEach(componentName => {
                const comp = handleComponent(componentName, fileContent, c.componentName, path.relative(cwd, p));
                if (comp) {
                    components.push(comp)
                }
            });

            const x = addTemplateElements(components, recursionDepth + 1);
            return [c, ...x];
        } catch {
            console.error(`Could not resolve imports for component: ${c.componentName}`);
        }
    }

    return [c];
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