const ROOT_COMPONENT = 'Root';

export const extractRoutesFromTS = (routesString, rootName = ROOT_COMPONENT) => {
    const wrappedRoutesString = routesString
        // 1. Remove canActivate Guards:
        .replace(
            /canActivate:\s*\[[^\]]*\],?\s*/g,
            ''
        )
        // 1.2 Remove canMatch Guards:
        .replace(
            /canActivateChild:\s*\[[^\]]*\],?\s*/g,
            ''
        )
        // 1.3 Remove canDeactivate Guards:
        .replace(
            /canDeactivate:\s*\[[^\]]*\],?\s*/g,
            ''
        )
        // 1.4 Remove canMatch Guards:
        .replace(
            /canMatch:\s*\[[^\]]*\],?\s*/g,
            ''
        )
        // 1.5 Remove data:
        .replace(
            /data:\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\},?\s*/g,
            ''
        )
        // 1.6 Remove resolve:
        .replace(
            /resolve:\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\},?\s*/g,
            ''
        )
        // 2. Replace Lazy Loaded Routes with Simplified Syntax:
        //    This matches routes with the pattern `() => import(path).then(m => m.componentName)`
        //    and transforms them into `{ path, componentName, parent }` objects
        .replace(
            /\(\)\s*=>\s*import\((.*?)\)\s*\.then\(\s*\(?(\w+)\)?\s*=>\s*\2\.(\w+),?\s*\)/g,
            `$1, componentName: "$3", parent: "${rootName}"`
        )
        // 3. Replace Lazy Loaded Routes wothout explicit Type .then(m => m.componentName) with Simplified Syntax:
        //    This matches routes with the pattern `() => import(path)` and 
        //    transforms them into `{ path, componentName, parent }` objects
        //    It uses the path also as the componentName
        .replace(
            /\(\)\s*=>\s*import\(([\s\S]*?)\)/g,
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
            "");

    const routes = JSON.parse(wrappedRoutesString)
    return routes;
};