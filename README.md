## Polar Cloud Slicing Server

This project implements Polar 3D's cloud slicing server using
[Node.js](https://nodejs.org) as the programming language with
additional [NPM modules](https://www.npmjs.com/) as detailed
in the [`package.json`](https://docs.npmjs.com/files/package.json)
file.

The server scales horizontally with no special considerations: run
as few or as many as needed.  No special configuration is needed
to run any number of servers.  The servers do not communicate with
one another and instead receive their slicing requests from a
message queue which ensures that a given message is only handed
out to a single server, thereby preventing multiple servers from
simultaneously processing the same request.  It is okay to shoot
a server dead in its tracks; slicing requests will not be lost.

To vertically scale, change the number of slicing jobs a single server
can handle concurrently.

## Dependencies

This slicing server is written to run in an Amazon AWS infrastructure
from which it uses

* [Amazon S3](https://aws.amazon.com/s3/) for file storage, both
 input files for slicing as well as the slicer output.
* [Amazon SQS](https://aws.amazon.com/sqs/) for a message queue whereby
 cloud servers can initiate a slicing request for a print job queued
 to a printer.
* [Amazon CloudWatch](https://aws.amazon.com/cloudwatch/) as a
 logging service.

Additionally, the slicing server uses [Mongo DB](https://www.mongodb.com/)
and the [Mongoose ODM](http://mongoosejs.com/) as a Node.js Mongo DB
access layer.  Finally,
[CuraEngine 15.04.6](https://github.com/Polar3D/CuraEngine) is used
as the slicer, but with a single code change to better handle error
conditions relating STL input files.

Each of those choices can be changed as needed:

* Amazon S3: Either use an equivalent file storage mechanism which
  implements S3 compatability or replace the `src/lib/s3.js` routines.
* Amazon SQS: Simply replace with a different message bus such as
  the Pub/Sub facilities of Redis.  The two features of SQS which
  are "baked in" to this server's logic are [discussed
  below](#sqs-queues).  For Polar 3D's usage of SQS, this service
  is practically free: for November 2017, our total usage cost
  across our entire cloud infrastructure will be less than $0.15 USD. 
* Amazon CloudWatch: This service can be replaced with any logging
  service.  Note that we use the [Winston.js](https://github.com/winstonjs)
  logging framework which has adaptors to many network-based
  logging services.  As with SQS, use CloudWatch as it is effectively
  free to use for our level of usage.  Avoid logging to local disks
  as it makes management more difficult when horizontally scaling.
  Also, it locally stored data becomes data you have to consider
  recovering before shooting a server instance dead.  It's best to
  not store anything but transient data.
* Mongo DB: This particular database is what the
  Polar Cloud uses.  The slicing server only accesses -- write-only --
  two collections (tables) in the database.  One to record slicing
  stats, and the other to allow other cloud servers to monitor the
  slicing progress for each print job.  Use of the database is
  not critical.
* CuraEngine: Any slicer might be used provided it can be run
  as a stand-alone process.  This server presently assumes that the
  input to the slicer is an STL file and a configuration file.
  Further that the slicer can be invoked from a shell script and
  is well-behaved so far as it exits with a status of zero upon
  success and a value other than zero upon failure.

## Startup

When launched, the server

1. Enables logging to the desired logging service.
2. Connects to the configured Mongo DB server.  Failure to connect
   is treated as critical error.
3. Connects to the SQS queues, creating them if necessary.
4. Enters an event loop, waiting for slicing requests to process.

## SQS queues

Two SQS queues are subscribed to: one for high priority slicing
requests and the other for low priority requests.  If the queues
do not exist, they are created.

The server sits in an event loop (as do all Node.js processes).
Periodically it attempts to fetch jobs from each queue using the
following logic:

0. Maintain a counter C of consecutively processed high priority
   jobs.  Initialize C to 0.
1. If C exceeds a configured value CMAX, request up to L low
   priority jobs.  Set C back to 0, regardless of whether any
   jobs are retrieved.   This is a mechanism to ensure that for
   every CMAX high priority jobs, at least one low priority
   job is processed.
2. Request up to H jobs from the high priority queue.  Let N be
   the number of jobs retrieved.
3. Set C to C + N.
4. If the number of jobs N retrieved in Step 2 is less than H,
   then attempt to retrieve H - N low priority jobs from the
   low priority queue.  If any low priority jobs are retrieved,
   set C to 0.
5. Initiate slicing for the retrieved job requests, if any.
6. Wait a bit and then go back to Step 1.

The values C, CMAX, H, and L are all configurable.  The above logic
is further enhanced with upper limits on the maximum number of slicing
jobs which can be running concurrently.

The slicing server relies on two SQS "features":

1. When a server reads a message (slicing request) from the SQS
   queue, that message is then hidden from all other servers.  This
   prevents multiple servers from processing the same request.
2. If the server does not postively delete a message from the
   queue nor renew its hidden state, then the message ceases to
   be hidden and can now be read by any server.  This mechanism
   prevents a slicing request from being lost should an individual
   slicing server be shut down or unexpectedly die.

As regards Item 2 above, the SQS queues are configured to hide
read messages for one minute.  When a slicing server reads
messages from the queues, it periodically refreshes each message's
hidden state, deleting each one from the queues once the associated
jobs have been processed.

## Processing

Each slicing request has six processing steps,

1. Download to the local server the input files from cloud storage.
2. Start a detached process to slice the input files.  Interpret
   the exit status code of the slicing job when the process
   terminates.
3. Upload from local storage to cloud storage the slicing output.
4. Delete the job request from the SQS queue.
5. Remove local files related to processing the job request.
6. Make any database updates to signify completion of the job.
