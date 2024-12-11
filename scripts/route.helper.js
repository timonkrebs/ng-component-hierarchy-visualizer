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
                return JSON.parse(cleanUpRouteDeclarations(routesString.substring(...e.range), rootName));
            } catch (error) {
                console.error('Error parsing route configuration:', cleanUpRouteDeclarations(routesString.substring(...e.range)), e, error);
            }
        }).filter(Boolean);

        return routes;
    } catch (error) {
        console.error('Error parsing routes configuration:', error);
        return []; // Return an empty array in case of errors
    }
};

const cleanUpRouteDeclarations = (route, rootName) => {
    return route
        // 1.1 Remove Guards:
        .replace(
            /can.*:\s*\[[^\]]*\],?\s*/g,
            ''
        )
        // 1.2 Remove data:
        .replace(
            /data:\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\},?\s*/g,
            ''
        )
        // 1.3 Remove resolve:
        .replace(
            /resolve:\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\},?\s*/g,
            ''
        )
        // 1.4 Remove providers:
        .replace(
            /providers:\s*\[[^\]]*\],?\s*/g,
            ''
        )
        // 1.5 Remove pathMatch
        .replace(
            /pathMatch:\s*[\w\s]*,?/,
            ''
        )
        // 2. Replace Lazy Loaded Routes with Simplified Syntax:
        //    This matches routes with the pattern `() => import(path).then(m => m.componentName)`
        //    and transforms them into `{ path, componentName, parent }` objects
        .replace(
            /\(\)\s*=>[\s\S]*?import\(\s*(.*?)\s*\)\s*\.then\(\s*\(?(\w+)\)?\s*=>\s*\2\.(\w+)\s*\)?[\s\S]*?,?\s*/g,
            `$1, componentName: "$3", parent: "${rootName}"`
        )
        // 3. Replace Lazy Loaded Routes wothout explicit Type .then(m => m.componentName) with Simplified Syntax:
        //    This matches routes with the pattern `() => import(path)` and 
        //    transforms them into `{ path, componentName, parent }` objects
        //    It uses the path also as the componentName
        .replace(
            /\(\)\s*=>[\s\S]*?import\(([\s\S]*?)\)[\s\S]*?,?\s*/g,
            `$1, componentName: $1, parent: "${rootName}"`
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
            "")
        // 9. remove all comments
        .replace(/\/\/.*/g, '') // Single Line
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''); // Multi Line
};