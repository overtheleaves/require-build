const fs = require('fs');

module.exports = requireBuild;

var cache = {};
var depTree = {};
var totalCount = 0;

function requireBuild(rootdir, output, prefix) {

    totalCount = 0;

    // build dependency tree
    fs.readdir(rootdir, function (err, files) {
        files.forEach(function (file) {
            fs.stat(rootdir + '/' + file, function(err, stats) {
                if (stats.isDirectory()) {
                    // recursive call
                    requireBuild(rootdir + '/' + file, output, prefix + '/' + file);
                } else {
                    begin();
                    var key = generateKey(prefix, file);
                    makeDependencyTree(key, rootdir, file, output);
                }
            });
        });
    });
}

// call when start making dependency tree
function begin() {
    totalCount++;
}

// call when after adding item in dependency tree
function done(output) {
    if (totalCount == Object.keys(depTree).length
        && totalCount == Object.keys(cache).length) {
        buildOutput(output);
    }
}

function generateKey(prefix, file) {
    file = file.replace('.js', '');
    prefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;

    if (file === 'index') file = '';
    if (prefix !== '' && file !== '') prefix = prefix + '/';

    return prefix + file;
}

function makeDependencyTree(key, rootdir, file, output) {
    fs.readFile(rootdir + '/' + file, 'utf8', function(err, data) {
        if (err) throw err;

        // 1. caching file contents
        var comment = "/**\n" +
            "* require-concat origin file : " + rootdir + '/' + file +
            "\n*/\n\n";

        cache[key] = comment + '__module_exports_cache[\'' + key + '\'] = { exports: {} };\n' +
            '(function(module, exports) { \n' + data + '})(__module_exports_cache[\'' + key + '\'], ' +
            '__module_exports_cache[\'' + key + '\'].exports);';

        // 2. make dependency tree
        var m = data.match(/require[\s]*\([\s]*[\'|\"]([^)]+)[\'|\"][\s]*\)/g);

        if (typeof m !== 'undefined' && m != null && m.length > 0) {

            if (typeof depTree[key] === 'undefined') {
                depTree[key] = { deps: [], refs: [], flush: false};
            }

            // add adjacent node
            for (var i = 0; i < m.length; i++) {
                var k = m[i];
                k = k.match(/^require[\s]*\([\s]*[\'|\"]([^)]+)[\'|\"][\s]*\)$/)[1];

                if (typeof depTree[k] === 'undefined') {
                    depTree[k] = { deps: [], refs: [], flush: false};
                }

                depTree[key].deps.push(k);
                depTree[k].refs.push(key);
            }
        }

        done(output);
    });
}

function buildOutput(output) {

    // 1. clear output file
    var header = '__module_exports_cache = {};\n'
    + 'function require(path) {'
    +   'return __module_exports_cache[path].exports;'
    +   '};\n\n';

    fs.writeFileSync(output, header, 'utf8', function(err) {
        if (err) throw err;
    });

    // 2. iter dependency tree and build output
    Object.keys(depTree).forEach(function(key) {
        if (depTree[key].refs.length === 0) {
            // can be entry point
            dfs(key, output);
        }
    });

    console.log("Build Succeed");
}

function dfs(key, output) {

    // visit adjacent
    depTree[key].deps.forEach(function(adj) {
        dfs(adj, output);
    });

    // flush cache entry into file
    if (!depTree[key].flush && typeof cache[key] !== 'undefined') {
        fs.writeFile(output
            , cache[key]
            , {encoding: 'utf8', flag: 'a'}
            , function(err) {
                if (err) throw err;
                cache[key] = undefined;     // cache clear
                depTree[key].flush = true;
            });
    }
}