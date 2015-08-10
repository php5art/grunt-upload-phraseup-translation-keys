/*
 * uploadTranslationKeys
 *
 *
 * Copyright (c) 2015 Aleksey Belkin
 * Licensed under the MIT license.
 */

'use strict';

var request = require('request');
var q = require('q');
var _ = require('lodash');
var _eval = require('eval');
module.exports = function (grunt) {

  // Please see the Grunt documentation for more information regarding task
  // creation: http://gruntjs.com/creating-tasks

  grunt.registerMultiTask('uploadTranslationKeys', 'Task loading keys from .json file to PhraseApp service', function () {
    var done = this.async();
    var baseUrl = 'https://api.phraseapp.com/api/v2/';
    var options = this.options({
      token: '',
      projectName: '',
      defaultLocale: 'en',
      syncRemove:false,
      typeParse: 'json',
      regularExpression: "locale_en[\\s]*=[\\s]*(\\{[\\s]*(\".*\"[\\s]*:[\\s]*\".*\")*[\\s]*\\})",
      variableName: "locale_en"
    });
    var filesJson = [];
    function logObject(src){
      grunt.log.warn(JSON.stringify(src));
    }

    this.files.forEach(function (file) {
      var src = file.src.filter(function (filepath) {
        if (!grunt.file.exists(filepath)) {
          grunt.log.warn('Source file "' + filepath + '" not found.');
          return false;
        } else {
          return true;
        }
      }).map(function (filepath) {
        if(options.typeParse === 'json'){
          return grunt.file.readJSON(filepath);
        }
        else if(options.typeParse === 'regex'){
          var file = grunt.file.read(filepath);
          if(file){
            var regex = new RegExp(options.regularExpression, "i");
            var find = regex.exec(file);
            if(!find ||!find[1]){
              grunt.fail.fatal("Your pattern does not match the subject string.");
              done();
            }
            return JSON.parse(find[1]);
          }
        }else if(options.typeParse === 'eval'){
          var fileJs = grunt.file.read(filepath);
          if(fileJs){
            var regexJs = new RegExp(options.regularExpression, "i");
            var findJs = regexJs.exec(fileJs);
            if(!findJs ||!findJs[1]){
              grunt.fail.fatal("Your pattern does not match the subject string.");
              done();
            }
            try{
              return getJsonVariableFromText(findJs[1], options.variableName);
            }catch (e){
              grunt.fail.fatal("This string not converted to code.");
              done();
            }
          }
        }
        else{
          grunt.fail.fatal("TypeParse not support");
          done();
        }
      });
      filesJson = filesJson.concat(src);
    });

    function getJsonVariableFromText(text, variable){
      var evalText = text + "; exports.obj="+variable+";";
      var evalObj = _eval(evalText);
      return evalObj.obj;
    }

    function showErrors(errors){
      for (var err in errors) {
        grunt.fail.warn(errors[err]);
      }
      done();
    }
    function getProjectId(token) {
      var deferred = q.defer();
      request.get({url: baseUrl + 'projects', forms: {}, headers: {'Authorization': 'token '+token}},
        function (err, httpResponse, body) {
          var projects = JSON.parse(body);
          var project = _.findWhere(projects, {name: options.projectName});
          if (project) {
            deferred.resolve(project.id);
          } else {
            deferred.reject(["Project not exist!"]);
          }
        });
      return deferred.promise;
    }

    function getAllRemoteKeys(token, projectId) {
      var deferred = q.defer();
      request.get({url: baseUrl + 'projects/'+projectId+'/keys', forms: {}, headers: {'Authorization': 'token '+token}},
        function (err, httpResponse, body) {
          var keys = JSON.parse(body);
          if(!keys){
            deferred.reject('Failed to get the keys!');
          }
          deferred.resolve(keys);
        });
      return deferred.promise;
    }

    function getAllLocalKeys(){
      var localKeys = [];
      filesJson.forEach(function(json){
        for(var key in json){
          var localKey = _.findWhere(localKeys, {key: key});
          if(!localKey){
            localKeys.push({key: key, value: json[key]});
          }else{
            grunt.log.warn("Json files have are duplicate keys.");
          }
        }
      });
      return localKeys;
    }

    function getNewKeys(remoteKeys, localKeys){
      var newKeys = [];
      localKeys.forEach(function(k){
        if(remoteKeys.indexOf(k.key) === -1){
          newKeys.push(k);
        }
      });
      return newKeys;
    }

    function getDeletedKeys(remoteKeys, localKeys){
      var deletedKeys = [];
      remoteKeys.forEach(function(rk){
        var key = _.findWhere(localKeys, {key: rk.name});
        if(!key) {
          deletedKeys.push(rk);
        }
      });
      return deletedKeys;
    }

    function getDefaultLocale(token, projectId){
      var deferred = q.defer();
      request.get({url: baseUrl + 'projects/'+projectId+'/locales', headers: {'Authorization': 'token '+token}, forms: {}},
      function(err, httpResponse, body){
        if(err){
          grunt.log.warn(err);
        }
        var data = JSON.parse(body);
        var defaultLocale = _.findWhere(data, {'default': true});
        if(defaultLocale){
          deferred.resolve(defaultLocale.id);
        }else{
          grunt.log.warn("Default language not exist!");
        }
      });
      return deferred.promise;
    }

    function uploadDefaultTranslate(token, projectId, key, content){
      var deferred = q.defer();
      request.post({url: baseUrl + 'projects/'+projectId+'/translations', headers: {'Authorization': 'token '+token},
          form: {
            locale_id: 'en',
            key_id: key,
            content: content
          }
        },
        function (err, httpResponse, body) {
          var data = JSON.parse(body);
          if(err){
            grunt.log.warn(err);
          }
          deferred.resolve(data);
        });
      return deferred.promise;
    }

    function uploadKey(token, projectId, newKey) {
      var deferred = q.defer();
      request.post({url: baseUrl + 'projects/'+projectId+'/keys', headers: {'Authorization': 'token '+token},
          form: {
            "name": newKey.key,
            "description": newKey.value
          }
        },
        function (err, httpResponse, body) {
          var data = JSON.parse(body);
          if(err){
            grunt.log.warn(err);
          }
          uploadDefaultTranslate(token, projectId, data.id, newKey.value).then(function(){
            grunt.log.writeln(newKey.key + " key to successfully UPLOAD to the server.");
            deferred.resolve(data);
          });
        });
      return deferred.promise;
    }

    function removeKey(token, projectId, key){
      var deferred = q.defer();
      request.del({url: baseUrl + 'projects/'+projectId+'/keys', headers: {'Authorization': 'token '+token},
          form: {
            auth_token: token
          }
        },
        function (err, httpResponse, body) {
          var data = JSON.parse(body);
          if(err){
            grunt.log.warn(err);
          }
          if(!data.success){
            grunt.log.warn("Failed to remove the key from the server: "+key.name);
          }
          else{
            grunt.log.writeln(key.name + "key to successfully REMOVE from server.");
          }
          deferred.resolve(data);
        });
      return deferred.promise;
    }

    getProjectId(options.token).then(function (projectId) {
      grunt.log.writeln("Token created successfully - " + options.token);
      getDefaultLocale(options.token, projectId).then(function(localeId){
        getAllRemoteKeys(options.token, projectId).then(function(keys){
          var promises = [];
          var remoteKeys = keys.map(function(e){return e.name; });
          //check new keys
          var localKeys = getAllLocalKeys();
          var newKeys = getNewKeys(remoteKeys, localKeys);
          newKeys.forEach(function(k){
            promises.push(uploadKey(options.token, projectId, k));
          });
          if(options.syncRemove){
            var deletedKeys = getDeletedKeys(keys, localKeys);
            deletedKeys.forEach(function(dk){
              promises.push(removeKey(options.token, projectId, dk));
            });
          }
          q.all(promises).then(function(){
            done();
          });
        }, showErrors);
      }, showErrors);
    }, showErrors);
  });
};
