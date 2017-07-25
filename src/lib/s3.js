'use strict';

var AWS = require('aws-sdk');
var fs = require('fs');
var logger = require('./logger');
var ld = require('lodash');

// For teasing a directory path out of an absolute file path
var path = require('path');
var workDir = './';

// We wish to have a promisified version of mkdirp()
var Promise = require('bluebird');
var stat = Promise.promisify(fs.stat);
var mkdirp = Promise.promisify(require('mkdirp'));

// And promisified versions of the AWS SDK S3 routines.
var env = process.env.NODE_ENV || 'development';
var config = require('../config/' + env);

var S3 = new AWS.S3(config.s3);

function saveObjectToFile(bucket, key, path) {
  return new Promise(function(resolve, reject) {
    var params = {
      Bucket: bucket,
      Key: key
    };
    var writeStream = fs.createWriteStream(path);
    S3.getObject(params)
      .createReadStream()
      .on('error', function(e) {
        reject(e);
      })
      .pipe(writeStream);

    writeStream
      .on('finish', function() {
        resolve(path);
      })
      .on('error', function(err) {
        reject(new Error(`Writestream to ${path} did not finish successfully; ${err.message}`));
      });
  });
}

function putObject(bucket, key, body, contentLength) {
  return new Promise(function(resolve, reject) {
    var params = {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentLength: contentLength
    };

    S3.putObject(params, function(error, data) {
      if (error) {
        reject(error);
      }
      else {
        resolve(data);
      }
    });
  });
}

function putFile(bucket, key, filepath) {

  return Promise.bind(this)
    .then(function() {
      return stat(filepath);
    })
    .then(function(fileInfo) {
      var bodyStream = fs.createReadStream(filepath);
      return putObject(bucket, key, bodyStream, fileInfo.size);
    });
}

// Return a Promise to download the S3 object 'key' from the S3
// bucket 'bucket', storing it in the file 'file'.  If 'file' is
// simply a file base name with no directory path, then the file
// is created in the current working directory.  Any exsiting file
// with the same name is overwritten.   If, instead, 'file' is
// an absolute file path with a non-empty directory path, the the
// directory path is first ensured to exist and then the file is
// written.  To ensure the path exists, the running process must
// have the necessary permissions to examine the entire directory
// path and, if necessary, to create directories missing in the path.

exports.downloadObject = function(logid, bucket, key, file) {

  logger.log(logger.DEBUG, function() {
    return `${logid}: downloadObject() called with bucket = ${bucket}; key = ${key}; file = ${file}`;
  });

  // Sanity check
  if (ld.isEmpty(bucket) || ld.isEmpty(key) || ld.isEmpty(file)) {
    logger.log(logger.WARNING, function() {
      return `${logid}: downloadObject() called with invalid arguments`;
    });
    return Promise.reject(new Error('downloadObject() called with invalid arguments'));
  }

  // Any directories to first ensure exist?
  var p = path.parse(file);
  if (ld.isEmpty(p.dir)) {
    // Nope... just download to the current working directory
    return saveObjectToFile(bucket, key, file);
  }

  // First ensure that the directory exists, then download
  return mkdirp(p.dir).then(function() {
    return saveObjectToFile(bucket, key, file);
  });
};


// Return a Promise to upload the file 'file' to the S3 object 'key'
// in the S3 bucket 'bucket'.  The uploaded file is not removed after
// uploading.

exports.uploadFile = function(logid, file, bucket, key) {

  logger.log(logger.DEBUG, function() {
    return `${logid}: uploadFile() called with file = ${file}; bucket = ${bucket}; key = ${key}`;
  });

  // Sanity check
  if (ld.isEmpty(bucket) || ld.isEmpty(key) || ld.isEmpty(file)) {
    logger.log(logger.WARNING, function() {
      return `${logid}: uploadFile() called with invalid arguments`;
    });
    return Promise.reject(new Error('uploadFile() called with invalid arguments'));
  }

  // Upload the file
  return putFile(bucket, key, file);
};

exports.setWorkDir = function(dir) {
  workDir = dir;
  mkdirp(workDir)
    .then(function() { return null; })
    .catch(function(err) {
      logger.log(logger.CRITICAL, `Unable to create work directory, ${workDir}; ${err.message}`);
      throw new Error(`Unable to create working directory, ${workDir}; ${err.message}`);
    });
};
