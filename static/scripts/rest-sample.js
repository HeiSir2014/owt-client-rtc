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
            onRes(req.responseText);
        }
    };
    let url = generateUrl(host, path);
    req.open(method, url, true);
    req.setRequestHeader('Content-Type', 'application/json');
    if (body !== undefined) {
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
        let u = new URL(getParameterByName('serverURL'));
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

var mixStream = function (room, stream, views, host) {
    var jsonPatch = [];
    views.forEach(view => {
        jsonPatch.push({
            op: 'add',
            path: '/info/inViews',
            value: view
        });
    });
    send('PATCH', '/rooms/' + room + '/streams/' + stream, jsonPatch,
        onResponse, host);
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
        appKey:"DjRemote",
        room: room,
        user: user,
        role: role
    };
    send('POST', '/tokens/', body, callback, host);
};
