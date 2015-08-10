/*
 * uploadTranslationKeys
 *
 *
 * Copyright (c) 2015 Aleksey Belkin
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function (grunt) {
  // load all npm grunt tasks
  require('load-grunt-tasks')(grunt);

  // Project configuration.
  grunt.initConfig({
    jshint: {
      all: [
        'Gruntfile.js',
        'tasks/*.js',
        '<%= nodeunit.tests %>'
      ],
      options: {
        jshintrc: '.jshintrc',
        reporter: require('jshint-stylish')
      }
    },

    // Before generating any new files, remove any previously-created files.
    clean: {
      tests: ['tmp']
    },

    // Configuration to be run (and then tested).
    uploadTranslationKeys: {
      default_options: {
        options: {
          token: 'd0d8b0386404664c73b86278b1831f39049688f24ce9cfb50a72bfbc8be715f4',
          projectName: 'Lean Business Planner',
          syncRemove: true,
          typeParse: 'eval',
          regularExpression: "\\/\\*startJson\\*\\/([^]*)\\/\\*stopJson\\*\\/"
        },
        src: ['test/json/en.js']
        //files: {
        //  'tmp/default_options': ['test/fixtures/testing', 'test/fixtures/123']
        //}
      }
    },

    // Unit tests.
    nodeunit: {
      tests: ['test/*_test.js']
    }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['clean', 'uploadTranslationKeys']);
  grunt.registerTask('debug', ['clean', 'uploadTranslationKeys']);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'debug']);

};
