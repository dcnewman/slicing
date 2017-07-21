'use strict';

var URL = require('url');
var path = require('path');
var ld = require('lodash');
var Promise = require('bluebird');
var logger = require('./logger');
var rs = require('random-strings');

// A 'promisified' fs.unlink()
var unlink = Promise.promisify(require('fs').unlink);

function unique() {
  return rs.alphaNumMixed(20);
}

// Parse a S3 URL into
//
//   1. S3 bucket name
//   2. S3 key
//   3. Parse the S3 key into a file base name
//
// THIS CODE DOES NOT HANDLE a general S3 URL.  It assumes the bucket name
// is part of the URL's path and not embedded in the hostname itself.  I.e.,
// it assumes https://s3-host/bucket-name/.  It does not support
// https://bucket-name.s3-host/.
//
// The S3 URL is msg[key + '_file'].  The parsed pieces are then
// returned as
//
//   1. msg[key + '_bucket']
//   2. msg[key + '_key']
//   3. msg[key + '_local']

exports.parseUrl = function(msg, workingDir, key) {

  if (ld.isEmpty(msg) || ld.isEmpty(key)) {
    logger.log(logger.WARNING, function() {
      return 'parseUrl called with invalid arguments';
    });
    throw new Error('parseUrl called with invalid arguments');
  }

  var keyUrl = key + '_file';
  if (!(keyUrl in msg)) {
    logger.log(logger.WARNING, function() {
      return 'parseUrl called: msg argument lacks the key ' + keyUrl;
    });
    throw new Error(`parseUrl called with msg object lacking the property ${keyUrl}`);
  }

  var u = URL.parse(msg[keyUrl], false);
  var p = path.parse(u.pathname);

  // Figure out the bucket name
  msg[key + '_bucket'] = p.dir.split('/')[1];

  // And produce the bucket key
  p.dir = p.dir.split('/').splice(2).join('/');
  msg[key + '_key'] = path.format(p);

  // And the file name on our local storage
  msg[key + '_local'] = `${workingDir}/${unique()}-${p.base}`;
}


// Return a Promise to permanently remove each and every file
// in the list (array) of files 'files'.  Passing as single file
// name as a string for 'files' is permitted.  Otherwise, 'files'
// should be an Array of zero or more strings.

exports.removeFiles = function(logid, files) {

  // Something of a NO-OP?
  if (!files) {
    return Promise.resolve();
  }

  // Handle the single file case
  if (typeof(files) === 'string') {
    return unlink(files);
  }

  // At this point, we expect and array....
  if (!Array.isArray(files)) {
    return Promise.reject(new Error('removeFiles() called with invalid arguments'));
  }

  // Empty array?  Another NO-OP case
  if (files.length === 0) {
    return Promise.resolve();
  }

  // Single file?  Simple case again
  if (files.length === 1) {
    return unlink(files[0])
      .then(function() { return Promise.resolve(); })
      .catch(function() { return Promise.resolve(); });
  }

  // Okay, we have multiple files
  //  Let's make some an array of promises and then return a single promise which
  //  is tied to all of them

  var i, promises = [ ];
  for (i = 0; i < files.length; i++) {
    promises.push(unlink(files[i]));
  }

  return Promise.all(promises)
    .then(function() { return Promise.resolve(); })
    .catch(function() { return Promise.resolve(); });
};
