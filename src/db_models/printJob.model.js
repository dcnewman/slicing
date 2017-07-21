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

var PrintJobSchemaJSON = require('../schemas/printJob.schema');

var PrintJobSchema = new Schema(PrintJobSchemaJSON, { collection: 'print_jobs' });

PrintJobSchema.set({ autoIndex: config.mongo_auto_index });
PrintJobSchema.index({ job_id: 1});
PrintJobSchema.index({ printer_id: 1, owner_id: 1});
PrintJobSchema.index({ create_date: 1});
PrintJobSchema.index({ queue_sort_date: 1});
PrintJobSchema.index({ print_date: 1});
PrintJobSchema.index({ 'objects.object_id': 1});

/**
 * Pre-save hook
 */
PrintJobSchema
  .pre('save', function(next) {
    if (!this.isModified('last_modified')) {
      this.last_modified = new Date();
    }
    return next();
  });

module.exports = mongoose.model('PrintJob', PrintJobSchema);
