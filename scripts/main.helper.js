import fs from 'node:fs';
import path from 'path';
import { addTemplateElements } from './template.helper.js';
import { extractRouteRanges, extractRoutesFromTS } from './route.helper.js';
import { flattenRoutes, resolveComponents, setPathAlias } from './component.helper.js';
import { addServices } from './service.helper.js';

export const main = (args) => {
    if (args.pathAlias) {
        setPathAlias(args.pathAlias);
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
    const lines = routes.map(r => {
        const l = [];
        if (r.subgraph === 'end') {
            l.push('end');
        }

        if(r.parent.startsWith('@')){
            r.parent = r.parent.slice(1);
        }

        let componentName = r.componentName;
        if(componentName.startsWith('@')){
            componentName = componentName.slice(1);
        }

        if (r.subgraph === 'start') {
            l.push(`subgraph ${r.parent ?? 'empty'}`);
            l.push('direction LR');
        } else if (r.lazy) {
            l.push(`${r.parent ?? 'empty'} -.-o ${componentName}(${r.componentName})`);
        } else {
            l.push(r.type === 'service'
                ? `${r.parent ?? 'empty'} --- ${componentName}{{${r.componentName}}}`
                : r.type === 'import'
                    ? `${r.parent ?? 'empty'} ---${componentName}([${r.componentName}])`
                    : `${r.parent ?? 'empty'} --o ${componentName}(${r.componentName})`);
        }

        return l.join('\n');
    });
    return ['flowchart LR', ...lines].join('\n');
};
