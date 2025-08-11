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
    const routesFileContent = fs.readFileSync(path.join(args.basePath, `./${args.routesFilePath}`), 'utf-8');
    const routes = extractRoutesFromTS(routesFileContent);
    const handeledRoutes = handleRoutePaths(routes);
    let elements = resolveComponents(handeledRoutes, routesFileContent);

    elements = addTemplateElements(elements, args.withNestedDependencies);

    if (args.withServices) {
        elements = addServices(elements);
    }

    return generateMermaid(elements);
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

        if (subgraph === 'start') {
            mermaidLines.push(`subgraph ${formattedParent || 'empty-route'}`);
            mermaidLines.push('direction LR'); // Set subgraph direction to left-to-right
        } else {
            const parentNode = formattedParent || 'empty-route'; // Default to 'empty-route' if no parent
            const formattedComponentName = componentName.startsWith('@') ? componentName.slice(1) : componentName;
            if (lazy) {
                // Lazy-loaded component (dotted line with open arrowhead)
                mermaidLines.push(`${parentNode} -.-o ${formattedComponentName}(${componentName})`); 
            } else {
                switch (type) {
                    case 'service':
                        // Service (solid line with double brackets)
                        mermaidLines.push(`${parentNode} --- ${formattedComponentName}{{${componentName}}}`);
                        break;
                    case 'import':
                        // Import (solid line with square brackets)
                        mermaidLines.push(`${parentNode} ---${formattedComponentName}([${componentName}])`);
                        break;
                    case 'hostDirective':
                        // Host Directive (dotted line with normal arrow and curly braces)
                        mermaidLines.push(`${parentNode} -.-> ${formattedComponentName}{{${componentName}}}`);
                        break;
                    default:
                        // Standard component (solid line with open arrowhead)
                        mermaidLines.push(`${parentNode} --o ${formattedComponentName}(${componentName})`);
                }
            }
        }

        return mermaidLines.join('\n');
    });
    return ['flowchart LR', ...lines].join('\n');
};
