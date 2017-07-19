'use strict';

var app = require('express')();
var http = require('http').Server(app);
var lib = require('./lib');
var sqs = require('./lib/sqs');
var logger = require('./lib/logger');
var s3 = require('./lib/s3');
var path = require('path');
var ld = require('lodash');
var StringTemplateCompile = require('string-template/compile');

var Promise = require('bluebird');
var mongoose = require('mongoose');
mongoose.Promise = Promise;

// Our configuration
var env = process.env.NODE_ENV || 'development';
var config = require('./config/' + env);
var bind_port = config.port || 80;
var bind_addr = config.ip || '0.0.0.0';
var queue_prefix = `https://sqs.${config.sqs.awsOptions.region}.amazonaws.com/${config.sqs.account}/`;

// Process the shell command to exec
var CuraTemplate = StringTemplateCompile(config.cura_command);

var workingDir = path.normalize(`${__dirname}/../working`);
s3.setWorkingDir(workingDir);

// Our SQS queue processing
var queue = require('./queue');
queue.setCallback(processMessage);
queue.setQueueHighPriority(queue_prefix + 'us-west-slicing-high-prio');
queue.setQueueLowPriority(queue_prefix + 'us-west-slicing-low-prio');

// To spawn a slicer process, we use exec()
//   spawn -- forks a child process with no shell and streams
//              stdin, stdout back.
//   exec  -- forks a child process with a shell and buffers
//              stdin, stdout.  Fine for up to 20K of buffered
//              data.
var exec = require('child-process-promise').exec;

// Each inbound SQS message must have these fields....
var mustHave = [
  'configUrl',
  'gcodeUrl',
  'handle',
  'jobId',
  'requestType',
  'serialNumber',
  'stlUrl'
];

// Logging test
if (env === 'development') {
  var level = logger.logLevel(logger.DEBUG);
  logger.log(logger.DEBUG, 'Testing logging levels; original logging level is ' + level);
  logger.log(logger.EMERG, function () { return 'EMERG'; });
  logger.log(logger.ALERT, function () { return 'ALERT'; });
  logger.log(logger.CRIT, function () { return 'CRIT'; });
  logger.log(logger.ERROR, function () { return 'ERROR'; });
  logger.log(logger.WARNING, function () { return 'WARNING'; });
  logger.log(logger.NOTICE, function () { return 'NOTICE'; });
  logger.log(logger.INFO, function () { return 'INFO'; });
  logger.log(logger.DEBUG, function () { return 'DEBUG'; });
  logger.log(logger.DEBUG, 'Restoring logging level back to ' + level);
  logger.logLevel(logger.NOTICE);
  logger.log(logger.DEBUG, 'This message should not appear');
  logger.logLevel(level);
}

/**
 *  Connect to MongoDB
 */
mongoose.connect(config.mongo_uri, {safe: true})
  .then(function() {
    logger.log(logger.NOTICE, 'MongoDB connection established');
    // Begin checking the queues
    queue.checkQueues();
  })
  .catch(function(err) {
    logger.log(logger.CRITICAL, 'MongoDB connection error: ' + err.message);
    throw new Error('Unable to connect to MongoDB; connection error is ' + err.message);
  });

var STATE_ERR   = 12;
var SLICER_PRE  = 14;
var SLICER_RUN  = 15;
var SLICER_POST = 16;

// Update the printer status
//   TBD
function updateState(msg, state, err) {

  var txt;
  switch (stat) {
  case STATE_ERR:   txt = `error; ${err}`; break;
  case SLICER_PRE:  txt = 'preparing slicer'; break;
  case SLICER_RUN:  txt = 'slicing'; break;
  case SLICER_POST: txt = 'slicing completed'; break;
  default: txt = '???'; break;
  }

  logger.log(logger.DEBUG, function() {
    return `${msg.jobId}: Changing state to "${txt}"`;
  });

  return Promise.resolve(msg);
}


// downloadFiles() -- Download the STL and slicer config from S3
//   -- Update the current state to "preparing slicer" (14) and then
//   -- Download the STL and slicer configuration files
function downloadFiles(msg) {

  // Set state to "preparing slicer"
  return updateState(msg, SLICER_PRE)
    .then(function() {

      logger.log(logger.DEBUG, function() {
        return `${msg.jobId}: Downloading from S3 ${msg.stlKey} to local ${msg.stlFile}; ${msg.configKey} to ${msg.configFile}`;
      });

      // Now download the STL and slicer configuration files
      return Promise.Join(s3.downloadObject(msg.jobId, msg.stlBucket, msg.stlKey, msg.stlFile),
                          s3.downloadObject(msg.jobId, msg.configBucket, msg.configKey, msg.configFile))
        .then(function() {

          logger.log(logger.DEBUG, function() {
            return `${msg.jobId}: Finished downloading ${msg.stlKey} to ${msg.stlFile}`;
          });

          // And resolve this promise
          return Promise.resolve(msg);
        });
    });
}


// Upload the gcode file
function uploadFile(msg) {

  logger.log(logger.DEBUG, function() {
    return `${msg.jobId}: Uploading from local ${msg.gcodeFile} to S3 ${msg.gcodekey}`;
  });

  return s3.uploadFile(msg.jobId, msg.gcodeFile, msg.gcodeBucket, msg.gcodeKey)
    .then(function() {
      return Promise.resolve(msg);
    });
}


// Remove local files
function cleanFiles(msg) {

  logger.log(logger.DEBUG, function() {
    return `${msg.jobId}: Removing local files ${msg.stlFile}, ${msg.configFile}, ${msg.gcodeFile}`;
  });

  return lib.removeFiles(msg.jobId, [msg.stlFile, msg.configFile, msg.gcodeFile])
    .then(function() {
      return Promise.resolve(msg);
    });
}

// Send the print command to the status server handling this printer
function sendPrintCommand(msg) {

  // Find the printer's current socket via Mongo db
  return updateState(msg, SLICER_POST)
    .then(function() {

      logger.log(logger.DEBUG, function() {
        return `${msg.jobId}: Retrieving printer socket for ${msg.serialNumber}`;
      });

      return PrinterSocket.find(
        { serial_number: msg.serialNumber, delete_flag: false },
        { socket: 1, last_modified: 1 }).sort('-last_modified').limit(1).exec()
        .then(function(socket) {

          // Does the printer have any active printer sockets?
          if (ld.isEmpty(socket)) {
            logger.log(logger.INFO, function() {
              return `${msg.jobId}: Printer ${msg.serialNumber} no longer has an active socket`;
            });
            return Promise.reject(new Error('Printer no longer connected to the cloud'));
          }

          // Parse the printer socket.  It is of the form
          //
          //    socket.io-socket-id "|" sqs-queue-name
          //
          var info = socket.socket.split('|');
          if (info.length !== 2) {
            logger.log(logger.INFO, function() {
              return `${msg.jobId}: Printer ${msg.serialNumber} has an invalid socket record, socket=${socket.socket}`;
            });
            return Promise.reject(new Error('Printer has invalid socket record; cannot send gcode to printer'));
          }

          // Success; send a printFile command to the printer via the status
          // server to which it is connected
          var data = {
            printer_command: 'printFile',
            socket_id: info[0],
            job_stl: msg.stlUrl,
            config_file: msg.configUrl,
            gcode_file: msg.gcodeUrl,
            job_id: msg.jobId,
            request_dt_tm: new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')
          };

          logger.log(logger.DEBUG, function() {
            return `${msg.jobId}: Sending SQS request to ${queue_prefix}${info[1]}; data = ${JSON.stringify(data)}`;
          });

          return new Promise(function(resolve, reject) {
            sqs.sendMessage(queue_prefix + info[1], data, function(err, data) {
              if (err) {
                logger.log(logger.WARNING, function() {
                  return `${msg.jobId}: Error creating print request via SQS; err = ${err.message}`;
                });
                return reject(err);
              }
              else {
                return resolve(msg);
              }
            });
          });
        })
        .catch(function(err) {
          logger.log(logger.WARNING, function() {
            return `${msg.jobId}: Database lookup error whilst looking for printer socket for ${msg.serialNumber}; err = ${err.message}`;
          });
          return Promise.reject(err);
        });
    });
}


// Notify our cloud services that the message has been processed; that the STL file has been sliced.
function notifyDone(msg) {

  // Decrement the count of runningProcesses
  var running = queue.runningProcessesInc(-1);

  // Should never happen
  if (!msg) {
    logger.log(logger.WARNING, 'notifyDone: bad call arguments; msg not supplied');
    return Promise.reject(new Error('notifyDone() called with bad arguments'));
  }

  logger.log(logger.DEBUG, function() {
    return `${msg.jobId}: runningProcesses going from ${running+1} to ${running}; msg = ${JSON.stringify(msg)}`;
  });

  // Do not continue to renew visibility
  queue.removeMessage(msg);

  switch (msg.requestType) {

  case 0:
    // Use SQS to send a print command to the status server to which
    // this printer is attached
    return sendPrintCommand(msg);

  case 1:
    // Update the db to notify the printer that this gcode is ready
    // ???? TBD ????
    return Promise.resolve(msg); // status.update(msg, xxx);

  default:
    logger.log(logger.WARNING, function() {
      return `${msg.jobId}: notifyDone() processing message with invalid requestType of ${msg.requestType}; punting`;
    });
    return Promise.reject(new Error(`Invalid requestType ${msg.requestType} passed to notifyDone`));
  }
}

// Spawn the slicer
function spawnSlicer(msg) {

  logger.log(logger.DEBUG, function() {
    return `${msg.jobId}: Changing state to "slicing"`;
  });

  return updateState(msg, SLICER_RUN)
    .then(function() {
      var obj = {
        configFile: msg.configFile,
        stlFile: msg.stlFile,
        gcodeFile: msg.gcodeFile
      };
      var cmd = CuraTemplate(obj);
      logger.log(logger.DEBUG, function() {
        return `${msg.jobId}: Starting slicer; ${cmd}`;
      });
      return exec(cmd)
        .then(function(res) {
          logger.log(logger.DEBUG, function() {
            return `${msg.jobId}: Slicer finished; stdout = "${res.stdout}"`;
          });
          return Promise.resolve(msg);
        });
    });
}

function processMessage(msg) {

  msg = ld.cloneDeep(msg);

  logger.log(logger.DEBUG, function() {
    return `processMessage: msg = ${JSON.stringify(msg)}`;
  });

  // Ensure that the request type is valid
  if (msg.requestType !== 0 && msg.requestType !== 1) {

    // Bad message...
    logger.log(logger.WARNING, function() {
      return 'processMessage: received message has an invalid requestType of ' +
        msg.requestType + '; msg = ' + JSON.stringify(msg);
    });

    // This status update call will log the error
    return updateState(msg, STATE_ERR, 'Programming error; slicing request contains an invalid request type')
      .then(sqs.requeueMessage)
      .catch(function(err) {
        logger.log(logger.WARNING, function() {
          return `${msg.jobId}: unable to process slicing request AND an error occurred while attempting to requeue the request; ${err}`;
        });
        return null;
      });
  }

  // Stop now if the message is missing required fields
  var i;
  for (i = 0; i < mustHave.length; i++) {

    if (!ld.isEmpty(msg[mustHave[i]])) {
      continue;
    }

    // Bad message...
    logger.log(logger.WARNING, function() {
      return 'processMessage: received message lacking the required field ' +
        mustHave[i] + '; msg = ' + JSON.stringify(msg);
    });

    // Reject
    return updateState(msg, STATE_ERR, `Programming error; slicing request is missing the required paramter ${mustHave[i]}`)
      .then(sqs.requeueMessage)
      .catch(function(err) {
        logger.log(logger.WARNING, function() {
          return `${msg.jobId}: unable to process slicing request AND an error occurred while attempting to requeue the request; ${err}`;
        });
        return null;
      });
  }

  // Using the supplied URLs, generate the
  //    S3 bucket names
  //    S3 key names
  //    Local temporary file names

  try {
    lib.parseUrl(workingDir, msg, 'stl');
    lib.parseUrl(workingDir, msg, 'config');
    lib.parseUrl(workingDir, msg, 'gcode');
  }
  catch (e) {
    // Reject
    return updateState(msg, STATE_ERR, `Programming error; invalid data; cannot parse URL; err = ${err.message}`)
      .then(sqs.requeueMessage)
      .catch(function(err) {
        logger.log(logger.WARNING, function() {
          return `${msg.jobId}: unable to process slicing request AND an error occurred while attempting to requeue the request; ${err}`;
        });
        return null;
      });
  }

  // Track that we have this message in our care
  //   We will periodically renew our holding of it.  While we could just
  //   keep it invisible in the SQS queue for, say, an hour we then run
  //   the risk of having this process die leaving the message untouched
  //   until that hour is up.  That means a user left wondering when their
  //   file will be sliced....  So, instead we only keep it invisible for
  //   a minute at a time and extend the invisibility every 30 seconds or so.
  queue.trackMessage(queue, msg.handle);

  // At this point, consider us as having just added +1 to the count of
  // running processes notifyDone will decrement the count
  queue.runningProcessesInc(1);

  // Now process the message by
  //
  //   1. Update status in db to 'downloading'
  //   2. In parallel
  //      a. Downloading the STL from S3
  //      b. Downloading the slicing config from S3
  //   3. Update status in db to 'slicing'
  //   4. Slice the print
  //   5. Upload the resulting gcode to S3
  //   6. Update status in db to 'slicing finished'
  //   7. Notify the cloud that the slice is now available (e.g., tell the
  //        printer to consume it)
  //   8. Remove the local files we downloaded or generated
  //   9. Return

  return downloadFiles(msg)
    .then(spawnSlicer)
    .then(uploadFile)
    .then(notifyDone)
    .then(sqs.deleteMessage)
    .then(cleanFiles)
    .catch(function(err) {
      // This status update call will log the error
      updateState(msg, STATE_ERR, `Processing error; err = ${err.message}`);
      sqs.requeueMessage(msg);
      lib.removeFiles(msg.jobId, [msg.stlFile, msg.configFile, msg.gcodeFile]);
      return null;
    });
}

/**
 *  For pinging from monitoring stations, load balancers, etc.
 */
app.get('/info', function (req, res) {
  return res.status(200).send((new Date()).toISOString().replace(/T/, ' ').replace(/\..+/, ''));
});

http.listen(bind_port, bind_addr, function () {
  var addr = '*';
  if (bind_addr !== '0.0.0.0') addr = bind_addr;
  logger.log(logger.NOTICE, 'listening on ' + bind_addr + ':' + bind_port);

  // Now that we're bound and listening, fall back to non-root UID and GIDs
  if (!ld.isEmpty(config.perms)) {
    logger.log(logger.DEBUG, 'Changing uid:gid to ' + config.perms.uid + ':' + config.perms.gid);
    try {
      process.setgroups([config.perms.gid]);
      process.setgid(config.perms.gid);
      process.setuid(config.perms.uid);
      logger.log(logger.NOTICE, 'Changed uid:gid to '+ config.perms.uid + ':' + config.perms.gid);
    }
    catch (err) {
      throw new Error('Failed to change uid and gid; ' + JSON.stringify(err));
    }
  }
  else {
    logger.log(logger.NOTICE, 'Leaving uid and gid unchanged');
  }
});

/*

An inbound SQS message is required to come in with the following
fields:

  jobId:         P3Dnnnnn-mmmmm
  serialNumber:  Printer's serial number
  stlUrl:        Full URL to the STL file to slice
  configUrl:     Full URL to the slicing configuration to use
  gcodeUrl:      Full URL for where to store the resulting gcode

We add to this the following fields

  handle:        SQS message's receipt handle
  queueIndex:    Queue index

  stlBucket:     Parsed S3 bucket name for the STL file
  stlKey:        Parsed S3 key name for the STL file
  stlFile:       Local temporary file to store the STL file in

  configBucket:  Parsed S3 bucket name for the slicing config
  configKey:     Parsed S3 key name for the slicing config
  configFile:    Local temporary file to store the config file in

  gcodeBucket:   Parsed S3 bucket name for the gcode file
  gcodeKey:      Parsed S3 key name for the gcode file
  gcodeFile:     Local temporary file to receive the gcode file

Once the STL is sliced, we dequeue this message and then send
a message to the printer's current status server.  That is located
by looking the printer's current printer_sockets document up in
the database.  (Note that while waiting for slicing to finish,
the printer may have disconnected and reconnected.  Upon reconnecting,
it will have a new socket and possibly connect to a different
status server.)

*/
