import { parse } from '@typescript-eslint/typescript-estree';

const ROOT_COMPONENT = 'Root';

export const extractRouteRanges = (routesFileContent) => {
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
        // Stricter parsing mode
        const ast = parse(routesString, {
            range: true,
        });

        // Find the top-level array expression
        const routesArrayNode = ast.body.find(node => node.type === 'ExpressionStatement' &&
            node.expression.type === 'ArrayExpression');

        if (!routesArrayNode) {
            throw new Error('Could not find the routes array in the configuration.');
        }

        // Extract and transform the routes
        const routes = routesArrayNode.expression.elements.map(e => {
            try {
                const resolvedRoutes = extractRoutes([e], rootName)
                if(resolvedRoutes.length === 1) {
                    return resolvedRoutes[0];
                }

                return {
                    children: resolvedRoutes
                };
            } catch (error) {
                console.error('Error extracting route configuration:', error);
            }
        }).filter(Boolean);

        return routes;
    } catch (error) {
        console.error('Error parsing routes configuration:', error);
        return []; // Return an empty array in case of errors
    }
};

const extractRoutes = (elements, rootName) => {
    const tempRoutes = [];
    elements.forEach(e => {
        // e.type should always be 'ObjectExpression'
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
                tempRoutes.push(element)
            });
        }
    })

    return tempRoutes;
};

const extractComponents = (properties, parent) => {
    return {
        path: properties.find(n => n.key?.name === 'path')?.value?.value,
        component: properties.find(n => n.key?.name === 'component')?.value?.name,
        parent
    }
};

const extractLoadComponents = (properties, parent) => {
    const loadComponent = properties.find(n => n.key?.name === 'loadComponent')
    const loadComponentValue = loadComponent?.value?.body?.callee?.object?.source?.value ?? loadComponent?.value?.body?.source?.value;
    return {
        path: properties.find(n => n.key?.name === 'path')?.value?.value,
        loadComponent: loadComponentValue,
        componentName: properties.find(n => n.key?.name === 'loadComponent')?.value?.body?.arguments?.[0]?.body?.property?.name ?? loadComponentValue,
        parent
    }
};

const extractLoadChildren = (properties, parent) => {
    const loadChildren = properties.find(n => n.key?.name === 'loadChildren')
    const loadChildrenValue = loadChildren?.value?.body?.callee?.object?.source?.value ?? loadChildren?.value?.body?.source?.value;
    return {
        path: properties.find(n => n.key?.name === 'path')?.value?.value,
        loadChildren: loadChildrenValue,
        componentName: properties.find(n => n.key?.name === 'loadChildren')?.value.body.arguments?.[0]?.body?.property?.name ?? loadChildrenValue,
        parent
    }
}