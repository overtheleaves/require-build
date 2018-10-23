#!/usr/local/bin/node

var requireBuild = require('./index').requireBuild;
var parseargs = require('parse-args');

console.log(process.argv.slice(2));
var argv = parseargs(process.argv.slice(2));

console.log("javascript require build root = " + argv.build);
console.log("javascript require output = " + argv.output);
if (argv.auto) console.log("auto build mode...");

requireBuild(argv.build, argv.output, argv.auto);

