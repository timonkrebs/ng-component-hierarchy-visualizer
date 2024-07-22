// import mermaidAPI from 'mermaid';
import fs from 'node:fs';

// mermaidAPI.initialize({ startOnLoad: false });

export function generateMermaidSyntax() {

    console.log(fs.Dir)
    const value = `sequenceDiagram
A->> B: Query
B->> C: Forward query
Note right of C: Thinking...
C->> B: Response
B->> A: Forward response`;

console.log(value)
/*
    mermaidAPI.render('theGraph', value, function (svgCode) {
        console.log(svgCode);
    });
    */
}
