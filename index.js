const fs = require('fs');

module.exports.requireBuild = requireBuild;
module.exports.test = { buildModuleCache: buildModuleCache
                        , makeDependencyTree: makeDependencyTree
                        , buildOutput: buildOutput};


/**
 * require-build
 * 1. traverse rootdir and save filename into module cache
 * 2. traverse module cache and make dependency tree
 * 3. traverse (dfs) dependency tree and build output js (topological sort)
 */

function requireBuild(rootdir, output) {

    buildModuleCache(rootdir)
        .then((cache) => makeDependencyTree(cache))
        .then((res) => {
            let cache = res.cache;
            let depTree = res.depTree;
            return buildOutput(true, cache, depTree, output);
        });
}

function buildModuleCache(dir) {
    return new Promise((resolve, reject) => {
        let cache = {};

        // traverse dir and save filename into module cache
        traverseDir(dir, cache, '', (dir, prefix, file) => {
                let key = generateKey(prefix, file);
                cache[key] = {'real_path' : dir + '/' + file};
            })
            .then(function() {
                resolve(cache);
            })
            .catch(function(err) {
                reject(err);
            });
    });
}

function traverseDir(dir, cache, prefix, work) {
    return new Promise((resolve, reject) => {

        fs.readdir(dir, (err, files) => {

            if (err) reject(err);

            let promises = [];

            files.forEach((file) => {
                promises.push(new Promise((resolve1, reject1) => {
                    fs.stat(dir + '/' + file, (err, stats) => {

                        if (err) {
                            reject1(err);
                            return;
                        }

                        if (stats.isDirectory()) {
                            traverseDir(dir + '/' + file, cache, prefix + '/' + file, work)
                                .then(function() {
                                    resolve1();
                                })
                                .catch(function(err) {
                                    reject1(err);
                                });

                        } else {
                            work(dir, prefix, file);
                            resolve1();
                        }
                    });
                }));
            });

            Promise.all(promises)
                .then(() => resolve())
                .catch(err => reject(err));
        });
    });
}

function makeDependencyTree(cache) {
    return new Promise(function (resolve, reject) {

        let promises = [];
        let depTree = {};

        Object.keys(cache).forEach((key) => {

            promises.push(new Promise((resolve1, reject1) => {
                fs.readFile(cache[key].real_path, 'utf8', (err, data) => {

                    if (err) {
                        reject1(new Error('Error occur while building file ' + cache[key].real_path + '\n' + err.message));
                        return;
                    }

                    // 1. caching file contents
                    let comment = "/**\n" +
                            "* require-concat origin file : " + cache[key].real_path +
                            "\n*/\n\n";

                    cache[key].code = comment + '__module_exports_cache[\'' + key + '\'] = { exports: {} };\n' +
                        '(function(module, exports) { \n' + data + '})(__module_exports_cache[\'' + key + '\'], ' +
                        '__module_exports_cache[\'' + key + '\'].exports);';

                    // 2. make dependency tree
                    let m = data.match(/require[\s]*\([\s]*[\'|\"]([^)]+)[\'|\"][\s]*\)/g);

                    if (typeof m !== 'undefined' && m != null && m.length > 0) {

                        if (typeof depTree[key] === 'undefined') {
                            depTree[key] = { deps: [], refs: [], flush: false};
                        }

                        // add adjacent node
                        for (let i = 0; i < m.length; i++) {
                            let k = m[i];
                            k = k.match(/^require[\s]*\([\s]*[\'|\"]([^)]+)[\'|\"][\s]*\)$/)[1];

                            if (typeof depTree[k] === 'undefined') {
                                depTree[k] = { deps: [], refs: [], flush: false};
                            }

                            depTree[key].deps.push(k);
                            depTree[k].refs.push(key);
                        }
                    }

                    resolve1();
                });
            }));
        });

        Promise.all(promises)
            .then(() => resolve({cache: cache, depTree: depTree}))
            .catch(err => reject(err));
    });
}

function buildOutput(headerIncluded, cache, depTree, output) {

    let stdout = !output;
    let marked = {};
    let onStack = {};

    // 1. clear output file
    let header = '';
    if (headerIncluded) {
        header = '__module_exports_cache = {};\n'
            + 'function require(path) {'
            +   'return __module_exports_cache[path].exports;'
            +   '};\n\n';
    }

    if (stdout) {
        console.log(header);
    } else {
        fs.writeFileSync(output, header, 'utf8');
    }

    // 2. iter dependency tree and build output
    let promises = [];
    Object.keys(depTree).forEach((key) => {
        if (depTree[key].refs.length === 0) {
            // can be entry point
            promises.push(new Promise((resolve, reject) => {
                dfs(cache, depTree, marked, onStack, key, output)
                    .then(() => resolve())
                    .catch((err) => reject(err));
            }));
        }
    });

    // 3. wait until all dependencies are written.
    return new Promise((resolve, reject) => {
        Promise.all(promises)
            .then(() => {
                console.log("Build Succeed");
                resolve();
            })
            .catch((err) => {
                console.error(err.message);
                console.error("Build Failed");
                reject(err);
            });
    });
}

function dfs(cache, depTree, marked, onStack, key, output) {

    if (marked[key]) return;    // already visited

    let stdout = !output;
    marked[key] = true;
    onStack[key] = true;

    return new Promise((resolve, reject) => {
        // visit adjacent
        let promises = [];
        let cycleDetected = false;
        let cycleAdj = '';

        depTree[key].deps.forEach((adj) => {
            if (!marked[adj]) {
                promises.push(new Promise((resolve1, reject1) => {
                    dfs(cache, depTree, marked, onStack, adj, output)
                        .then(() => resolve1())
                        .catch((err) => reject1(err));
                }));
            } else if (onStack[adj]) {
                // cycle detect
                cycleDetected = true;
                cycleAdj = adj;
            }
        });

        if (cycleDetected) {
            reject(new Error('Circular dependency is detected between module[\'' + key + '\'] and module[\'' + cycleAdj + '\']'));
            return;
        }

        onStack[key] = false;

        // make sure all adjacent visit done.
        Promise.all(promises)
            .then(() => {
                // flush cache entry into file
                if (!depTree[key].flush && typeof cache[key] !== 'undefined') {

                    if (!stdout) {
                        fs.writeFile(output
                            , cache[key].code
                            , {encoding: 'utf8', flag: 'a'}
                            , (err) => {
                                if (err) {
                                    reject(err);
                                    return;
                                }
                                cache[key] = undefined;     // cache clear
                                depTree[key].flush = true;
                                resolve();
                            });
                    } else {
                        // stdout
                        console.log(cache[key].code);
                        cache[key] = undefined;     // cache clear
                        depTree[key].flush = true;
                        resolve();
                    }
                } else {
                    resolve();
                }
            })
            .catch((err) => reject(err));
    });
}

function generateKey(prefix, file) {
    file = file.replace('.js', '');
    prefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;

    if (file === 'index') file = '';
    if (prefix !== '' && file !== '' && !prefix.endsWith('/')) prefix = prefix + '/';

    return prefix + file;
}