// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var extension_pb = require('./extension_pb.js');

function serialize_nativescript_extension_v1_Empty(arg) {
  if (!(arg instanceof extension_pb.Empty)) {
    throw new Error('Expected argument of type nativescript.extension.v1.Empty');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_nativescript_extension_v1_Empty(buffer_arg) {
  return extension_pb.Empty.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_nativescript_extension_v1_Input(arg) {
  if (!(arg instanceof extension_pb.Input)) {
    throw new Error('Expected argument of type nativescript.extension.v1.Input');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_nativescript_extension_v1_Input(buffer_arg) {
  return extension_pb.Input.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_nativescript_extension_v1_Manifest(arg) {
  if (!(arg instanceof extension_pb.Manifest)) {
    throw new Error('Expected argument of type nativescript.extension.v1.Manifest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_nativescript_extension_v1_Manifest(buffer_arg) {
  return extension_pb.Manifest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_nativescript_extension_v1_Result(arg) {
  if (!(arg instanceof extension_pb.Result)) {
    throw new Error('Expected argument of type nativescript.extension.v1.Result');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_nativescript_extension_v1_Result(buffer_arg) {
  return extension_pb.Result.deserializeBinary(new Uint8Array(buffer_arg));
}


var ExtensionService = exports.ExtensionService = {
  describe: {
    path: '/nativescript.extension.v1.Extension/Describe',
    requestStream: false,
    responseStream: false,
    requestType: extension_pb.Empty,
    responseType: extension_pb.Manifest,
    requestSerialize: serialize_nativescript_extension_v1_Empty,
    requestDeserialize: deserialize_nativescript_extension_v1_Empty,
    responseSerialize: serialize_nativescript_extension_v1_Manifest,
    responseDeserialize: deserialize_nativescript_extension_v1_Manifest,
  },
  invoke: {
    path: '/nativescript.extension.v1.Extension/Invoke',
    requestStream: false,
    responseStream: false,
    requestType: extension_pb.Input,
    responseType: extension_pb.Result,
    requestSerialize: serialize_nativescript_extension_v1_Input,
    requestDeserialize: deserialize_nativescript_extension_v1_Input,
    responseSerialize: serialize_nativescript_extension_v1_Result,
    responseDeserialize: deserialize_nativescript_extension_v1_Result,
  },
};

exports.ExtensionClient = grpc.makeGenericClientConstructor(ExtensionService, 'Extension');
