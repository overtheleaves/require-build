const assert = require('assert');
const test = require('../').test;
const fs = require('fs');

describe('test suite', function() {

    var path = 'test/testdir';

    before('create test dir', function() {

        fs.mkdirSync(path);
        fs.mkdirSync(path + '/is');
        fs.mkdirSync(path + '/is/a');
        fs.mkdirSync(path + '/is/a/test');

        fs.mkdirSync(path + '/is/a/module');

        fs.writeFileSync(path + '/is/aa.js', '', 'utf8');
        fs.writeFileSync(path + '/is/aaa.js', '', 'utf8');
        fs.writeFileSync(path + '/is/a/bb.js', '', 'utf8');
        fs.writeFileSync(path + '/is/a/bbb.js', '', 'utf8');
        fs.writeFileSync(path + '/is/a/test/cc.js', '', 'utf8');
        fs.writeFileSync(path + '/is/a/module/index.js', '', 'utf8');

    });

    // after('destroy test dir', function() {
    //     fs.unlinkSync(path + '/is/aa.js');
    //     fs.unlinkSync(path + '/is/aaa.js');
    //     fs.unlinkSync(path + '/is/a/bb.js');
    //     fs.unlinkSync(path + '/is/a/bbb.js');
    //     fs.unlinkSync(path + '/is/a/test/cc.js');
    //     fs.unlinkSync(path + '/is/a/module/index.js');
    //
    //     fs.rmdirSync(path + '/is/a/module');
    //     fs.rmdirSync(path + '/is/a/test');
    //     fs.rmdirSync(path + '/is/a');
    //     fs.rmdirSync(path + '/is');
    //     fs.rmdirSync(path);
    // });

    it('buildModuleCache', function() {
        test.buildModuleCache(path)
            .then(function(cache) {
                assert.deepEqual(cache, {
                    'is/aa': {real_path: path + '/is/aa.js'}
                    , 'is/aaa': {real_path: path + '/is/aaa.js'}
                    , 'is/a/bb': {real_path: path + '/is/a/bb.js'}
                    , 'is/a/bbb': {real_path: path + '/is/a/bbb.js'}
                    , 'is/a/test/cc': {real_path: path + '/is/a/test/cc.js'}
                    , 'is/a/module': {real_path: path + '/is/a/module/index.js'}
                });
            })
            .catch(function(err) {
                console.error(err);
            });
    })
});
