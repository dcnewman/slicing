'use strict';

var logger = require('./logger');
var Promise = require('bluebird');
var AWS = require('aws-sdk');
var ld = require('lodash');

// Bring in the development or production configuration settings
var env = process.env.NODE_ENV || 'development';
var config = require('../config/' + env);

const MAX_SQS_REQUEST = 10;

// Create an SQS context
var awsOptions = (!ld.isEmpty(config.sqs) && !ld.isEmpty(config.sqs.awsOptions)) ? config.sqs.awsOptions : { }
var sqs;
try {
  sqs = new AWS.SQS(awsOptions);
}
catch (err) {
  logger.log(logger.CRITICAL, `Unable to create an AWS SQS context; ${err.message}`);
  throw new Error(`Unable to connect to create an AWS SQS context; ${err.msessage}`);
}

exports.updateVisibility = function(queue, entries, cb) {

  if (ld.isEmpty(entries) || ld.isEmpty(queue)) {
    return Promise.resolve(0);
  }

  sqs.changeMessageVisibilityBatch({
    Entries: entries,
    QueueUrl: queue
  }, cb);

};

exports.deleteMessage = function(queue, handle, cb) {
  sqs.deleteMessage({
    QueueUrl: queue,
    ReceiptHandle: handle
  }, cb);
};

exports.receiveMessages = function(queue, queueIndex, askFor, cb) {

  if (askFor <= 0 || ld.isEmpty(queue) || cb == undefined) {
    return Promise.resolve(askFor);
  }

  return new Promise(function(resolve, reject) {

    var params = {
      QueueUrl: queue,
      WaitTimeSeconds: config.sqs.ReceiveMessageWaitTimeSeconds[queueIndex],
      MaxNumberOfMessages: askFor < MAX_SQS_REQUEST ? askFor : MAX_SQS_REQUEST
    };
    sqs.receiveMessage(params, function(err, messages) {

      if (err) {
        return reject(err);
      }

      // Return now if we received no messages
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return resolve(askFor);
      }

      // Process the messages invoking our callback function
      var i, used = 0;
      for (i = 0; i < messages.length; i++) {
        var data;
        try {
          data = JSON.parse(messages[i].Body);
        }
        catch (e) {
          // Skip this one
          continue;
        }
        cb(null, {
          handle: messages[i].ReceiptHandle,
          queueIndex: queueIndex,
          data: data  // ???? TROUBLE ????
        });
        used += 1;
      }

      // Now return the remaining count that we might ask for
      var remaining = askFor - used;
      if (remaining < 0) {
        remaining = 0;
      }
      return resolve(remaining);
    });
  });
};
