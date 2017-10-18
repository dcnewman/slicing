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
