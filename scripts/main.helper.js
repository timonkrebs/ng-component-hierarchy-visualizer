import fs from 'node:fs';
import path from 'path';
import { addTemplateElements } from './template.helper.js';
import { extractRouteRanges, extractRoutesFromTS } from './route.helper.js';
import { flattenRoutes, resolveComponents, setPathAliases } from './component.helper.js';
import { addServices } from './service.helper.js';

export const main = (args) => {
    if (args.pathAlias) {
        setPathAliases(args.pathAlias);
    }

    process.env.INIT_CWD = args.basePath;
    const routesFileContent = fs.readFileSync(path.join(args.basePath, `./${args.routesFilePath}`), 'utf-8');
    const routes = extractRoutesFromTS(extractRouteRanges(routesFileContent));
    const flattenedRoutes = flattenRoutes(routes);
    let elements = resolveComponents(flattenedRoutes, routesFileContent);

    elements = addTemplateElements(elements, args.withNestedTemplateElements);

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
        const formattedComponentName = componentName.startsWith('@') ? componentName.slice(1) : componentName;

        if (subgraph === 'start') {
            mermaidLines.push(`subgraph ${formattedParent ?? 'empty'}`);
            mermaidLines.push('direction LR'); // Set subgraph direction to left-to-right
        } else {
            const parentNode = formattedParent ?? 'empty'; // Default to 'empty' if no parent

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
                    default:
                        // Standard component (solid line with open arrowhead)
                        mermaidLines.push(`${parentNode} --o ${formattedComponentName}(${componentName})`);
                }
            }
        }

        return mermaidLines.join('\n');
    });

    // Assemble the complete Mermaid diagram
    return ['flowchart LR', ...lines].join('\n'); 
};
