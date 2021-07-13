// Copyright (C) <2018> Intel Corporation
//
// SPDX-License-Identifier: Apache-2.0

// REST samples. It sends HTTP requests to sample server, and sample server sends requests to conference server.
// Both this file and sample server are samples.
'use strict';
var send = function (method, path, body, onRes, host) {
    var req = new XMLHttpRequest()
    req.onreadystatechange = function () {
        if (req.readyState === 4) {
            onRes && onRes(req.responseText);
        }
    };
    let url = generateUrl(host, path);
    req.open(method, url, true);
    if (body !== undefined && body !== null) {
        req.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
        req.send(JSON.stringify(body));
    } else {
        req.send();
    }
};
function getParameterByName(name) {
    name = name.replace(/[\[]/, '\\\[').replace(/[\]]/, '\\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)'),
      results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(
      /\+/g, ' '));
  }
var generateUrl = function(host, path) {
    let url;
    if (host !== undefined) {
        url = host + path;  // Use the host user set.
    }else {
        let s = getParameterByName('serverURL');
        !s && (s = location.href); 
        let u = new URL(s);
        url = u.origin + path;  // Get the string before last '/'.
    }
    return url;
}

var onResponse = function (result) {
    if (result) {
        try {
            console.info('Result:', JSON.parse(result));
        } catch (e) {
            console.info('Result:', result);
        }
    } else {
        console.info('Null');
    }
};

var mixStream = function (room, stream, views, callback, host) {
    var jsonPatch = [];
    views.forEach(view => {
        jsonPatch.push({
            op: 'add',
            path: '/info/inViews',
            value: view
        });
    });
    send('PATCH', '/rooms/' + room + '/streams/' + stream, jsonPatch,
        callback, host);
};
var unMixStream = function (room, stream, views, callback, host) {
    var jsonPatch = [];
    views.forEach(view => {
        jsonPatch.push({
            op: 'remove',
            path: '/info/inViews',
            value: view
        });
    });
    send('PATCH', '/rooms/' + room + '/streams/' + stream, jsonPatch,
    callback, host);
};

var setLayoutStream = function (room, stream, views, host) {
    var jsonPatch = [];
    views.forEach(view => {
        jsonPatch.push({
            op: 'replace',
            path: '/info/layout',
            value: view
        });
    });
    
    send('PATCH', '/rooms/' + room + '/streams/' + stream, jsonPatch,
        onResponse, host);
};

var activeLayoutStream = function (room,mixedStream,subStream, host) {
    var jsonPatch = [{
        op: 'replace',
        path: '/info/layout/0/stream',
        value: subStream
    }];
    send('PATCH', '/rooms/' + room + '/streams/' + mixedStream, jsonPatch,
        onResponse, host);
};

var getRecording = function(room, callback, host) {
    send('GET', '/rooms/' + room + '/recordings', null, function(recordingRtn) {
        if(callback == null) return;
        var result = JSON.parse(recordingRtn);
        callback && callback(result);
    }, host);
};
var startRecording = function(room, audioFrom, videoFrom, container, callback, host) {
    var options = {
        media: {
            audio: {
                from: audioFrom
            },
            video: {
                from: videoFrom
            }
        },
        container: (container ? container : 'auto')
    };
    send('POST', '/rooms/' + room + '/recordings/', options, function(recordingRtn) {
        if(callback == null) return;
        var result = JSON.parse(recordingRtn);
        callback && callback(result);
    }, host);
};

var stopRecording = function(room, id, data ,callback, host) {
    send('DELETE', '/rooms/' + room + '/recordings/' + id, data, callback, host);
};

var getStreamingOuts = function(room,callback,host){
    send('GET', '/rooms/' + room + '/streaming-outs', null,  function(ret) {
        if(callback == null) return;
        var result = JSON.parse(ret);
        callback && callback(result);
    }, host);
}

var startStreamingOut = function (room, streamId, callback, host) {
    var options = {
        url: 'rtmp://127.0.0.1/live/'+room,
        media: {
            audio: {from:streamId},
            video: {from:streamId}
        }
    };
    send('POST', '/rooms/' + room + '/streaming-outs', options,  function(ret) {
        if(callback == null) return;
        var result = JSON.parse(ret);
        callback && callback(result);
    }, host);
};

var stopStreamingOut = function (room, outId, callback, host) {
    send('DELETE', '/rooms/' + room + '/streaming-outs/'+ outId, null,  function(ret) {
        if(callback == null) return;
        var result = JSON.parse(ret);
        callback && callback(result);
    }, host);
};

var startStreamingIn = function (room, inUrl, host) {
    var options = {
        url: inUrl,
        media: {
            audio: 'auto',
            video: true
        },
        transport: {
            protocol: 'udp',
            bufferSize: 2048
        }
    };
    send('POST', '/rooms/' + room + '/streaming-ins', options, onResponse, host);
};

var createToken = function (room, user, role, callback, host) {
    var body = {
        appKey:"OpenRemote",
        room: room,
        user: user,
        role: role
    };
    send('POST', '/tokens/', body, callback, host);
};