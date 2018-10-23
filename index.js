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

const NOT_MODIFIED = "not_modified";
const AUTO_BUILD_PERIOD_MS = 10000;
let running = false;    // build running flag

function requireBuild(rootdir, output, auto) {

    if (auto) {
        let globalCache = {};

        setInterval(() => {
            if (!running) {
                running = true;
                buildModuleCache(rootdir)
                    .then((cache) => {

                        // compare timestamp is changed
                        let keys = Object.keys(cache);
                        let modified = false;
                        for (let key of keys) {
                            if (typeof globalCache[key] === 'undefined'
                                || globalCache[key].timestamp !== cache[key].timestamp) {
                                modified = true;
                                break;
                            }
                        }

                        globalCache = cache;

                        if (modified) {
                            console.log("Detect modified files...");
                            return makeDependencyTree(cache);
                        }
                        else return Promise.reject(NOT_MODIFIED);
                    })
                    .then((res) => {
                        let cache = res.cache;
                        let depTree = res.depTree;
                        buildOutput(true, cache, depTree, output);
                        running = false;
                    })
                    .catch((err) => {
                        if (err !== NOT_MODIFIED) console.log(err);
                        running = false;
                    });
            }

        }, AUTO_BUILD_PERIOD_MS);

    } else {
        running = true;
        buildModuleCache(rootdir)
            .then((cache) => makeDependencyTree(cache))
            .then((res) => {
                let cache = res.cache;
                let depTree = res.depTree;
                buildOutput(true, cache, depTree, output);
                running = false;
            })
            .catch((err) => {
                console.log(err);
                running = false;
            });
    }
}

// shutdown hook
process.on('SIGINT', () => {
    console.log('Wait until remaining build process done...');
    let f = () => {
        if (running) setTimeout(f, 1000);
        else process.exit(0);
    };
    setTimeout(f, 1000);
});

function buildModuleCache(dir) {
    return new Promise((resolve, reject) => {
        let cache = {};

        // traverse dir and save filename into module cache
        traverseDir(dir, cache, '', (dir, prefix, file, timestamp) => {
                let key = generateKey(prefix, file);
                cache[key] = {'real_path' : dir + '/' + file, 'timestamp': timestamp};
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
                            work(dir, prefix, file, stats.mtimeMs);
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
                    let comment = "\n/**\n" +
                        "* require-concat origin file : " + cache[key].real_path +
                        "\n*/\n";

                    cache[key].code = comment + '__module_exports_cache[\'' + key + '\'] = { exports: {} };\n' +
                        '(function(module, exports) { \n' + data + '})(__module_exports_cache[\'' + key + '\'], ' +
                        '__module_exports_cache[\'' + key + '\'].exports);\n';

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
        header = '/** \n * build time: ' + new Date() + '\n */\n';
        header += '__module_exports_cache = {};\n'
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
    Object.keys(depTree).forEach((key) => {
        if (depTree[key].refs.length === 0) {
            // can be entry point
            dfs(cache, depTree, marked, onStack, key, output);
        }
    });

    // 3. wait until all dependencies are written.
    console.log("Build Succeed");
}

function dfs(cache, depTree, marked, onStack, key, output) {

    if (marked[key]) return;    // already visited

    let stdout = !output;
    marked[key] = true;
    onStack[key] = true;

    // visit adjacent
    let cycleDetected = false;
    let cycleAdj = '';

    depTree[key].deps.forEach((adj) => {
        if (!marked[adj]) {
            dfs(cache, depTree, marked, onStack, adj, output);
        } else if (onStack[adj]) {
            // cycle detect
            cycleDetected = true;
            cycleAdj = adj;
        }
    });

    if (cycleDetected) {
        throw new Error('Circular dependency is detected between module[\'' + key + '\'] and module[\'' + cycleAdj + '\']');
    }

    onStack[key] = false;

    // flush cache entry into file
    if (!depTree[key].flush && typeof cache[key] !== 'undefined') {

        if (!stdout) {
            fs.writeFileSync(output
                , cache[key].code
                , {encoding: 'utf8', flag: 'a'});
        } else {
            // stdout
            console.log(cache[key].code);
            cache[key] = undefined;     // cache clear
            depTree[key].flush = true;
        }
    }
}

function generateKey(prefix, file) {
    file = file.replace('.js', '');
    prefix = prefix.startsWith('/') ? prefix.slice(1) : prefix;

    if (file === 'index') file = '';
    if (prefix !== '' && file !== '' && !prefix.endsWith('/')) prefix = prefix + '/';

    return prefix + file;
}