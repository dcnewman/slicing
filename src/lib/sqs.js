/*

Copyright (c) 2017, Polar 3D, LLC
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of the <organization> nor the
      names of its contributors may be used to endorse or promote products
      derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL POLAR 3D LLC BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

*/

'use strict';

var logger = require('./logger');
var Promise = require('bluebird');
var AWS = require('aws-sdk');
var ld = require('lodash');

// Bring in the development or production configuration settings
var env = process.env.NODE_ENV || 'development';
var config = require('../config/' + env);

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

exports.sendMessage = function(queue, data, cb) {
  return new Promise(function(resolve, reject) {
    sqs.sendMessage({
      QueueUrl: queue,
      MessageBody: JSON.stringify(data),
      DelaySeconds: 0
    }, function(err, data) {
      if (err) {
        return reject(err);
      }
      return resolve(0);
    })
  });
};

exports.receiveMessages = function(queue, queueIndex, askFor, cb) {

  if (askFor <= 0 || ld.isEmpty(queue) || cb === undefined) {
    return Promise.resolve(askFor);
  }

  return new Promise(function(resolve, reject) {

    var params = {
      QueueUrl: queue,
      VisibilityTimeout: config.sqs.VisibilityTimeout,
      WaitTimeSeconds: config.sqs.ReceiveMessageWaitTimeSeconds[queueIndex],
      MaxNumberOfMessages: askFor < config.sqs.max_requests ? askFor : config.sqs.max_requests
    };
    sqs.receiveMessage(params, function(err, results) {

      if (err) {
        return reject(err);
      }
      else if (!results) {
        return resolve(askFor);
      }

      var messages = results.Messages;

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
          logger.log(logger.WARNING, `Cannot parse ${messages[i].Body}`);
          continue;
        }
        logger.log(logger.DEBUG, function() { return `Queuing ${JSON.stringify(data2)}`; });
        var data2 = new Object();
        data2.handle = messages[i].ReceiptHandle;
        data2.queueIndex = queueIndex;
        ld.assign(data2, data);
        cb(null, data2);
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
