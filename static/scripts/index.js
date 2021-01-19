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
const { ipcRenderer, desktopCapturer } = require('electron');
var conference;
var publicationGlobal;
var publicationGlobal2;
var publicationScreenGlobal;
var subscirptionGlobal;
var mixStreamGlobal;
var bytesSentGlobal = 0;
var bytesReceivedGlobal = 0;

const runSocketIOSample = function () {

    let localStream;
    let localStream2;
    let ScreenStream;
    let myId;
    let myRoom;
    let myUserId;
    let myUserNick;

    function getParameterByName(name) {
        name = name.replace(/[\[]/, '\\\[').replace(/[\]]/, '\\\]');
        var regex = new RegExp('[\\?&]' + name + '=([^&#]*)'),
            results = regex.exec(location.search);
        return results === null ? '' : decodeURIComponent(results[1].replace(
            /\+/g, ' '));
    }

    
    function subscribeAndRenderVideo(stream) {
        let video = document.querySelector('.video-container .playRTC');
        const videoOptions = {};
        videoOptions.codecs = [{ name: "h264", profile: "CB" }];
        videoOptions.resolutions = [stream.settings.video[0].resolution];
        videoOptions.bitrateMultipliers  = [1.2];
        conference.subscribe(stream, {
            audio: stream.source.audio?true:false,
            video: videoOptions
        }).then((subscription) => {
            mixStreamGlobal = stream;
            subscirptionGlobal = subscription;
            video.srcObject = stream.mediaStream;

            speakButton && (speakButton.querySelector('img').src = !video.muted ? 'icon/speak_no.png':'icon/speak.png') &&
             (speakButton.querySelector('.title').innerHTML = !video.muted ? '静音':"取消静音");
        }, (err) => {
            mixStreamGlobal = null;
            subscirptionGlobal = null;
            console.log('subscribe failed', err);
        });
        stream.addEventListener('ended', () => {
            video.srcObject = null;
            mixStreamGlobal = null;
        });
        stream.addEventListener('updated', () => {

        });
    }

    

    function publishVideo2(Is720P) {
        let videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
        videoConstraints.deviceId = (video2Button ? video2Button.getAttribute('deviceId'):'');
        if (Is720P) {
            videoConstraints.resolution = { width: 1280, height: 720 };
        }
        let mediaStream;
        Owt.Base.MediaStreamFactory.createMediaStream(new Owt.Base.StreamConstraints(
            false, videoConstraints)).then(async stream => {
                let publishOption = { video: [{ codec: { name: 'h264', profile: 'CB' }, maxBitrate: 2500 }] };
                mediaStream = stream;
                
                let vT = mediaStream.getVideoTracks();
                let videoTrack,audioTrack;
                vT && vT.length && (videoTrack =vT[0] ) && 
                (document.querySelector('.tools .video2 .title').innerHTML = '禁用');
                (document.querySelector('.tools .video2 .label').src = 'icon/camera_no.png');
                
                localStream2 = new Owt.Base.LocalStream(
                    mediaStream, new Owt.Base.StreamSourceInfo(
                        'mic', 'camera'));
                conference.publish(localStream2, publishOption).then(publication => {
                    publicationGlobal2 = publication;
                    mixStream(myRoom, publication.id, ['common', 'presenters'])
                    publication.addEventListener('error', (err) => {
                        localStream2 && localStream2.mediaStream && destroyMediaStream(localStream2.mediaStream),(localStream2 = null);
                        console.log('Publication error: ' + err.error.message);

                        (document.querySelector('.tools .video2 .title').innerHTML = '启用')
                        (document.querySelector('.tools .video2 .label').src = 'icon/camera.png')
                    });
                });
            }, err => {
                publicationGlobal2 = null;
                localStream2 && localStream2.mediaStream && destroyMediaStream(localStream2.mediaStream),(localStream2 = null);
                
                console.error('Failed to create MediaStream, ' + err);
                if (Is720P) {
                    publishVideo2(false);
                    return 
                }
            });
    }

    function publishVideo(Is720P,MicOK) {
        // audioConstraintsForMic
        let audioConstraints = MicOK ? new Owt.Base.AudioTrackConstraints(Owt.Base.AudioSourceInfo.MIC):false;
        let videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
        if (Is720P) {
            videoConstraints.resolution = { width: 1280, height: 720 };
        }
        let mediaStream;
        Owt.Base.MediaStreamFactory.createMediaStream(new Owt.Base.StreamConstraints(
            audioConstraints, videoConstraints)).then(async stream => {
                let publishOption = { video: [{ codec: { name: 'h264', profile: 'CB' }, maxBitrate: 2500 }] };
                mediaStream = stream;
                
                let vT = mediaStream.getVideoTracks();
                let aT = mediaStream.getAudioTracks();
                let videoTrack,audioTrack;
                vT && vT.length && (videoTrack =vT[0] ) && 
                (document.querySelector('.tools .video .tip').innerHTML = videoTrack.label.replace(/ ?\([\w:]{9}\)/,'')) &&
                (document.querySelector('.tools .video .title').innerHTML = '禁用');
                (document.querySelector('.tools .video .label').src = 'icon/camera_no.png');
                aT && aT.length && (audioTrack = aT[0]) &&
                 (document.querySelector('.tools .audio .tip').innerHTML = audioTrack.label.replace(/ ?\([\w:]{9}\)/,'')) &&
                 (document.querySelector('.tools .audio .title').innerHTML = '静音') &&
                 (document.querySelector('.tools .audio .label').src = 'icon/mic_no.png');

                let devices = await navigator.mediaDevices.enumerateDevices();
                let videoInputDevices = devices.filter(d => d.kind && d.kind == 'videoinput');
                if(videoInputDevices.length >= 2 && videoTrack)
                {
                    videoInputDevices = videoInputDevices.filter(d => d.label != videoTrack.label);
                    videoInputDevices && videoInputDevices.length && (document.querySelector('.tools .video2 .tip').innerHTML = videoInputDevices[0].label.replace(/ ?\([\w:]{9}\)/,''))
                    && (document.querySelector('.tools .video2').setAttribute('deviceId',videoInputDevices[0].deviceId)) &&
                    (document.querySelector('.tools .video2 .title').innerHTML = '启用')&&
                    (document.querySelector('.tools .video2 .label').src = 'icon/camera.png');
                    
                }
                
                localStream = new Owt.Base.LocalStream(
                    mediaStream, new Owt.Base.StreamSourceInfo(
                        'mic', 'camera'));
                conference.publish(localStream, publishOption).then(publication => {
                    publicationGlobal = publication;
                    mixStream(myRoom, publication.id, ['common', 'presenters'])
                    let clearLocalCamera = (err)=>{
                        localStream && localStream.mediaStream && destroyMediaStream(localStream.mediaStream),(localStream = null);
                        console.log('Publication error: ' + err.error.message);

                        (document.querySelector('.tools .video .title').innerHTML = '启用')
                        (document.querySelector('.tools .video .label').src = 'icon/camera.png')
                        (document.querySelector('.tools .audio .title').innerHTML = '启用')
                        (document.querySelector('.tools .video .label').src = 'icon/mic.png')
                    };
                    
                    publication.addEventListener('error',clearLocalCamera);
                    publication.addEventListener('end',clearLocalCamera);
                });
            }, err => {
                publicationGlobal = null;
                localStream && localStream.mediaStream && destroyMediaStream(localStream.mediaStream),(localStream = null);
                
                console.error('Failed to create MediaStream, ' + err);
                if (Is720P && MicOK) {
                    publishVideo(false,true);
                    return 
                }
                if(Is720P == false && MicOK){
                    publishVideo(true,false);
                    return 
                }
                if(Is720P && MicOK == false){
                    publishVideo(false,false);
                    return 
                }
            });
    }





    function destroyMediaStream(mediaStream)
    {
        try {
            let audioTracks,videoTracks;
            mediaStream && (audioTracks = mediaStream.getAudioTracks()),
            mediaStream && (videoTracks = mediaStream.getVideoTracks()),
            audioTracks && (audioTracks.forEach(t=>{ t.stop(); mediaStream.removeTrack(t);})),
            videoTracks && (videoTracks.forEach(t=>{ t.stop(); mediaStream.removeTrack(t);})),
            (mediaStream = null);
        } catch (err) {
            console.error(err);
        }
    }

    window.onload = async function () {
        myRoom = getParameterByName('room');
        myUserId = getParameterByName('userId');
        myUserNick = getParameterByName('userNick');

        createToken(myRoom, myUserId, 'presenter',function (response) {
            var token = response;
            conference = new Owt.Conference.ConferenceClient();
            conference.join(token).then(resp =>  {
                myId = resp.self.id;
                myRoom = resp.id;

                publishVideo(true,true);
                var streams = resp.remoteStreams;
                for (const stream of streams) {
                    if ((stream.source.audio === 'mixed' || stream.source.video ===
                        'mixed') && stream.id.indexOf('-presenters') > 0) {
                        subscribeAndRenderVideo(stream);
                    }
                    else if (stream.origin !== myId && stream.source
                        && stream.source.video
                        && stream.source.video == 'screen-cast') {
                        ipcRenderer.send('show-screen', `${location.search}&streamId=${stream.id}`);
                    }
                }
                console.log('Streams in conference:', streams.length);
                var participants = resp.participants;
                console.log('Participants in conference: ' + participants.length);
            }, function (err) {
                console.error('server connection failed:', err);
                if (err.message.indexOf('connect_error:') >= 0) {
                    const div = $('<div>网络错误</div>');
                    div.appendTo($p);
                    $p.appendTo($('body'));
                }
            });

            conference.addEventListener('streamadded', (event) => {
                console.log('A new stream is added ', event.stream.id);
                //isSelf = isSelf?isSelf:event.stream.id != publicationGlobal.id;
                //mixStream(myRoom, event.stream.id, ['common','presenters']);
                if (event.stream.origin !== myId && event.stream.source
                    && event.stream.source.video
                    && event.stream.source.video == 'screen-cast') {
                    ipcRenderer.send('show-screen', `${location.search}&streamId=${event.stream.id}`);
                }
                event.stream.addEventListener('ended', () => {
                    console.log(event.stream.id + ' is ended.');
                });
            });
        });

        function calcNetwork(bytesSent, bytesReceived) {
            let speedSent = 0;
            let speedReceived = 0;
            if (bytesReceivedGlobal && bytesReceived > bytesReceivedGlobal) {
                speedReceived = Math.round((bytesReceived - bytesReceivedGlobal) / 1024);
            }
            bytesReceivedGlobal = bytesReceived;
            let download = document.querySelector('.network .download');
            download.innerHTML = `下行：${speedReceived} KB/s`;
            if (bytesSentGlobal && bytesSent > bytesSentGlobal) {
                speedSent = Math.round((bytesSent - bytesSentGlobal) / 1024);
            }
            bytesSentGlobal = bytesSent;
            let up = document.querySelector('.network .upload');
            up.innerHTML = `上行：${speedSent} KB/s`;
        }



        setInterval(async () => {
            let bytesSent = 0;
            let bytesReceived = 0;
            let stats;

            function statForEach(stat) {
                /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesSent'] && (bytesSent = bytesSent + stat['bytesSent']);
                /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesReceived'] && (bytesReceived = bytesReceived + stat['bytesReceived']);
            }

            subscirptionGlobal && (stats = await subscirptionGlobal.getStats());
            stats && stats.forEach(statForEach) && (stats = null);
            publicationGlobal && (stats = await publicationGlobal.getStats());
            stats && stats.forEach(statForEach) && (stats = null);
            publicationGlobal2 && (stats = await publicationGlobal2.getStats());
            stats && stats.forEach(statForEach) && (stats = null);
            publicationScreenGlobal && (stats = await publicationScreenGlobal.getStats());
            stats && stats.forEach(statForEach) && (stats = null);

            calcNetwork(bytesSent, bytesReceived);
        }, 1000);

        let close = document.querySelector('.systools .close');
        let exit = document.querySelector('.tools .exit');
        window.desktopShare = document.querySelector('.tools .desktop');
        window.changeLayout = document.querySelector('.tools .layout');
        window.audioButton = document.querySelector('.tools .audio');
        window.videoButton = document.querySelector('.tools .video');
        window.video2Button = document.querySelector('.tools .video2');
        window.speakButton = document.querySelector('.tools .speak');
        
        exit.onclick = close.onclick = () => {
            try {
                conference && (conference.leave());
                publicationGlobal && publicationGlobal.stop();
                subscirptionGlobal && subscirptionGlobal.stop();
            } catch (_) { }
            ScreenStream && ScreenStream.mediaStream && (destroyMediaStream(ScreenStream.mediaStream)),(ScreenStream = null);
            localStream && localStream.mediaStream && destroyMediaStream(localStream.mediaStream),(localStream = null);
            conference = publicationGlobal = subscirptionGlobal = null;
            let v = document.querySelector('.video-container .playRTC');
            v && (v.srcObject = null);
            ipcRenderer.send("close-win");
        };

        window.startShareScreen = async function startShareScreen(screenId) {
            let screenDlg = document.querySelector('.screen-dialog');
            
            screenDlg && (screenDlg.style.display = 'none') && (screenDlg.innerHTML = '');

            let mediaStream;
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'screen',
                        chromeMediaSourceId: screenId,
                        maxWidth: 1920,
                        maxHeight: 1920
                    }
                }
            });
            let publishOption = { video: [{ codec: { name: 'h264', profile: 'CB' }, maxBitrate: 8000 }] };
            ScreenStream = new Owt.Base.LocalStream(mediaStream, new Owt.Base.StreamSourceInfo('screen-cast', 'screen-cast'));
            conference.publish(ScreenStream, publishOption).then(publication => {
                publicationScreenGlobal = publication;
                
                desktopShare.querySelector('img').src = 'icon/desktop-share_no.png';
                desktopShare.querySelector('.title').innerHTML = "关闭";

                mixStream(myRoom, publication.id, ['common']);

                let clearScreenShare = (err)=>{
                    ScreenStream && ScreenStream.mediaStream && (destroyMediaStream(ScreenStream.mediaStream)),(ScreenStream = null);
                    
                    desktopShare.querySelector('img').src = 'icon/desktop-share.png';
                    desktopShare.querySelector('.title').innerHTML = "分享";
                }
                publication.addEventListener('error', clearScreenShare);
                publication.addEventListener('end',clearScreenShare);


                //ipcRenderer.send('show-screen', publication.id);
                ipcRenderer.send('show-screen-publish', `${location.search}&streamId=${publication.id}`);

            }, err => {
                ScreenStream && ScreenStream.mediaStream && (destroyMediaStream(ScreenStream.mediaStream)),(ScreenStream = null);
                console.error('Failed to publish ScreenStream, ' + err);
                publicationScreenGlobal = null;
            });
        }


        desktopShare.onclick = (e) => {
            if(e.target.className =='screen-poster') return;
            console.log('desktopShare.onclick' + e.target)
            if (publicationScreenGlobal) {
                ScreenStream && ScreenStream.mediaStream && (destroyMediaStream(ScreenStream.mediaStream)),(ScreenStream = null);
                publicationScreenGlobal.stop();
                publicationScreenGlobal = null;
                desktopShare.querySelector('img').src = 'icon/desktop-share.png';
                desktopShare.querySelector('.title').innerHTML = "分享";
                ipcRenderer.send('show-screen-close');
                return;
            }

            let screenDlg = document.querySelector('.screen-dialog');
            if (screenDlg.style.display == 'block') {
                screenDlg.style.display = 'none';
                screenDlg.innerHTML = '';
                return;
            }

            desktopCapturer.getSources({ types: ['screen'] }).then(sources => {

                screenDlg.innerHTML = '';
                sources.forEach(source => {
                    screenDlg.innerHTML += `<img class="screen-poster" onclick="startShareScreen('${source.id}')" src="${source.thumbnail.toDataURL()}" />`;
                });
                screenDlg.style.display = 'block';
                return;

            });
        };

        window.layoutIndex = 0;
        changeLayout.onclick = (e) => {
            if (subscirptionGlobal) {
                var layouts = [
                    [{ "region": [{ "id": "1", "area": { "height": "1", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "1/4", "width": "1/4", "top": "3/4", "left": "3/4" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "1279/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "1279/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "1439/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "269/1080", "width": "479/1920", "top": "0", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "268/1080", "width": "479/1920", "top": "271/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "268/1080", "width": "479/1920", "top": "541/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "269/1080", "width": "479/1920", "top": "811/1080", "left": "1441/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "719/1080", "width": "1279/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "358/1080", "width": "639/1920", "top": "721/1080", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "809/1080", "width": "1439/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "269/1080", "width": "479/1920", "top": "0", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "268/1080", "width": "479/1920", "top": "281/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "268/1080", "width": "479/1920", "top": "541/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "268/1080", "width": "479/1920", "top": "811/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "269/1080", "width": "479/1920", "top": "811/1080", "left": "961/1920" }, "shape": "rectangle" }, { "id": "7", "area": { "height": "269/1080", "width": "479/1920", "top": "811/1080", "left": "481/1920" }, "shape": "rectangle" }, { "id": "8", "area": { "height": "269/1080", "width": "479/1920", "top": "811/1080", "left": "0" }, "shape": "rectangle" }] }],
                    [{ "region": [{ "id": "1", "area": { "height": "1", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "1", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "959/1920", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "539/1080", "width": "959/1920", "top": "541/1080", "left": "961/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "538/1080", "width": "959/1920", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "539/1080", "width": "959/1920", "top": "541/1080", "left": "961/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "538/1080", "width": "639/1920", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "539/1080", "width": "639/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "638/1920", "top": "0", "left": "641/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "539/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "539/1080", "width": "638/1920", "top": "541/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "359/1080", "width": "638/1920", "top": "0", "left": "641/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "0" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "358/1080", "width": "638/1920", "top": "361/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "7", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "0" }, "shape": "rectangle" }, { "id": "8", "area": { "height": "359/1080", "width": "638/1920", "top": "721/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "9", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "1281/1920" }, "shape": "rectangle" }] }],
                ];
                layoutIndex = layoutIndex + 1;
                if (layoutIndex >= layouts.length) {
                    layoutIndex = 0;
                }

                let values = [];
                layouts[layoutIndex].forEach(__ => {
                    let regions = __["region"];
                    let _ = [];
                    //if(regions.length == 5) return;
                    regions.forEach(region => {
                        _.push({ region: region });
                    });
                    values.push(_);
                });
                setLayoutStream(myRoom, mixStreamGlobal.id, values);
            }
        }

        audioButton.onclick = (e)=>{
            let track;
            let enabled = false;
            publicationGlobal && localStream && localStream.mediaStream && (track = localStream.mediaStream.getAudioTracks()[0]);
            track && (track.enabled = !track.enabled) && (enabled = track.enabled);
            audioButton.querySelector('img').src = enabled ? 'icon/mic_no.png':'icon/mic.png';
            audioButton.querySelector('.title').innerHTML = enabled ? '静音':"取消静音";
        }

        videoButton.onclick = (e)=>{
            let track;
            let enabled = false;
            if(publicationGlobal)
            {
                localStream && localStream.mediaStream && (track = localStream.mediaStream.getVideoTracks()[0]);
                track && (track.enabled = !track.enabled) && (enabled = track.enabled);
                videoButton.querySelector('img').src = enabled ? 'icon/camera_no.png':'icon/camera.png';
                videoButton.querySelector('.title').innerHTML = enabled ? '禁用':"启用";
                
                return;
            }
            publishVideo(true);
        }

        video2Button.onclick = (e)=>{
            let track;
            let enabled = false;
            if(publicationGlobal2)
            {
                publicationGlobal2.stop();
                publicationGlobal2 = null;
                localStream2 && localStream2.mediaStream && destroyMediaStream(localStream2.mediaStream),(localStream2 = null);
                localStream2 && localStream2.mediaStream && (track = localStream2.mediaStream.getVideoTracks()[0]);
                track && (track.enabled = !track.enabled) && (enabled = track.enabled);
                video2Button.querySelector('img').src = enabled ? 'icon/camera_no.png':'icon/camera.png';
                video2Button.querySelector('.title').innerHTML = enabled ? '禁用':"启用";
                return;
            }
            
            publishVideo2(true);
        }

        speakButton.onclick = (e)=>{
            let video = document.querySelector('.video-container .playRTC');
            video && (video.muted = !video.muted);
            speakButton.querySelector('img').src = !video.muted ? 'icon/speak_no.png':'icon/speak.png';
            speakButton.querySelector('.title').innerHTML = !video.muted ? '静音':"取消静音";
        }


        let devices = await navigator.mediaDevices.enumerateDevices()
        let audioInputDevices = devices.filter(d => d.kind && d.kind == 'audioinput');
        let videoDevices = devices.filter(d => d.kind && d.kind == 'videoinput');
        
        audioInputDevices && audioInputDevices.length == 0 &&
         (audioButton.querySelector('img').src = 'icon/mic.png');

        console.log(videoDevices);
        videoDevices && videoDevices.length >= 2 && (document.querySelector('.tools .video2').style.display = 'inline-block');
    };
};
window.onbeforeunload = function (event) {
    conference && conference.leave();
    publicationGlobal && publicationGlobal.stop();
    subscirptionGlobal && subscirptionGlobal.stop();
    publicationScreenGlobal && publicationScreenGlobal.stop();
}