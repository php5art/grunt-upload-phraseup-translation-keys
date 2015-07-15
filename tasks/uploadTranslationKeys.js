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
    var baseUrl = 'https://phraseapp.com/api/v1/';
    var options = this.options({
      email: '',
      password: '',
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
    function authorization() {
      var deferred = q.defer();
      request.post({url: baseUrl + 'sessions', form: {email: options.email, password: options.password}},
        function (err, httpResponse, body) {
          var data = JSON.parse(body);
          if (data["success"]) {
            deferred.resolve(data);
          } else {
            deferred.reject(["Not authorized!"]);
          }
        });
      return deferred.promise;
    }

    function getAllRemoteKeys(token) {
      var deferred = q.defer();
      request.get({url: baseUrl + 'translation_keys', form: {auth_token: token}},
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

    function uploadDefaultTranslate(token, key, content){
      var deferred = q.defer();
      request.post({url: baseUrl + 'translations/store',
          form: {
            auth_token: token,
            locale: 'en',
            key: key,
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

    function uploadKey(token, newKey) {
      var deferred = q.defer();
      request.post({url: baseUrl + 'translation_keys',
          form: {
            auth_token: token,
            "translation_key[name]": newKey.key,
            "translation_key[description]": newKey.value
          }
        },
        function (err, httpResponse, body) {
          var data = JSON.parse(body);
          if(err){
            grunt.log.warn(err);
          }
          uploadDefaultTranslate(token, newKey.key, newKey.value).then(function(){
            grunt.log.writeln(newKey.key + " key to successfully UPLOAD to the server.");
            deferred.resolve(data);
          });
        });
      return deferred.promise;
    }

    function removeKey(token, key){
      var deferred = q.defer();
      request.del({url: baseUrl + 'translation_keys/' + key.id,
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

    authorization().then(function (data) {
      var token = data["auth_token"];
      grunt.log.writeln("Token created successfully - " + token);
      getAllRemoteKeys(token).then(function(keys){
        var promises = [];
        var remoteKeys = keys.map(function(e){return e.name; });
        //check new keys
        var localKeys = getAllLocalKeys();
        var newKeys = getNewKeys(remoteKeys, localKeys);
        newKeys.forEach(function(k){
          promises.push(uploadKey(token, k));
        });
        if(options.syncRemove){
          var deletedKeys = getDeletedKeys(keys, localKeys);
          deletedKeys.forEach(function(dk){
            promises.push(removeKey(token, dk));
          });
        }
        q.all(promises).then(function(){
          done();
        });
      }, showErrors);
    }, showErrors);
  });
};
