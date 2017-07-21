// Copyright (c) 2016 - 2017, Polar 3D LLC
// All rights reserved
//
// https://polar3d.com/

'use strict';

var env = process.env.NODE_ENV || 'development';
var config = require('../config/' + env);

var mongoose = require('mongoose');
var Schema = mongoose.Schema;
mongoose.Promise = require('bluebird');

var PrinterSocketSchemaJSON = require('../schemas/printerSocket.schema');

var PrinterSocketSchema = new Schema(PrinterSocketSchemaJSON,
                                     { collection: 'printer_sockets' });

PrinterSocketSchema.set({ autoIndex: config.mongo.auto_index });

PrinterSocketSchema.index({ socket: 1 });
PrinterSocketSchema.index({ delete_flag: 1, last_modified: 1, 'data.status': 1});

/**
 * Pre-save hook
 */
PrinterSocketSchema
  .pre('save', function(next) {
    if (!this.isModified('last_modified')) {
      this.last_modified = new Date();
    }
    return next();
  });

module.exports = mongoose.model('PrinterSocket', PrinterSocketSchema);
