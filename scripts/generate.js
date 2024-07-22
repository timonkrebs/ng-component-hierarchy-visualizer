#!/usr/bin/env node
import fs from 'node:fs';


console.log(process.cwd());
const value = `sequenceDiagram
A->> B: Query
B->> C: Forward query
Note right of C: Thinking...
C->> B: Response
B->> A: Forward response`;

console.log(value);
// fs.writeFile('C:/tmp', value)
/*
    mermaidAPI.render('theGraph', value, function (svgCode) {
        console.log(svgCode);
    });
    */
