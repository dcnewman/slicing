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

var statsSchemaJSON = require('../schemas/stats.schema');

// Do not call the collection 'stats'.  A collection named 'stats' cannot
// readily be viewed with the mongo shell owing to the existence of the db.stats() command...

var StatsSchema = new Schema( statsSchemaJSON, { collection: 'usage_stats' } );

StatsSchema.set({ autoIndex: config.mongo_auto_index });

module.exports = mongoose.model('Stats', StatsSchema);
