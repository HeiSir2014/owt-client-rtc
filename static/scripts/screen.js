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

    function getParameterByName(name) {
        name = name.replace(/[\[]/, '\\\[').replace(/[\]]/, '\\\]');
        var regex = new RegExp('[\\?&]' + name + '=([^&#]*)'),
            results = regex.exec(location.search);
        return results === null ? '' : decodeURIComponent(results[1].replace(
            /\+/g, ' '));
    }

    conference = new Owt.Conference.ConferenceClient();
    function subscribeAndRenderVideo(stream){
        let subscirptionLocal=null;
        let $video = document.querySelector('.video-container .playRTC');
        const videoOptions = {};
        videoOptions.codecs = [{ name: "h264", profile: "CB" }];
        videoOptions.resolutions = [stream.settings.video[0].resolution];
        videoOptions.bitrateMultipliers  = [1];
        conference.subscribe(stream,{video:videoOptions,audio:stream.source.audio?true:false})
        .then((subscription)=>{
            subscirptionLocal = subscription;
            subscirptionGlobal = subscirptionLocal;
            $video.srcObject = stream.mediaStream;
            $video.width = stream.settings.video[0].resolution.width;
            $video.height = stream.settings.video[0].resolution.height;
        }, (err)=>{
            subscirptionLocal = null;
            subscirptionGlobal = null;
            console.log('subscribe failed', err);
        });
        stream.addEventListener('ended', () => {
            $video.srcObject = null;

            let close = document.querySelector('.systools .close');
            close.click();
        });
        stream.addEventListener('updated', () => {

        });
    }

    window.onload = function() {

        ipcRenderer.on('set-remote-stream',async function(event,remoteDesc){
            console.log(remoteDesc)

            const pc = new RTCPeerConnection();
            
            ipcRenderer.on('set-icecandidate',function(event,candidates){
                console.log(candidates);
                candidates.forEach(candidate => {
                    pc.addIceCandidate(candidate);
                });
            });
            await pc.setRemoteDescription(remoteDesc);
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer);
            const localDesc = pc.localDescription;
            pc.onicecandidate = function({candidate})
            {
                candidate && ipcRenderer.send('set-icecandidate-remote',candidate.toJSON());
            }
            pc.ontrack = function(e){
                console.log("ontrack",e);
                let v = document.querySelector('.video-container .playRTC');
                v && (v.srcObject = e.streams[0]);
            }
            ipcRenderer.send('set-remote-desc',remoteDesc,localDesc.toJSON());
        })
        let close = document.querySelector('.systools .close');
        close.onclick = () => {
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
        return;

        myRoom = getParameterByName('room');
        myUserId = 'robot';
        myUserNick = '';
        createToken(myRoom, myUserId, 'presenter', function(response) {
            var token = response;
            conference.join(token).then(resp => {
                myId = resp.self.id;
                var streams = resp.remoteStreams;
                for (const stream of streams) {
                    if (stream.id === getParameterByName('streamId')) {
                        subscribeAndRenderVideo(stream);
                        break;
                    }
                }
            }, function(err) {
                console.error('server connection failed:', err);
            });
        });

        

        
        let screenScale = document.querySelector('.tools .screen-scale');
        let screen1V1 = document.querySelector('.tools .screen-1');
        screenScale.onclick = ()=>{
            let v = document.querySelector('.video-container .playRTC');
            
            delete v.width;
            delete v.height;

            v.style.width = "100%";
            v.style.height = "100%";

            v.style.objectFit = 'cover';
        }
        screen1V1.onclick = ()=>{
            let v = document.querySelector('.video-container .playRTC');
            v.width = v.videoWidth;
            v.height = v.videoHeight;

            
            v.style.width = "";
            v.style.height = "";

            v.style.objectFit = 'none';
        }
    };
};
window.onbeforeunload = function(event){
    return;
    conference && conference.leave();
    publicationGlobal && publicationGlobal.stop();
    subscirptionGlobal && subscirptionGlobal.stop();
}