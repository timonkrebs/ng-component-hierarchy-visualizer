import fs from 'node:fs';
import path from 'path';
import { addTemplateElements } from './template.helper.js';
import { extractRoutesFromTS } from './route.helper.js';
import { ROUTES_REGEX_LIST, flattenRoutes, resolveComponents } from './component.helper.js';
import { addServices } from './service.helper.js';

export const main = (args) => {
    process.env.INIT_CWD = args.basePath;
    const routesFileContent = fs.readFileSync(path.join(args.basePath, `./${args.routesFilePath}`), 'utf-8');
    const match = ROUTES_REGEX_LIST.map(regex => routesFileContent.match(regex)).find(match => match);
    const routes = extractRoutesFromTS(match[1]);
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

        if (r.subgraph === 'start') {
            l.push(`subgraph ${r.parent ?? 'empty'}`);
            l.push('direction LR');
        } else if (r.lazy) {
            l.push(`${r.parent ?? 'empty'} -.-o ${r.componentName}(${r.componentName})`);
        } else {
            l.push(r.type === 'service'
                ? `${r.parent ?? 'empty'} --- ${r.componentName}{{${r.componentName}}}`
                : r.type === 'import'
                    ? `${r.parent ?? 'empty'} ---${r.componentName}([${r.componentName}])`
                    : `${r.parent ?? 'empty'} --o ${r.componentName}(${r.componentName})`);
        }

        return l.join('\n');
    });
    return ['flowchart LR', ...lines].join('\n');
};
