'use strict';

var sqs = require('./lib/sqs');
var logger = require('./lib/logger');
var ld = require('lodash');
var Promise = require('bluebird');

// Our configuration
var env = process.env.NODE_ENV || 'development';
var config = require('./config/' + env);

// Our two queues
var HIGH = 0;
var LOW  = 1;

var callback = null;
var keepAlive = { };
var queues = [null, null];  // [HIGH, LOW]
var maxConcurrentProcesses = config.processes.max_concurrent;
var maxSuccessiveHigh = config.processes.max_successive_high;
var runningProcesses = 0;
var successiveHigh = 0;

exports.stats = function() {
  return {
    runningProcesses: runningProcesses,
    successiveHigh: successiveHigh,
    keepAlive: keepAlive,
    queues: queues,
    maxConcurrentProcesses: maxConcurrentProcesses,
    maxSuccessiveHigh: maxSuccessiveHigh,
  };
};

exports.setCallback = function(cb) {
  callback = cb;
};

exports.setQueueHighPriority = function(queue) {
  queues[HIGH] = queue;
};

exports.setQueueLowPriority = function(queue) {
  queues[LOW] = queue;
};

exports.trackMessage = function(msg) {
  if (msg && !ld.isEmpty(msg.handle)) {
    keepAlive[msg.handle] = msg.queueIndex;
  }
};

exports.requeueMessage = function(msg) {
  runningProcessesInc(-1);
  if (!ld.isEmpty(msg) && !ld.isEmpty(msg.handle)) {
    delete keepAlive[msg.handle];
  }
};

exports.removeMessage = function(msg) {
  runningProcessesInc(-1);
  if (!ld.isEmpty(msg) && !ld.isEmpty(msg.handle)) {
    var queueIndex = keepAlive[msg.handle];
    delete keepAlive[msg.handle];
    if (queueIndex !== undefined) {
      // eslint-disable-next-line no-unused-vars
      sqs.deleteMessage(queues[queueIndex], msg.handle, function (err, data) {
        if (err) {
          logger.log(logger.WARNING, function () {
            return `${msg.jobId}: Error removing ${msg.handle} from the SQS queue ${queues[msg.queueIndex]}; err = ${err.message}`;
          });
        }
      });
    }
  }
};

function renewDelay() {
  setTimeout(renewMessages, 30 * 1000);
}

// Extend the visibility of each message we have received but
//   not yet finished processing.  Rather than default each
//   message to an invisibility of, say, one hour, we instead
//   use a briefer period and renew the invisibility while
//   we process the message.  This way, should the server crash
//   we don't leave the message invisible in the queue for an hour.
//   Instead it will become visible again in short order.

function renewMessages() {

  // Get an array of the key names in keepAlive
  var keys = Object.keys(keepAlive);
  if (keys.length === 0) {
    // Nothing to do; nothing to renew
    logger.log(logger.DEBUG, 'renewMessages: no messages to renew in SQS');
    renewDelay();
    return;
  }

  logger.log(logger.DEBUG, function() {
    return `renewMessages: ${keys.length} messages to renew`;
  });

  // Build the entries which the AWS SDK SQS library will wish to see
  var entries = [[], []];
  var i, queue;
  for (i = 0; i < keys.length; i++) {
    queue = keepAlive[keys[i]];
    entries[queue].push({
      Id: i.toString(),       // Gotta have one of these
      ReceiptHandle: keys[i], // This message's receipt handle
      VisibilityTimeout: 60,  // Keep invisible for another minute
    });
  }

  // Now send the list to SQS
  if (entries[HIGH].length > 0) {
    // eslint-disable-next-line no-unused-vars
    sqs.updateVisibility(queues[HIGH], entries[HIGH], function(err, data) {
      if (err) {
        logger.log(logger.WARNING, `SQS error from sqs.updateVisibility for queue ${queues[HIGH]}; ${err.message}`);
      }
    });
  }

  if (entries[LOW].length > 0) {
    // eslint-disable-next-line no-unused-vars
    sqs.updateVisibility(queues[LOW], entries[LOW], function(err, data) {
      if (err) {
        logger.log(logger.WARNING, `SQS error from sqs.updateVisibility for queue ${queues[LOW]}; ${err.message}`);
      }
    });
  }

  logger.log(logger.DEBUG, `renewMessages: ${keys.length} messages renewed`);
  renewDelay();
}

// Check the SQS queue 'queue' for up to 'permitted' messages
function checkQueue(queueIndex, permitted, askFor) {

  // If askFor was not supplied, then default it to permitted
  if (askFor === undefined) {
    logger.log(logger.DEBUG, function() {
      return `checkQueue: assuming askFor = ${permitted}`;
    });
    askFor = permitted;
  }

  logger.log(logger.DEBUG, function() {
    return `checkQueue: queue = ${queueIndex}; permitted = ${permitted}; askFor = ${askFor}`;
  });

  if (ld.isEmpty(queues[queueIndex])) {
    // Queue may not yet exist; punt to the next in the chain
    logger.log(logger.DEBUG, function() {
      return `checkQueue: queue string empty; returning ${permitted}`;
    });
    return Promise.resolve(permitted);
  }

  // If we're down to 0 then just punt for now
  if (permitted < 0) {
    logger.log(logger.DEBUG, function() {
      return 'checkQueue: permitted = 0; punt';
    });
    return Promise.resolve(0);
  }

  // Now reduce askFor if it exceeds the maximum for a single SQS request
  askFor = (askFor <= config.sqs.max_requests) ? askFor : config.sqs.max_requests;

  // Now try to get some messages from the queue
  logger.log(logger.DEBUG, function() {
    return `checkQueue: asking SQS for up to ${askFor} messages`;
  });
  return sqs.receiveMessages(queues[queueIndex], queueIndex, askFor, callback);

}

// Check the low priority queue for at most 'permitted' messages if disallowLow is not true
function checkQueueLow(permitted, disallowLow) {

  if (disallowLow === undefined) {
    disallowLow = false;
  }

  logger.log(logger.DEBUG, function() {
    return `checkQueueLow: permitted = ${permitted}; disallowLow = ${disallowLow}; successiveHigh = ${successiveHigh}; maxSuccessiveHigh = ${maxSuccessiveHigh}`;
  });

  var askFor = permitted;
  if (disallowLow) {

    // Have we hit our successive run count for high priority messages?
    if (successiveHigh < maxSuccessiveHigh) {

      // No, we have not.  So don't permit a low priority message ahead
      // of the high priority messages.
      logger.log(logger.DEBUG, function() {
        return `checkQueueLow: have not exceeded the successive run count for high priority messages; not allowing low priority messages`;
      });
      return Promise.resolve(permitted);

    }

    // We've had a run of high priority messages
    //   Allow a low priority message to come in
    logger.log(logger.DEBUG, function() {
      return 'checkQueueLow: have had a run of high priority messages; allow one low priority to squeak by';
    });
    askFor = 1;
  }

  logger.log(logger.DEBUG, function() {
    return 'checkQueueLow: checking for low priority messages';
  });

  return checkQueue(LOW, permitted, askFor);
}

function checkQueueHigh(permitted) {
  logger.log(logger.DEBUG, function() {
    return `checkQueueHigh: checking for high priority messages; permitted = ${permitted}`;
  });
  return checkQueue(HIGH, permitted);
}

function checkQueuesDelay() {
  setTimeout(checkQueues, 500);
}

function checkQueues() {

  logger.log(logger.DEBUG, function() {
    return `checkQueues: checking queues; runningProcesses = ${runningProcesses}; maxConcurrentProcesses = ${maxConcurrentProcesses}`;
  });

  if (runningProcesses >= maxConcurrentProcesses) {
    logger.log(logger.DEBUG, function() {
      return 'checkQueues: not checking queues; at maximum running processes already';
    });
    checkQueuesDelay();
    return;
  }

  // Allow a ratio of N high priority processes to M low priority
  var permitted = maxConcurrentProcesses - runningProcesses;

  // 1. Check for low priority only if we've let plenty of high priority jobs recently
  // 2. Check for high priority jobs
  // 3. Check for low priority jobs if there are still job slots
  // 4. Pause briefly regardless of whether we've had an error or not
  return checkQueueLow(permitted, true)
    .then(checkQueueHigh)
    .then(checkQueueLow)
    .then(checkQueuesDelay)
    .catch(checkQueuesDelay);
}

function runningProcessesInc(val) {
  runningProcesses += val;
  if (runningProcesses < 0) {
    runningProcesses = 0;
  }
  return runningProcesses;
};

exports.checkQueues = checkQueues;
exports.renewMessages = renewMessages;
exports.runningProcessesInc = runningProcessesInc;
