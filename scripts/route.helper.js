import { parse } from '@typescript-eslint/typescript-estree';

const ROOT_COMPONENT = 'Root';

export const findImportPath = (source, componentName) => {
    try {
        const ast = typeof source === 'string' ? parse(source, { range: false }) : source;
        for (const node of ast.body) {
            if (node.type === 'ImportDeclaration') {
                const specifier = node.specifiers.find(s => s.local.name === componentName);
                if (specifier) {
                    return node.source.value;
                }
            }
        }
    } catch (e) {
        // Fallback or ignore parse errors (e.g. if fileContent is partial or invalid)
        // console.warn('Error parsing file content for imports:', e.message);
    }
    return null;
}

export const getImportsAndExports = (source) => {
    try {
        const ast = typeof source === 'string' ? parse(source, { range: false }) : source;
        const imports = [];
        for (const node of ast.body) {
            if (node.type === 'ImportDeclaration') {
                if (node.source && node.source.value) {
                    imports.push(node.source.value);
                }
            } else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
                if (node.source && node.source.value) {
                    imports.push(node.source.value);
                }
            }
        }
        return imports;
    } catch (e) {
        // console.warn('Error parsing file content for imports:', e.message);
        return [];
    }
};

const extractRouteRanges = (routesFileContent) => {
    const ast = parse(routesFileContent, { range: true });
    const ranges = [];
    ast.body.some((node) => {
        if (node?.type === 'VariableDeclaration' && node.declarations?.length) {
            const routesRanges = extractVariableDeclaration(node.declarations);
            if (routesRanges?.length) {
                ranges.push(...routesRanges);
                return true;
            }
        }

        if (node.type === 'ExportNamedDeclaration') {
            if (node.declaration?.type === 'VariableDeclaration' && node.declaration.declarations?.length) {
                for (const declaration of node.declaration.declarations) {
                    const typeAnnotation = declaration.id?.typeAnnotation?.typeAnnotation;
                    if (node.declaration?.type === 'VariableDeclaration' && node.declaration.declarations?.length) {
                        const routesRanges = extractVariableDeclaration(node.declaration.declarations);
                        if (routesRanges?.length) {
                            ranges.push(...routesRanges);
                            return true;
                        }
                    }

                    if (
                        typeAnnotation?.elementType?.typeName?.name === 'Route' ||
                        typeAnnotation?.typeName?.name === 'Routes'
                    ) {
                        ranges.push(...declaration.init.range)
                        return true;
                    }
                    const initTypeAnnotation = declaration.init.typeAnnotation;
                    if (initTypeAnnotation?.elementType?.typeName?.name === 'Route' ||
                        initTypeAnnotation?.typeName?.name === 'Routes') {
                        ranges.push(...declaration.init.expression.range);
                        return true;
                    }

                    const initProvidersTypeAnnotation = declaration.init.properties
                        ?.find(p => p.key.name === 'providers').value.elements
                        .find(e => e.callee.name === 'provideRouter').arguments[0];
                    if (initProvidersTypeAnnotation) {
                        ranges.push(...initProvidersTypeAnnotation.range);
                        return true;
                    }
                }
            }

            if (node.declaration.type === 'ClassDeclaration' && node.declaration.decorators?.length) {
                const decoratorRouterModule = node.declaration.decorators[0].expression.arguments[0].properties.find(p => p?.key?.name === 'imports')?.value.elements.find(e => e.callee?.object.name === 'RouterModule');
                if (decoratorRouterModule) {
                    ranges.push(...decoratorRouterModule.arguments[0].range);
                    return true;
                }

                const decoratorProvideRouter = node.declaration.decorators[0].expression.arguments[0].properties.find(p => p?.key?.name === 'providers')?.value.elements.find(e => e.callee?.name === 'provideRouter');

                if (decoratorProvideRouter) {
                    ranges.push(...decoratorProvideRouter.arguments[0].range);
                    return true;
                }
            }
        }

        if (node?.type === 'ExportDefaultDeclaration' && node.declaration?.elements?.length) {
            ranges.push(...node.declaration.range);
            return true;
        }
    });
    return ranges.length ? routesFileContent.substring(...ranges) : null;
}

const extractVariableDeclaration = (declarations) => {
    for (const declaration of declarations) {
        const typeAnnotation = declaration.id?.typeAnnotation?.typeAnnotation;
        if (
            typeAnnotation?.elementType?.typeName?.name === 'Route' ||
            typeAnnotation?.typeName?.name === 'Routes'
        ) {
            return declaration.init.range;
        }

        const initTypeAnnotation = declaration.init.typeAnnotation;
        if (initTypeAnnotation?.elementType?.typeName?.name === 'Route' ||
            initTypeAnnotation?.typeName?.name === 'Routes') {
            return declaration.init.expression.range;
        }
    }
}

export const extractRoutesFromTS = (routesString, rootName = ROOT_COMPONENT) => {
    try {
        const ast = parse(routesString, {
            range: true,
        });

        let routesArrayNodes = ast.body
                .map(node => node.type === 'ExportNamedDeclaration' ? node.declaration.declarations : node.declarations)
                .flatMap(node => node)
                .filter(node => node?.init && (node.init.arguments?.length ?? node.init.elements?.length ?? node.init.expression))
                .flatMap(node => node.init.arguments ?? node.init.elements ?? node.init.expression)
                .flatMap(node => node.elements ?? node)
                .filter(node => node.properties);

        if (!routesArrayNodes.length) {
            const extractedRoutsString = extractRouteRanges(routesString);
            const extractedAst = parse(extractedRoutsString, {
                range: true,
            });
            routesArrayNodes = extractedAst.body[0].expression?.elements ?? [];
        }

        try {
            const resolvedRoutes = extractRoutes(routesArrayNodes, rootName);
            return resolvedRoutes;
        } catch (error) {
            console.error('Error extracting route configuration:', error);
        }

        return [];
    } catch (error) {
        console.error('Error parsing routes configuration:', error);
        return []; // Return an empty array in case of errors
    }
};

const extractRoutes = (elements, rootName) => {
    const tempRoutes = [];
    elements.filter(e => e.type === 'ObjectExpression').forEach(e => {
        if (e.properties.some(n => n.key?.name === 'component')) {
            tempRoutes.push(extractComponents(e.properties, rootName));
        }

        if (e.properties.some(n => n.key?.name === 'loadComponent')) {
            tempRoutes.push(extractLoadComponents(e.properties, rootName));
        }

        if (e.properties.some(n => n.key?.name === 'loadChildren')) {
            tempRoutes.push(extractLoadChildren(e.properties, rootName));
        }

        const children = e.properties.find(n => n.key?.name === 'children')?.value?.elements;
        if (children?.length > 0) {
            extractRoutes(children, rootName).forEach(element => {
                tempRoutes.push(element);
            });
        }
    });

    return tempRoutes;
};

const extractComponents = (properties, parent) => {
    return {
        path: properties.find(n => n.key?.name === 'path')?.value?.value,
        component: properties.find(n => n.key?.name === 'component').value.name,
        parent
    }
};

const extractLoadComponents = (properties, parent) => {
    const loadComponent = extractBaseProperty(properties.find(n => n.key?.name === 'loadComponent'));

    const loadComponentValue = loadComponent.callee?.object?.source?.value // if it has .then
        ?? loadComponent.source.value; // if it has no .then

    return {
        path: properties.find(n => n.key?.name === 'path')?.value?.value,
        loadComponent: loadComponentValue,
        componentName: loadComponent.arguments?.[0]?.body?.property?.name ?? loadComponentValue,
        parent
    }
};

const extractLoadChildren = (properties, parent) => {
    const loadChildren = extractBaseProperty(properties.find(n => n.key?.name === 'loadChildren'));

    const loadChildrenValue = loadChildren.callee?.object?.source?.value  // if it has .then
        ?? loadChildren.source.value; // if it has no .then

    return {
        path: properties.find(n => n.key?.name === 'path')?.value?.value,
        loadChildren: loadChildrenValue,
        componentName: loadChildren.arguments?.[0]?.body?.property?.name ?? loadChildrenValue,
        parent
    }
};

const extractBaseProperty = (node) => {
    const body = node.value?.body?.body?.[0]?.argument // if it has a body
        ?? node.value?.consequent?.body // if it has a ternary
        ?? node.value?.body; // if it has no body

    return body.body?.[0]?.consequent?.body?.[0]?.argument // if it has an if statement inside the body of the callback
        ?? body.consequent // if it has a ternary inside the body of the callback
        ?? body;
}