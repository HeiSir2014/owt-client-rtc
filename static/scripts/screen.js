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
        stream.source.audio
        conference.subscribe(stream,{video:{width:stream.settings.video[0].resolution.width,height:stream.settings.video[0].resolution.height},audio:stream.source.audio?true:false})
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

    window.onload = function() {
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
    };
};
window.onbeforeunload = function(event){
    conference && conference.leave();
    publicationGlobal && publicationGlobal.stop();
    subscirptionGlobal && subscirptionGlobal.stop();
}