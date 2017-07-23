// Send the print command to the status server handling this printer
function sendPrintCommand(msg) {

  // Find the printer's current socket via Mongo db
  return updateState(msg, SLICER_POST)
    .then(function () {

      logger.log(logger.DEBUG, function () {
        return `${msg.job_id}: Retrieving printer socket for ${msg.serial_number}; socket = ${msg.socket_id}`;
      });

      // See the latest rev of the socket
      return PrinterSocket.find(
        {serial_number: msg.serial_number, delete_flag: false},
        {socket: 1, last_modified: 1}).sort('-last_modified').limit(1).lean().exec()
        .then(function (socket) {

          // Does the printer have any active printer sockets?
          if (ld.isEmpty(socket)) {
            logger.log(logger.INFO, function () {
              return `${msg.job_id}: Printer ${msg.serial_number} no longer has an active socket`;
            });
            return Promise.reject(new Error('Printer no longer connected to the cloud'));
          }

          // Parse the printer socket.  It is of the form
          //
          //    socket.io-socket-id "|" sqs-queue-name
          //
          socket = socket[0];
          var info = socket.socket.split('|');
          if (info.length !== 2) {
            logger.log(logger.INFO, function () {
              return `${msg.job_id}: Printer ${msg.serial_number} has an invalid socket record, socket=${socket.socket}`;
            });
            return Promise.reject(new Error('Printer has invalid socket record; cannot send gcode to printer'));
          }

          // Success; send a printFile command to the printer via the status
          // server to which it is connected
          var data = {
            printer_command: 'printFile',
            socket_id: info[0],
            job_stl: msg.stl_file,
            config_file: msg.config_file,
            gcode_file: msg.gcode_file,
            job_id: msg.job_id,
            request_dt_tm: new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')
          };

          logger.log(logger.DEBUG, function () {
            return `${msg.job_id}: Sending SQS request to ${queue_prefix}${info[1]}; data = ${JSON.stringify(data)}`;
          });

          return sqs.sendMessage(queue_prefix + info[1], data)
            .then(function() {

            })
            .catch(function (err) {
              logger.log(logger.WARNING, function () {
                return `${msg.job_id}: Error creating print request via SQS; err = ${err.message}`;
              });
              return Promise.reject(err);
            });
        });
    })
    .catch(function (err) {
      logger.log(logger.WARNING, function () {
        return `${msg.job_id}: Database lookup error whilst looking for the latest printer socket for ${msg.serial_number}; err = ${err.message}`;
      });
      return Promise.reject(err);
    });
}
