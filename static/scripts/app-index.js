const { ipcRenderer, desktopCapturer } = require('electron');

const _app = new Vue({
    el: '#App',
    data:function(){
        return {
            version:'1.0.2',
            statUpload:0,
            statDownload:0,
            playerStream:null,
            IsSpeakMuted:false
        }
    },
    methods:{
        init:function(e){
            const that = this;
            that.myRoom = getParameterByName('room');
            that.myUserId = getParameterByName('userId');
            that.myUserNick = getParameterByName('userNick');
            that.enableAudio = getParameterByName('enableAudio');
            that.enableVideo = getParameterByName('enableVideo');

            that.enableAudio = ((!that.enableAudio || that.enableAudio=='true') ? true : false);
            that.enableVideo = ((!that.enableVideo || that.enableVideo=='true') ? true : false);

            createToken(that.myRoom, that.myUserId, 'presenter',function (response) {
                var token = response;
                if(!token)
                {
                    console.error('token is empty');
                    return;
                }
                that.conference = new Owt.Conference.ConferenceClient();
                that.conference.join(token).then(resp =>  {
                    that.myId = resp.self.id;
                    that.myRoomId = resp.id;
                    
                    (that.enableAudio || that.enableAudio) && that.publishVideo();

                    var streams = resp.remoteStreams;
                    for (const stream of streams) {
                        if ((stream.source.audio === 'mixed' || stream.source.video ===
                            'mixed') && stream.id.indexOf('-presenters') != -1) {
                            that.subscribeStream(stream);
                        }
                        else if (stream.origin !== that.myId && stream.source
                            && stream.source.video
                            && stream.source.video == 'screen-cast') {
                            ipcRenderer.send('show-screen', `${location.search}&streamId=${stream.id}`);
                        }
                    }
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
    
                that.conference.addEventListener('streamadded', that.streamadded.bind(that));
                that.conference.addEventListener('streamadded', that.streamadded.bind(that));

                that.statInterval && (clearInterval(statInterval),that.statInterval = 0);
                that.statInterval = setInterval(that._getStat.bind(that), 1000);
            });
        },
        close:function(e){
            this.exitRoom();
            ipcRenderer.send("close-win");
        },
        minimize:function(e){
            ipcRenderer.send("minimize-win");
        },
        subscribeStream:function(stream){
            const that = this;
            if(!that.conference) return;
            that.conference.subscribe(stream, {
                audio: stream.source.audio ? true : false,
                video: {
                    codecs:[{ name: "h264", profile: "CB" }],
                    resolutions:[stream.settings.video[0].resolution],
                    bitrateMultipliers:[1.0]
                }
            }).then((subscription) => {
                that.mixStreamGlobal = stream;
                that.subscirptionGlobal = subscription;
                that.playerStream = stream.mediaStream;

                that.IsSpeakMuted = false;
            }, (err) => {
                that.playerStream = null;
                that.mixStreamGlobal = null;
                that.subscirptionGlobal = null;
                console.log('subscribe failed', err);
            });
            stream.addEventListener('ended', () => {
                that.playerStream = null;
                that.mixStreamGlobal = null;
                console.log(`${stream.id} is ended`);
            });
            stream.addEventListener('updated', () => {
                console.log(`${stream.id} is updated`);
            });
        },
        streamadded:function(event){
            const that = this;
            console.log('A new stream is added ', event.stream.id);
            //isSelf = isSelf?isSelf:event.stream.id != publicationGlobal.id;
            //mixStream(that.myRoomId, event.stream.id, ['common','presenters']);
            if (event.stream.origin !== that.myId && event.stream.source
                && event.stream.source.video
                && event.stream.source.video == 'screen-cast') {
                ipcRenderer.send('show-screen', `${location.search}&streamId=${event.stream.id}`);
            }
            event.stream.addEventListener('ended', () => {
                console.log(event.stream.id + ' is ended.');
            });
        },
        publishVideo:async function(){
            const that = this;
            let videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
            let audioConstraints = [new Owt.Base.AudioTrackConstraints(Owt.Base.AudioSourceInfo.MIC),false];
            let resolutions = [{ width: 1920, height: 1080 },{ width: 1280, height: 720 },{ width: 640, height: 360 },undefined];
            let mediaStream;
            for (const audioConstraint of audioConstraints) {
                for (const resolution of resolutions) {
                    try {
                        videoConstraints.resolution = resolution;
                        if(resolution == undefined) delete videoConstraints.resolution;
                        
                        mediaStream = await Owt.Base.MediaStreamFactory.createMediaStream(new Owt.Base.StreamConstraints(
                            audioConstraint, videoConstraints));
                        break;
                    } catch (error) {
                        mediaStream = null;
                        console.error(error);
                    }
                }
                if(mediaStream) break;
            }
            if(!mediaStream) return;
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

            audioTrack && (audioTrack.enabled = that.enableAudio);
            videoTrack && (videoTrack.enabled = that.enableVideo);

            that.localStream = new Owt.Base.LocalStream(
                mediaStream, new Owt.Base.StreamSourceInfo(
                    'mic', 'camera'));
            try {
                that.publicationGlobal = await that.conference.publish(that.localStream, { video: [{ codec: { name: 'h264', profile: 'CB' }, maxBitrate: 2500 }] });
            } catch (error) {
                that.publicationGlobal = null;
                console.error(error);
                that.localStream && that.localStream.mediaStream && that.destroyMediaStream(that.localStream.mediaStream),(that.localStream = null);
            }
            if(!that.publicationGlobal) return;
            mixStream(that.myRoomId, that.publicationGlobal.id, ['common', 'presenters'])
            let clearLocalCamera = (err)=>{
                that.localStream && that.localStream.mediaStream && that.destroyMediaStream(that.localStream.mediaStream),(that.localStream = null);
                console.log('Publication error: ' + err.error.message);

                (document.querySelector('.tools .video .title').innerHTML = '启用')
                (document.querySelector('.tools .video .label').src = 'icon/camera.png')
                (document.querySelector('.tools .audio .title').innerHTML = '启用')
                (document.querySelector('.tools .video .label').src = 'icon/mic.png')
            };
            
            that.publicationGlobal.addEventListener('error',clearLocalCamera);
            that.publicationGlobal.addEventListener('end',clearLocalCamera);
        },
        _getStat:async function() {
            const that = this;
            let bytesSent = 0;
            let bytesReceived = 0;
            let stats;

            function statForEach(stat) {
                /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesSent'] && (bytesSent = bytesSent + stat['bytesSent']);
                /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesReceived'] && (bytesReceived = bytesReceived + stat['bytesReceived']);
            }

            that.subscirptionGlobal && (stats = await that.subscirptionGlobal.getStats());
            stats && stats.forEach(statForEach) && (stats = null);
            that.publicationGlobal && (stats = await that.publicationGlobal.getStats());
            stats && stats.forEach(statForEach) && (stats = null);
            that.publicationGlobal2 && (stats = await that.publicationGlobal2.getStats());
            stats && stats.forEach(statForEach) && (stats = null);
            that.publicationScreenGlobal && (stats = await that.publicationScreenGlobal.getStats());
            stats && stats.forEach(statForEach) && (stats = null);

            if (that.bytesReceivedGlobal && bytesReceived > that.bytesReceivedGlobal) {
                that.statDownload = Math.round((bytesReceived - that.bytesReceivedGlobal) / 1024);
            }
            if (that.bytesSentGlobal && bytesSent > that.bytesSentGlobal) {
                that.statUpload = Math.round((bytesSent - that.bytesSentGlobal) / 1024);
            }
            that.bytesReceivedGlobal = bytesReceived;
            that.bytesSentGlobal = bytesSent;
        },
        clickSpeak:function(e){
            this.IsSpeakMuted = !this.IsSpeakMuted;
        },
        clickMicphone:function(e){

        },
        clickCamera:function(e){

        },
        clickCamera2:function(e){

        },
        clickDesktop:function(e){

        },
        clickRecord:function(e){

        },
        exitRoom:function(e){
            const that = this;
            that.publicationGlobal && that.publicationGlobal.stop(),that.publicationGlobal = null;
            that.subscirptionGlobal && that.subscirptionGlobal.stop(),that.subscirptionGlobal = null;
            that.publicationScreenGlobal && that.publicationScreenGlobal.stop(),that.publicationScreenGlobal = null;
            that.mixStreamGlobal && that.mixStreamGlobal.mediaStream && that.destroyMediaStream(that.mixStreamGlobal.mediaStream),(that.mixStreamGlobal = null);
            that.conference && that.conference.leave(),that.conference = null;
            that.playerStream = null;
        },
        destroyMediaStream:function(mediaStream)
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
    },
    mounted:function(){
        this.init();
    }
});

window.onbeforeunload = _app.exitRoom.bind(_app);