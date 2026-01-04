import fs from 'node:fs';
import path from 'path';
import { addTemplateElements } from './template.helper.js';
import { extractRoutesFromTS } from './route.helper.js';
import { handleRoutePaths, resolveComponents, setPathAliases } from './component.helper.js';
import { addServices, setServicePathAliases } from './service.helper.js';

export const main = (args) => {
    if (args.pathAlias) {
        setPathAliases(args.pathAlias);
        setServicePathAliases(args.pathAlias)
    }

    process.env.INIT_CWD = args.basePath;

    const resolvedBasePath = path.resolve(args.basePath);
    const resolvedRoutesFilePath = path.resolve(resolvedBasePath, args.routesFilePath);

    if (!resolvedRoutesFilePath.startsWith(resolvedBasePath + path.sep) && resolvedRoutesFilePath !== resolvedBasePath) {
        throw new Error('Security Error: Path traversal detected. Access denied.');
    }

    const routesFileContent = fs.readFileSync(resolvedRoutesFilePath, 'utf-8');
    const routes = extractRoutesFromTS(routesFileContent);
    const handeledRoutes = handleRoutePaths(routes);
    let elements = resolveComponents(handeledRoutes, routesFileContent);

    elements = addTemplateElements(elements, args.withNestedDependencies);

    if (args.withServices) {
        elements = addServices(elements);
    }

    return generateMermaid(elements);
};

const sanitizeId = (str) => {
    return str.replace(/[^a-zA-Z0-9_]/g, '_');
};

const formatLabel = (str) => {
    return `"${str.replace(/"/g, '#quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`;
};

export const generateMermaid = (routes) => {
    const lines = routes.map(route => {
        const mermaidLines = [];
        const { subgraph, componentName, lazy, type, parent } = route;

        if (subgraph === 'end') {
            mermaidLines.push('end');
        }

        // Remove '@' prefix (if present) for better display
        const formattedParent = parent?.startsWith('@') ? parent.slice(1) : parent;
        const sanitizedParent = sanitizeId(formattedParent || 'empty-route');

        if (subgraph === 'start') {
            mermaidLines.push(`subgraph ${sanitizedParent}`);
            mermaidLines.push('direction LR'); // Set subgraph direction to left-to-right
        } else {
            const parentNode = sanitizedParent;
            const formattedComponentName = componentName.startsWith('@') ? componentName.slice(1) : componentName;
            const sanitizedComponentName = sanitizeId(formattedComponentName);
            const label = formatLabel(componentName);

            if (lazy) {
                // Lazy-loaded component (dotted line with open arrowhead)
                mermaidLines.push(`${parentNode} -.-o ${sanitizedComponentName}(${label})`);
            } else {
                switch (type) {
                    case 'service':
                        // Service (solid line with double brackets)
                        mermaidLines.push(`${parentNode} --- ${sanitizedComponentName}{{${label}}}`);
                        break;
                    case 'import':
                        // Import (solid line with square brackets)
                        mermaidLines.push(`${parentNode} ---${sanitizedComponentName}([${label}])`);
                        break;
                    case 'hostDirective':
                        // Host Directive (dotted line with normal arrow and curly braces)
                        mermaidLines.push(`${parentNode} -.-> ${sanitizedComponentName}{{${label}}}`);
                        break;
                    default:
                        // Standard component (solid line with open arrowhead)
                        mermaidLines.push(`${parentNode} --o ${sanitizedComponentName}(${label})`);
                }
            }
        }

        return mermaidLines.join('\n');
    });
    return ['flowchart LR', ...lines].join('\n');
};
