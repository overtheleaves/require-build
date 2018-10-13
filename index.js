const fs = require('fs');

module.exports.requireBuild = requireBuild;
module.exports.test = { buildModuleCache: buildModuleCache};


/**
 * require-build
 * 1. traverse rootdir and save filename into module cache
 * 2. traverse module cache and make dependency tree
 * 3. traverse dependency tree and build output js
 */

var depTree = {};

function requireBuild(rootdir, output, prefix) {

    // buildModuleCache(rootdir)
    //     .then(function() {
    //         return makeDependencyTree();
    //     })
    //     .then(function() {
    //         return buildOutput();
    //     });
}

function buildModuleCache(dir) {
    return new Promise(function (resolve, reject) {
        try {
            var cache = {};

            traverseDir(dir, cache, '')
                .then(function() {
                    resolve(cache);
                })
                .catch(function(err) {
                    reject(err);
                });

        } catch (e) {
            reject(e);
        }
    });
}

function traverseDir(dir, cache, prefix) {
    return new Promise(function (resolve, reject) {

        fs.readdir(dir, function(err, files) {

            if (err) reject(err);

            var promises = [];
            files.forEach(function (file) {
                promises.push(new Promise( function (resolve1, reject1) {
                    fs.stat(dir + '/' + file, function (err, stats) {
                        if (err) {
                            reject1(err);
                            return;
                        }

                        if (stats.isDirectory()) {
                            traverseDir(dir + '/' + file, cache, prefix + '/' + file)
                                .then(function() {
                                    resolve1();
                                })
                                .catch(function(err) {
                                    reject1(err);
                                });
                        } else {
                            var key = generateKey(prefix, file);
                            cache[key] = {'real_path' : dir + '/' + file};
                            resolve1();
                        }
                    });
                }));
            });

            Promise.all(promises)
                .then(function() {
                    resolve();
                })
                .catch(function(err) {
                    reject(err);
                });
        });
    });
}

function makeDependencyTree() {
    return new Promise(function (resolve, reject) {

    });
}

function buildOutput() {
    return new Promise(function (resolve, reject) {

    });
}
//
//
// // call when start making dependency tree
// function begin() {
//     totalCount++;
// }
//
// // call when after adding item in dependency tree
// function done(output) {
//     console.log("tree = " );
//     console.log(depTree);
//
//     if (totalCount == Object.keys(depTree).length
//         && totalCount == Object.keys(cache).length) {
//         buildOutput(output);
//     }
// }
//
function generateKey(prefix, file) {
    file = file.replace('.js', '');
    prefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;

    if (file === 'index') file = '';
    if (prefix !== '' && file !== '' && !prefix.endsWith('/')) prefix = prefix + '/';

    return prefix + file;
}
//
// function makeDependencyTree(key, rootdir, file, output) {
//     fs.readFile(rootdir + '/' + file, 'utf8', function(err, data) {
//         if (err) throw err;
//
//         // 1. caching file contents
//         var comment = "/**\n" +
//             "* require-concat origin file : " + rootdir + '/' + file +
//             "\n*/\n\n";
//
//         cache[key] = comment + '__module_exports_cache[\'' + key + '\'] = { exports: {} };\n' +
//             '(function(module, exports) { \n' + data + '})(__module_exports_cache[\'' + key + '\'], ' +
//             '__module_exports_cache[\'' + key + '\'].exports);';
//
//         // 2. make dependency tree
//         var m = data.match(/require[\s]*\([\s]*[\'|\"]([^)]+)[\'|\"][\s]*\)/g);
//
//         if (typeof m !== 'undefined' && m != null && m.length > 0) {
//
//             if (typeof depTree[key] === 'undefined') {
//                 depTree[key] = { deps: [], refs: [], flush: false};
//             }
//
//             // add adjacent node
//             for (var i = 0; i < m.length; i++) {
//                 var k = m[i];
//                 k = k.match(/^require[\s]*\([\s]*[\'|\"]([^)]+)[\'|\"][\s]*\)$/)[1];
//
//                 if (typeof depTree[k] === 'undefined') {
//                     depTree[k] = { deps: [], refs: [], flush: false};
//                 }
//
//                 depTree[key].deps.push(k);
//                 depTree[k].refs.push(key);
//             }
//         }
//
//         done(output);
//     });
// }
//
// function buildOutput(output) {
//
//     // 1. clear output file
//     var header = '__module_exports_cache = {};\n'
//     + 'function require(path) {'
//     +   'return __module_exports_cache[path].exports;'
//     +   '};\n\n';
//
//     fs.writeFileSync(output, header, 'utf8', function(err) {
//         if (err) throw err;
//     });
//
//     // 2. iter dependency tree and build output
//     Object.keys(depTree).forEach(function(key) {
//         if (depTree[key].refs.length === 0) {
//             // can be entry point
//             dfs(key, output);
//         }
//     });
//
//     console.log("Build Succeed");
// }
//
// function dfs(key, output) {
//
//     // visit adjacent
//     depTree[key].deps.forEach(function(adj) {
//         dfs(adj, output);
//     });
//
//     // flush cache entry into file
//     if (!depTree[key].flush && typeof cache[key] !== 'undefined') {
//         fs.writeFile(output
//             , cache[key]
//             , {encoding: 'utf8', flag: 'a'}
//             , function(err) {
//                 if (err) throw err;
//                 cache[key] = undefined;     // cache clear
//                 depTree[key].flush = true;
//             });
//     }
// }