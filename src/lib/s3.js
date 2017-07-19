'use strict';

var logger = require('./logger');
var ld = require('lodash');

// For teasing a directory path out of an absolute file path
var path = require('path');
var workingDir = './';

// We wish to have a promisified version of mkdirp()
var Promise = require('bluebird');
var mkdirp = Promise.promisify(require('mkdirp'));

// And promisified versions of the AWS SDK S3 routines.
var env = process.env.NODE_ENV || 'development';
var config = require('../config/' + env);
var S3 = require('aws-s3-promisified')(config.s3);


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
    return aws.saveObjectToFile(bucket, key, file);
  }

  // First ensure that the directory exists, then download
  return mkdirp(p.dir).then(aws.saveObjectToFile(bucket, key, file));
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
  return aws.putFile(bucket, key, file);
};

exports.setWorkingDir = function(dir) {
  workingDir = dir;
  mkdirp(workingDir)
    .then(function() { return null; })
    .catch(function(err) {
      logger.log(logger.CRITICAL, `Unable to create working directory, ${workingDir}; ${err.message}`);
      throw new Error(`Unable to create working directory, ${workingDir}; ${err.message}`);
    });
};
