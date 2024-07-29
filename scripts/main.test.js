import { extractRoutesFromTS, flattenRoutes, resolveComponents, addDependencies, generateMermaid, main } from './helper'; // Adjust the path as needed

describe('extractRoutesFromTS', () => {
    it('should extract routes from TypeScript content', () => {
        const fileContent = `
            const routes: Routes = [
                { path: '', component: HomeComponent },
                { path: 'about', component: AboutComponent }
            ];
        `;
        const expectedRoutes = [
            { path: '', component: 'HomeComponent', parent: 'AppComponent' },
            { path: 'about', component: 'AboutComponent', parent: 'AppComponent' }
        ];
        const routes = extractRoutesFromTS(fileContent);
        expect(routes).toEqual(expectedRoutes);
    });
});

describe('flattenRoutes', () => {
    it('should flatten nested routes', () => {
        const nestedRoutes = [
            { path: '', component: 'HomeComponent', children: [
                { path: 'child', component: 'ChildComponent' }
            ]}
        ];
        const expectedRoutes = [
            { path: 'child', component: 'ChildComponent' },
            { path: '', component: 'HomeComponent', "children": null }
        ];
        const flatRoutes = flattenRoutes(nestedRoutes);
        expect(flatRoutes).toEqual(expectedRoutes);
    });
});

describe('resolveComponents', () => {
    it('should resolve components from routes', () => {
        process.env.INIT_CWD = "."
        const routes = [
            { path: '', component: 'HomeComponent' },
            { path: 'lazy', loadComponent: './lazy.component.ts' }
        ];
        const routesFileContent = `
            import { HomeComponent } from './home.component';
            import { LazyComponent } from './lazy.component';
        `;
        const expectedComponents = [
            { path: '', loadComponent: './home.component', componentType: 'HomeComponent', lazy: false, type: 'component' },
            { path: 'lazy', loadComponent: 'lazy.component.ts', lazy: true, type: 'component' }
        ];
        const components = resolveComponents(routes, routesFileContent);
        expect(components).toEqual(expectedComponents);
    });
});

describe('addDependencies', () => {
    it('should add dependencies to components', () => {
        const components = [
            { path: '', loadComponent: './home.component', componentType: 'HomeComponent', parent: 'AppComponent', lazy: false, type: 'component' }
        ];
        const expectedDependencies = [
            { path: '', loadComponent: './home.component', componentType: 'HomeComponent', parent: 'AppComponent', lazy: false, type: 'component' }
        ];
        const dependencies = addDependencies(components);
        expect(dependencies).toEqual(expectedDependencies);
    });
});

describe('generateMermaid', () => {
    it('should generate Mermaid diagram from routes', () => {
        const routes = [
            { path: '', componentType: 'HomeComponent', parent: 'AppComponent', type: 'component' }
        ];
        const expectedOutput = `
flowchart LR
AppComponent --> HomeComponent(HomeComponent)
        `.trim();
        expect(generateMermaid(routes)).toEqual(expectedOutput);
    });
});

describe('generateMain', () => {
    it('should resolve components from routes', () => {
        process.env.INIT_CWD = "./tests/route-definitions/ngx-admin";
        const routes = [
            { path: '', component: 'HomeComponent' },
            { path: 'lazy', loadComponent: './lazy.component.ts' }
        ];
        const routesFileContent = `
            import { HomeComponent } from './home.component';
            import { LazyComponent } from './lazy.component';
        `;
        const expectedComponents = [
            { path: '', loadComponent: './home.component', componentType: 'HomeComponent', lazy: false, type: 'component' },
            { path: 'lazy', loadComponent: 'lazy.component.ts', lazy: true, type: 'component' }
        ];
        const components = main('app-routing.module.ts');
        expect(components).toMatchSnapshot();
    });
});