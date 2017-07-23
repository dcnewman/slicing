'use strict';

var winston = require('winston');
var WinstonCloudWatch = require('winston-cloudwatch');
var crypto = require('crypto');
var IP = require('ip');

// Bring in the development or production configuration settings
var env = process.env.NODE_ENV || 'development';
var config = require('../config/' + env);

// Use syslog levels
winston.setLevels(winston.config.syslog.levels);
winston.handleExceptions = true;
winston.emitErrs = false;
winston.exitOnErr = false;

// We use more traditional syslog values
var EMERG   = 0;
var ALERT   = 1;
var CRIT    = 2;  // aka, CRITICAL
var ERROR   = 3;  // aka, ERR
var WARNING = 4;
var NOTICE  = 5;
var INFO    = 6;
var DEBUG   = 7;

// For turning a string log level into a numeric value
var log_level_str = ['emerg', 'alert', 'crit', 'error', 'warning',
                     'notice', 'info', 'debug'];

// What logging level were we invoked with?
var level = process.env.LOG_LEVEL || 'info';
level = level.toLowerCase();

// Set our numeric value
var log_level = log_level_str.indexOf(level);
if (log_level < 0) {
  log_level = INFO;
}

// Now set up our loggers
var startTime = new Date().toISOString();
var logger;

if (env === 'production') {

  // Log to AWS CloudWatch
  var server_name = config.server_name || 'slicing-server';
  var region = config.aws_region || 'us-west-2';
  var ip = process.env.NODE_IP || IP.address();
  ip = ip.replace(/\./g, '-');
  var options = {
    levels: winston.config.syslog.levels,
    level: level,
    handleExceptions: true,
    exitOnError: false,
    emitErrs: false,
    awsRegion: region,
    awsOptions: {
      logStreamName: region,
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey
    },
    logGroupName: server_name,
    logStreamName: function() {
        // Spread log streams across dates as the server stays up
        var date = new Date().toISOString().split('T')[0];
        return server_name + '-' + ip + '-' + date + '-' +
          crypto.createHash('md5')
          .update(startTime)
        .digest('hex');
    }
  };
  logger = new (winston.Logger)({
    levels: winston.config.syslog.levels,
    level: level,
    handleExceptions: true,
    exitOnError: false,
    emitErrs: false,
    transports: [ new (WinstonCloudWatch)(options) ],
  });
}
else {

  // Log to the console
  logger = new (winston.Logger)({
    levels: winston.config.syslog.levels,
    level: level,
    handleExceptions: true,
    exitOnError: false,
    emitErrs: false,
    transports: [ new (winston.transports.Console)({timestamp: true}) ]
  });

/*
  var log_path = process.env.LOG_PATH || '/var/log';
  var server_name = config.server_name || 'status-server';
  winston.transports.File,
    {
      level: level,
      filename: log_path + '/' + server_name + '.log',
      handleExceptions: true,
      json: true,
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5,
      colorize: false
    });
*/

}

// Log the message 'msg' if the logging level is <= 'level'
//  msg may be a function.  This permits not building the logging string
//  unless we know we will actually log the message.
//
// And yes, we only log strings (or functions which evaluate to a string)

function log(level, msg) {
  if (level > log_level)
    return;

  if (typeof(msg) === 'function')
    msg = msg();

  if (typeof(msg) !== 'string')
    return;

  switch (level) {
  case EMERG:   logger.emerg(msg); return;
  case ALERT:   logger.alert(msg); return;
  case CRIT:    logger.crit(msg); return;
  case ERROR:   logger.error(msg); return;
  case WARNING: logger.warning(msg); return;
  case NOTICE:  logger.notice(msg); return;
  case INFO:    logger.info(msg); return;
  case DEBUG:   logger.debug(msg); return;
  default:      logger.info(msg); return;
  }
}

function logLevel(lvl) {
  var old_level = log_level;
  if (!isNaN(lvl) && 0 <= lvl && lvl < log_level_str.length) {
    winston.level = log_level_str[lvl];
    log_level = lvl;
  }
  return old_level;
}

function doLog(level) {
  return level <= log_level;
}

module.exports = {
  log: log,
  doLog: doLog,
  logLevel: logLevel,
  EMERG: EMERG,
  ALERT: ALERT,
  CRIT: CRIT,
  CRITICAL: CRIT,
  ERROR: ERROR,
  ERR: ERROR,
  WARNING: WARNING,
  NOTICE: NOTICE,
  INFO: INFO,
  DEBUG: DEBUG
};
