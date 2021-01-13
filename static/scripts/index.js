// MIT License
//
// Copyright (c) 2012 Universidad Politécnica de Madrid
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// Copyright (C) <2018> Intel Corporation
//
// SPDX-License-Identifier: Apache-2.0

// This file is borrowed from lynckia/licode with some modifications.

'use strict';
var conference;
var publicationGlobal;
const runSocketIOSample = function() {

    let localStream;
    let showedRemoteStreams = [];
    let myId;
    let subscriptionForMixedStream;
    let myRoom;
    let myUserId;
    let myUserNick;

    function resolutionToText(resolution)
    {
        if(resolution.width >= 1920 && resolution.height >= 1080)
        {
            return "蓝光";
        }
        if(resolution.width == 1280 && resolution.height == 720)
        {
            return "超清";
        }
        if(resolution.width == 852 && resolution.height == 480)
        {
            return "高清";
        }
        if(resolution.width == 640 && resolution.height == 360)
        {
            return "标清";
        }
        return "";
    }

    function getParameterByName(name) {
        name = name.replace(/[\[]/, '\\\[').replace(/[\]]/, '\\\]');
        var regex = new RegExp('[\\?&]' + name + '=([^&#]*)'),
            results = regex.exec(location.search);
        return results === null ? '' : decodeURIComponent(results[1].replace(
            /\+/g, ' '));
    }

    var subscribeForward = getParameterByName('forward') === 'true'?true:false;
    var isSelf = getParameterByName('self') === 'false'?false:true;
    conference = new Owt.Conference.ConferenceClient();
    function createResolutionButtons(stream, subscribeResolutionCallback) {
        let $p = $(`#${stream.id}resolutions`);
        let $bitContainer = $(`#${stream.id}resolutions .bitrate-container`);
        if ($p.length === 0) {
            $p = $(`<div class="video-container" id="${stream.id}resolutions"><div class="bitrate-container"><select class="bitrateSelects"></select></div>`);
            $p.appendTo($('body'));
            $bitContainer = $(`#${stream.id}resolutions .bitrate-container .bitrateSelects`);
        }
        // Resolutions from settings.
        for (const videoSetting of stream.settings.video) {
            const resolution = videoSetting.resolution;
            if (resolution && resolutionToText(resolution) != "" ) {
                const button = $('<option/>', {
                    text: resolutionToText(resolution),
                    class:'bitrateOption',
                    click: () => {
                        subscribeResolutionCallback(stream, resolution);
                    }
                });
                button.prependTo($bitContainer);
            }
        }
        // Resolutions from extraCapabilities.
        for (const resolution of stream.extraCapabilities.video.resolutions.reverse()) {
            if( resolutionToText(resolution) != "" )
            {
                const button = $('<option/>', {
                    text: resolutionToText(resolution),
                    class:'bitrateOption',
                    click: () => {
                        subscribeResolutionCallback(stream, resolution);
                    }
                });
                button.prependTo($bitContainer);
            }
        };
        return $p;
    }
    function subscribeAndRenderVideo(stream){
        let subscirptionLocal=null;
        let $video = document.querySelector('.video-container .playRTC');
        function subscribeDifferentResolution(stream, resolution){
            subscirptionLocal && subscirptionLocal.stop();
            subscirptionLocal = null;
            const videoOptions = {};
            videoOptions.codec = {name:"h264",profile:"B"};
            videoOptions.resolution = resolution;
            conference.subscribe(stream, {
                audio: true,
                video: videoOptions
            }).then((
                subscription) => {
                subscirptionLocal = subscription;
                $video.srcObject = stream.mediaStream;
            });
        }
        conference.subscribe(stream,{video:{width:stream.settings.video[0].resolution.width,height:stream.settings.video[0].resolution.height}})
        .then((subscription)=>{
            subscirptionLocal = subscription;
           
            $video.srcObject = stream.mediaStream;
        }, (err)=>{ console.log('subscribe failed', err);
        });
        stream.addEventListener('ended', () => {
            $video.srcObject = null;
        });
        stream.addEventListener('updated', () => {

        });
    }

    conference.addEventListener('streamadded', (event) => {
        console.log('A new stream is added ', event.stream.id);
        isSelf = isSelf?isSelf:event.stream.id != publicationGlobal.id;
        subscribeForward && isSelf && subscribeAndRenderVideo(event.stream);
        mixStream(myRoom, event.stream.id, ['common','presenters','rectangle']);
        event.stream.addEventListener('ended', () => {
            console.log(event.stream.id + ' is ended.');
        });
    });

    function publishVideo(Is720P,shareScreen,simulcast)
    {
        // audioConstraintsForMic
        let audioConstraints = new Owt.Base.AudioTrackConstraints(Owt.Base.AudioSourceInfo.MIC);
        // videoConstraintsForCamera
        let videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
        if (shareScreen) {
            // audioConstraintsForScreen
            audioConstraints = new Owt.Base.AudioTrackConstraints(Owt.Base.AudioSourceInfo.SCREENCAST);
            // videoConstraintsForScreen
            videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.SCREENCAST);
        }
        if(Is720P)
        {
            videoConstraints.resolution = {width:1280,height:720};
        }
        let mediaStream;
        Owt.Base.MediaStreamFactory.createMediaStream(new Owt.Base.StreamConstraints(
            audioConstraints, videoConstraints)).then(stream => {
            let publishOption = {video:[{codec:{name:'h264',profile:'B'},maxBitrate:4000}]};
            mediaStream = stream;
            localStream = new Owt.Base.LocalStream(
                mediaStream, new Owt.Base.StreamSourceInfo(
                    'mic', 'camera'));
            conference.publish(localStream, publishOption).then(publication => {
                publicationGlobal = publication;
                mixStream(myRoom, publication.id, ['common','presenters','rectangle'])
                publication.addEventListener('error', (err) => {
                    console.log('Publication error: ' + err.error.message);
                });
            });
        }, err => {
            console.error('Failed to create MediaStream, ' +
                err);
                if(Is720P)
                {
                    publishVideo(false,shareScreen,simulcast);
                }
        });
    }

    window.onload = function() {
        var simulcast = getParameterByName('simulcast') || false;
        var shareScreen = getParameterByName('screen') || false;
        myRoom = getParameterByName('room');
        myUserId = getParameterByName('userId');
        myUserNick = getParameterByName('userNick');
        var isHttps = (location.protocol === 'https:');
        var mediaUrl = getParameterByName('url');
        var isPublish = getParameterByName('publish');
        createToken(myRoom, myUserId, 'presenter', function(response) {
            var token = response;
            conference.join(token).then(resp => {
                myId = resp.self.id;
                myRoom = resp.id;
                if(mediaUrl){
                     startStreamingIn(myRoom, mediaUrl);
                }
                if (isPublish !== 'false') {
                    publishVideo(true,shareScreen,simulcast);
                }
                var streams = resp.remoteStreams;
                for (const stream of streams) {
                    if(!subscribeForward){
                      if ((stream.source.audio === 'mixed' || stream.source.video ===
                        'mixed') && stream.id.indexOf('-presenters') > 0) {
                        subscribeAndRenderVideo(stream);
                      }
                    } else if (stream.source.audio !== 'mixed') {
                        subscribeAndRenderVideo(stream);
                    }
                }
                console.log('Streams in conference:', streams.length);
                var participants = resp.participants;
                console.log('Participants in conference: ' + participants.length);
            }, function(err) {
                console.error('server connection failed:', err);
                if (err.message.indexOf('connect_error:') >= 0) {
                    const signalingHost = err.message.replace('connect_error:', '');
                    const signalingUi = 'signaling';
                    removeUi(signalingUi);
                    let $p = $(`<div id=${signalingUi}> </div>`);
                    const anchor = $('<a/>', {
                        text: 'Click this for testing certificate and refresh',
                        target: '_blank',
                        href: `${signalingHost}/socket.io/`
                    });
                    anchor.appendTo($p);
                    $p.appendTo($('body'));
                }
            });
        });
    };
};
window.onbeforeunload = function(event){
    conference.leave()
    publicationGlobal.stop();
}
