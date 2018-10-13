const assert = require('assert');
const test = require('../').test;
const fs = require('fs');

describe('test suite', function() {

    let path = 'test/testdir';
    let cache1 = {
        'is/aa': {real_path: path + '/is/aa.js'}
        , 'is/aaa': {real_path: path + '/is/aaa.js'}
        , 'is/a/bb': {real_path: path + '/is/a/bb.js'}
        , 'is/a/bbb': {real_path: path + '/is/a/bbb.js'}
        , 'is/a/test/cc': {real_path: path + '/is/a/test/cc.js'}
        , 'is/a/module': {real_path: path + '/is/a/module/index.js'}
    };

    let cache2 = {
        'is/aa': {real_path: path + '/is/aa.js', code: 'aa'}
        , 'is/aaa': {real_path: path + '/is/aaa.js', code: 'aaa'}
        , 'is/a/bb': {real_path: path + '/is/a/bb.js', code: 'bb'}
        , 'is/a/bbb': {real_path: path + '/is/a/bbb.js', code: 'bbb'}
        , 'is/a/test/cc': {real_path: path + '/is/a/test/cc.js', code: 'cc'}
        , 'is/a/module': {real_path: path + '/is/a/module/index.js', code: 'index'}
    };

    let hook;   // stdout hook

    let depTree = {
        'is/aa': {
            deps: ['is/aaa']
            , refs: ['is/a/bb']
            , flush: false
        }, 'is/aaa': {
            deps: ['is/a/module']
            , refs: ['is/aa']
            , flush: false
        }, 'is/a/bb': {
            deps: ['is/aa']
            , refs: ['is/a/bbb']
            , flush: false
        }, 'is/a/bbb': {
            deps: ['is/a/bb']
            , refs: []
            , flush: false
        }, 'is/a/test/cc': {
            deps: []
            , refs: ['is/a/module']
            , flush: false
        }, 'is/a/module': {
            deps: ['is/a/test/cc']
            , refs: ['is/aaa']
            , flush: false
        }
    };

    before('create test dir', () => {

        fs.mkdirSync(path);
        fs.mkdirSync(path + '/is');
        fs.mkdirSync(path + '/is/a');
        fs.mkdirSync(path + '/is/a/test');

        fs.mkdirSync(path + '/is/a/module');

        fs.writeFileSync(path + '/is/aa.js', 'require(\'is/aaa\') require(\'is/a/bb\')', 'utf8');
        fs.writeFileSync(path + '/is/aaa.js', 'require(\'is/a/module\')', 'utf8');
        fs.writeFileSync(path + '/is/a/bb.js', '', 'utf8');
        fs.writeFileSync(path + '/is/a/bbb.js', 'require(\'is/a/bb\')', 'utf8');
        fs.writeFileSync(path + '/is/a/test/cc.js', 'require(\'is/a/module\')', 'utf8');
        fs.writeFileSync(path + '/is/a/module/index.js', '', 'utf8');

    });

    after('destroy test dir', () => {
        fs.unlinkSync(path + '/is/aa.js');
        fs.unlinkSync(path + '/is/aaa.js');
        fs.unlinkSync(path + '/is/a/bb.js');
        fs.unlinkSync(path + '/is/a/bbb.js');
        fs.unlinkSync(path + '/is/a/test/cc.js');
        fs.unlinkSync(path + '/is/a/module/index.js');

        fs.rmdirSync(path + '/is/a/module');
        fs.rmdirSync(path + '/is/a/test');
        fs.rmdirSync(path + '/is/a');
        fs.rmdirSync(path + '/is');
        fs.rmdirSync(path);
    });

    beforeEach(() => {
        hook = captureStream(process.stdout);
    });
    afterEach(() => {
        hook.unhook();
    });

    it('buildModuleCache', (done) => {
        test.buildModuleCache(path, {})
            .then((cache) => {
                assert.deepEqual(cache, {
                    'is/aa': {real_path: path + '/is/aa.js'}
                    , 'is/aaa': {real_path: path + '/is/aaa.js'}
                    , 'is/a/bb': {real_path: path + '/is/a/bb.js'}
                    , 'is/a/bbb': {real_path: path + '/is/a/bbb.js'}
                    , 'is/a/test/cc': {real_path: path + '/is/a/test/cc.js'}
                    , 'is/a/module': {real_path: path + '/is/a/module/index.js'}
                });
                done();
            })
            .catch(done);
    });

    it('makeDependencyTree', (done) => {
        test.makeDependencyTree(cache1)
            .then((res) => {
                assert.deepEqual(res.depTree, {
                    'is/aa': {
                        deps: ['is/aaa', 'is/a/bb']
                        , refs: []
                        , flush: false
                    }, 'is/aaa': {
                        deps: ['is/a/module']
                        , refs: ['is/aa']
                        , flush: false
                    }, 'is/a/bb': {
                        deps: []
                        , refs: ['is/aa', 'is/a/bbb']
                        , flush: false
                    }, 'is/a/bbb': {
                        deps: ['is/a/bb']
                        , refs: []
                        , flush: false
                    }, 'is/a/test/cc': {
                        deps: ['is/a/module']
                        , refs: []
                        , flush: false
                    }, 'is/a/module': {
                        deps: []
                        , refs: ['is/aaa', 'is/a/test/cc']
                        , flush: false
                    }
                });

                done();
            })
            .catch(done);
    });

    it('buildOutput', (done) => {
        test.buildOutput(false, cache2, depTree)
            .then(() => {
                assert.equal(hook.captured(), '\ncc\n' +
                    'index\n' +
                    'aaa\n' +
                    'aa\n' +
                    'bb\n' +
                    'bbb\n' +
                    'Build Succeed\n');
                done();
            })
            .catch((done));
    });
});

function captureStream(stream) {
    let oldWrite = stream.write;
    let buf = '';

    stream.write = (chunk) => {
        buf += chunk.toString(); // chunk is a String or Buffer
        oldWrite.apply(stream, arguments);
    };

    return {
        unhook: () => stream.write = oldWrite
        , captured: () => buf
    };
}

