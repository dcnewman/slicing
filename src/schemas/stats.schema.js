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
