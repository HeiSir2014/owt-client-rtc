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
const { ipcRenderer,desktopCapturer } = require('electron');
var conference;
var publicationGlobal;
var publicationScreenGlobal;
var subscirptionGlobal;;
var bytesSentGlobal = 0;
var bytesReceivedGlobal = 0;

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
            subscirptionGlobal = subscirptionLocal;
            $video.srcObject = stream.mediaStream;
        }, (err)=>{
            subscirptionLocal = null;
            subscirptionGlobal = null;
            console.log('subscribe failed', err);
        });
        stream.addEventListener('ended', () => {
            $video.srcObject = null;
        });
        stream.addEventListener('updated', () => {

        });
    }

    conference.addEventListener('streamadded', (event) => {
        console.log('A new stream is added ', event.stream.id);
        //isSelf = isSelf?isSelf:event.stream.id != publicationGlobal.id;
        //mixStream(myRoom, event.stream.id, ['common','presenters','rectangle']);
        if(event.stream.origin !== myId && event.stream.source 
            && event.stream.source.video
            && event.stream.source.video == 'screen-cast')
        {
            ipcRenderer.send('show-screen',event.stream.id);
        }
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
            publicationGlobal = null;
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

        function calcNetwork(bytesSent,bytesReceived)
        {
            let speedSent = 0;
            let speedReceived = 0;
            if(bytesReceivedGlobal)
            {
                speedReceived = Math.round((bytesReceived - bytesReceivedGlobal)/1024);
            }
            bytesReceivedGlobal = bytesReceived;
            let download = document.querySelector('.network .download');
            download.innerHTML = `下行：${speedReceived} KB/s`;
            if(bytesSentGlobal)
            {
                speedSent = Math.round((bytesSent - bytesSentGlobal)/1024);
            }
            bytesSentGlobal = bytesSent;
            let up = document.querySelector('.network .upload');
            up.innerHTML = `上行：${speedSent} KB/s`;
        }

        setInterval(() => {
            let bytesSent = 0;
            let bytesReceived = 0;

            subscirptionGlobal && subscirptionGlobal.getStats().then(stats=>{
                stats.forEach((stat)=>{
                    /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesSent'] && (bytesSent = bytesSent + stat['bytesSent']);
                    /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesReceived'] && (bytesReceived = bytesReceived + stat['bytesReceived']);
                });
                publicationGlobal && publicationGlobal.getStats().then(stats=>{
                    stats.forEach((stat)=>{
                        /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesSent'] && (bytesSent = bytesSent + stat['bytesSent']);
                        /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesReceived'] && (bytesReceived = bytesReceived + stat['bytesReceived']);
                    });
                    calcNetwork(bytesSent,bytesReceived);
                });
                if(!publicationGlobal)
                {
                    calcNetwork(bytesSent,bytesReceived);
                }
            });
            if(!subscirptionGlobal)
            {
                calcNetwork(0,0);
            }
        }, 1000);

        let close = document.querySelector('.systools .close');
        let exit = document.querySelector('.tools .exit');
        let desktopShare = document.querySelector('.tools .desktop');
        exit.onclick = close.onclick = ()=>{
            try {
                conference && (conference.leave());
                publicationGlobal && publicationGlobal.stop();
                subscirptionGlobal && subscirptionGlobal.stop();
            } catch (_) {
                
            }
            conference = publicationGlobal = subscirptionGlobal = null;
            let v = document.querySelector('.video-container .playRTC');
            v && (v.srcObject = null);
            ipcRenderer.send("close-win");
        };

        desktopShare.onclick = ()=>{
              let mediaStream;
              desktopCapturer.getSources({ types: ['screen'] }).then(async sources => {
                  mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                      mandatory: {
                        chromeMediaSource: 'screen',
                        chromeMediaSourceId: sources[0].id,
                        minWidth: 1280,
                        maxWidth: 1920,
                        minHeight: 720,
                        maxHeight: 1920
                      }
                    }
                  });
                  let publishOption = {video:[{codec:{name:'h264',profile:'B'},maxBitrate:8000}]};
                  let ScreenStream = new Owt.Base.LocalStream(mediaStream, new Owt.Base.StreamSourceInfo('screen-cast', 'screen-cast'));
                  conference.publish(ScreenStream,publishOption).then(publication => {
                      publicationScreenGlobal = publication;
                      mixStream(myRoom, publication.id, ['common','presenters','rectangle']);
                      publication.addEventListener('error', (err) => {
                          console.log('Publication error: ' + err.error.message);
                      });

                      ipcRenderer.send('show-screen',publication.id);

                  },err =>{
                      console.error('Failed to publish ScreenStream, ' + err);
                      ScreenStream = null;
                      publicationScreenGlobal = null;
                  });
              });
        };
    };
};
window.onbeforeunload = function(event){
    conference && conference.leave();
    publicationGlobal && publicationGlobal.stop();
    subscirptionGlobal && subscirptionGlobal.stop();
}