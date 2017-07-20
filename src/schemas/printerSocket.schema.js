// Copyright (c) 2016 - 2017, Polar 3D LLC
// All rights reserved
//
// https://polar3d.com/

'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var PrinterSocketSchemaJSON = {

  printer_id: Schema.Types.ObjectId,

  serial_number: {
    type: String,
    minlength: 1,
    maxlength: 32,
    uppercase: true,
    required: true,
    index: true
  },

  socket: {
    type: String,
    index: 'hashed'
  },

  delete_flag: {
    type: Boolean,
    default: false,
    required: true
  },

  job_id: {
    type: String,
    minlength: 0,
    maxlength: 32
  },

  mac_address: {
    type: String,
    minlength: 0,
    maxlength: 32
  },

  local_ip: {
    type: String,
    minlength: 0,
    maxlength: 15
  },

  public_ip: {
    type: String,
    minlength: 0,
    maxlength: 15
  },

  data: {

    status: {
      type: Number,
      required: true,
      default: 0
    },

    progress: {
      type: String,
      maxlength: 32
    },

    progressDetail: {
      type: String,
      maxlength: 128
    },

    estimatedTime: {
      type: Number,
      min: 0
    },

    filamentUsed: {
      type: Number,
      min: 0
    },

    startTime: Date,

    printSeconds: {
      type: Number,
      min: 0
    },

    bytesRead: {
      type: Number,
      min: 0
    },

    fileSize: {
      type: Number,
      min: 0
    },

    temperature: Number,

    targetTemperature: Number,

    temperature_2: Number,

    targetTemperature_2: Number,

    temperature_bed: Number,

    targetTemperature_bed: Number,

    jobID: {
      type: String,
      maxlength: 32
    },

    file: {
      type: String,
      maxlength: 150
    },

    config: {
      type: String,
      maxlength: 150
    },

    securityCode: {
      type: String,
      maxlength: 36
    }

  },

  // Storage for commands sent to the printer and responses received
  gcode_commands: [ {
    // Command sent or response from?
    is_command: {
      type: Boolean,
      default: false
    },
    // Command/response sent to/from the printer
    data: {
      type: String,
      maxlength: 1024
    },
    time: {
      type: Date,
      default: Date.now()
    }
  } ],

  rotate_image: {
    type: Boolean,
    default: false
  },

  //  transform_image overrides rotate_image: bitmask
  //    bit   value    operation   description
  //    ---   -----    ---------   ------------
  //     0      1      reflect-H   reflect about the horizontal midline; e.g., CSS scaleY(-1)
  //     1      2      reflect-V   reflect about the vertical midline; e.g., CSS scaleX(-1)
  //     2      4      rotate-90   rotate 90 degrees counter clockwise; e.g., CSS rotate(-90)
  //
  // rotate-90 is always applied LAST
  //
  // A rotation of 180 degrees is thus value 0b011 = 0x03 = 3 (reflect-H reflect-V)
  // A rotation of  90 degrees clockwise is value 0b111 = 0x07 = 7 (both reflections followed by rotate-90)
  transform_image: {
    type: Number,
    default: 0,
    min: 0,
    max: 7
  },

  last_modified: {
    type: Date,
    required: true,
    default: Date.now
  }

};

module.exports = PrinterSocketSchemaJSON;
