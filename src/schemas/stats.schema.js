// Copyright (c) 2016 - 2017, Polar 3D LLC
// All rights reserved
//
// https://polar3d.com/

'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var statsSchemaJSON = {

  members_created: [ Schema.Types.ObjectId ],
  members_deleted: { type: Number, default: 0 },
  members_flagged: [ Schema.Types.ObjectId ],

  admins_new: [ Schema.Types.ObjectId ],
  admins_logged_in: [ Schema.Types.ObjectId ],

  printers_created: [ Schema.Types.ObjectId ],
  printers_registered: [ Schema.Types.ObjectId ],
  printers_unregistered: [ Schema.Types.ObjectId ],
  printers_flagged: [ Schema.Types.ObjectId ],

  filament_used: { type: Number, default: 0 },
  print_seconds: { type: Number, default: 0 },

  jobs_created: [ Schema.Types.ObjectId ],
  jobs_started: [ Schema.Types.ObjectId ],
  jobs_completed: [ Schema.Types.ObjectId ],
  jobs_canceled: [ Schema.Types.ObjectId ],
  jobs_dequeued: [ Schema.Types.ObjectId ],

  local_completed: { type: Number, default: 0 },
  local_canceled: { type: Number, default: 0 },

  objects_created: [ Schema.Types.ObjectId ],
  objects_deleted: { type: Number, default: 0 },
  objects_shared: [ Schema.Types.ObjectId ],
  objects_published: [ Schema.Types.ObjectId ],
  objects_flagged: [ Schema.Types.ObjectId ],

  slicing_queued: { type: Number, default: 0 },
  slicing_succeeded: { type: Number, default: 0 },
  slicing_canceled: { type: Number, default: 0 },
  slicing_failed: { type: Number, default: 0 },
  slicing_seconds: { type: Number, default: 0 },

  groups_created: [ Schema.Types.ObjectId ],
  groups_deleted: { type: Number, default: 0 },
  groups_flagged: [ Schema.Types.ObjectId ],

  // There can be many messages: do not track each and every one by objectId
  messages_created: { type: Number, default: 0 },
  messages_deleted: { type: Number, default: 0 },
  messages_flagged: [ Schema.Types.ObjectId ]

};

module.exports = statsSchemaJSON;
