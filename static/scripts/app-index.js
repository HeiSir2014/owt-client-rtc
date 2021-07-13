const { ipcRenderer, desktopCapturer } = require('electron');

Vue.directive('focus', {
    update: function (el, { oldValue, value }) {
        oldValue != value && value && el.focus();
    }
});

const _app = new Vue({
    el: '#App',
    data: function () {
        return {
            version: '',
            isMaximized: false,
            playerStream: null,
            myRoom: '',
            statUpload: 0,
            statDownload: 0,
            playerStream: null,
            isSpeakMuted: false,
            isMicMuted: false,
            isCameraMuted: false,
            isCamera2Muted: false,
            isDesktopShared: false,
            isRecordStarted: false,
            usedMicrophone: '',
            usedCamera: '',
            usedCamera2: '',
            usedCamera2DeviceId: '',
            layoutIndex: 0,
            msg_input_visible: false,
            msg_content: '',
            emoji_visible: false,
            emoji_data: ['emoji_5', 'emoji_6', 'emoji_7', 'emoji_4', 'emoji_0', 'emoji_1', 'emoji_2', 'emoji_3'],
            screen_data: [],
            screen_select_visible: false,
            lastMoveTime: 0,
            hideCursorIntervalHandle: null,
            tools_visible: true,
            tools_hover: false,
            participants: [],
            remoteStreams: [],
            screenSharingUser: '',
            localStream:null,
            localStreamSecond:null,
            selectStreamId:'', 

        }
    },
    methods: {
        init: function (e) {
            const that = this;

            ipcRenderer.on('maximizeChanged', that.maximizeChanged.bind(that));
            ipcRenderer.on('set-version', that._setVersion.bind(that));
            window.addEventListener('keyup', that.onkeyup.bind(that));
            window.addEventListener('mousemove', that.onmousemove.bind(that));

            that.myRoom = getParameterByName('room');
            that.myUserId = getParameterByName('userId');
            that.myUserNick = getParameterByName('userNick');
            that.enableAudio = getParameterByName('enableAudio');
            that.enableVideo = getParameterByName('enableVideo');

            that.enableAudio = ((!that.enableAudio || that.enableAudio == 'true') ? true : false);
            that.enableVideo = ((!that.enableVideo || that.enableVideo == 'true') ? true : false);

            that.isMicMuted = true;
            that.isCameraMuted = true;
            that.isCamera2Muted = true;
            that.isDesktopShared = false;
            that.isRecordStarted = false;

            that.checkDevices();

            createToken(that.myRoom, that.myUserId, 'presenter', function (response) {
                var token = response;
                if (!token) {
                    console.error('token is empty');
                    return;
                }
                that.conference = new Owt.Conference.ConferenceClient();
                that.conference.join(token).then(resp => {
                    that.myId = resp.self.id;
                    that.myRoomId = resp.id;

                    that.participants = resp.participants;

                    that.participants.forEach(p => {
                        p.addEventListener('left', that.participantleft.bind(that, p));
                    });
                    that.remoteStreams = resp.remoteStreams.filter(r => r.source && r.source.video && r.source.video != 'mixed');

                    that.subscribeMixStream();
                }, function (err) {
                    console.error('server connection failed:', err);
                    if (err.message.indexOf('connect_error:') >= 0) {
                        const div = $('<div>网络错误</div>');
                        div.appendTo($p);
                        $p.appendTo($('body'));
                    }
                });

                that.conference.addEventListener('participantjoined', that.participantjoined.bind(that));
                that.conference.addEventListener('streamadded', that.streamAdded.bind(that));
                that.conference.addEventListener('messagereceived', that.messagereceived.bind(that));
                that.conference.addEventListener('serverdisconnected', that.serverdisconnected.bind(that));

                that.statInterval && (clearInterval(statInterval), that.statInterval = 0);
                that.statInterval = setInterval(that._getStat.bind(that), 1000);
                that.onmousemove();
            });

        },
        _setVersion:function(event , version){
            this.version = version;
        },
        onkeyup: function (e) {
            e.keyCode == 27 && this.isMaximized && ipcRenderer.send('setFullScreen-win', false);
            return e.keyCode != 27;
        },
        onmousemove: function (e) {
            if (this.hideCursorIntervalHandle == null) {
                document.body.style.cursor = "default";
                this.tools_visible = true;
                this.hideCursorIntervalHandle = setInterval(this.hideCursorInterval.bind(this), 1000);
            }
            this.lastMoveTime = Date.now();
            return true;
        },
        hideCursorInterval: function () {
            if (!this.tools_hover && this.lastMoveTime && Date.now() - (this.isFullViewer ? 5000 : 2000) > this.lastMoveTime) {

                clearInterval(this.hideCursorIntervalHandle), this.hideCursorIntervalHandle = null;
                document.body.style.cursor = "none";
                this.tools_visible = false;
            }
        },
        msg_input_keyup: function (e) {
            e.keyCode == 13 && this.msg_content && (this._sendMsg('msg_text', this.msg_content), this.msg_content = '');
            return e.keyCode != 13;
        },
        _sendMsg: function (type, content) {
            if (!this.conference) return;
            let msg = { type: type, content: content };
            this.conference.send(msg);
            this.showMessage(this.myUserId, msg);
        },
        sendEmojiMsg: function (e) {
            this._sendMsg('msg_emoji', e.target.parentElement.getAttribute('data'));
            this.emoji_visible = false;
        },
        maximizeChanged: function (event, isMaximized) {
            this.isMaximized = isMaximized;
            if (this.isMaximized) {
                this.$message({
                    message: '按下 ESC 键可以退出全屏',
                    center: true,
                    iconClass: '',
                    customClass: 'message_tip',
                    duration: 3000,
                    offset: (document.body.clientHeight / 2) - 24
                });
            }
        },
        fullscreen: function (e) {
            ipcRenderer.send('setFullScreen-win', true);
        },
        unFullscreen: function (e) {
            ipcRenderer.send('setFullScreen-win', false);
        },
        close: function (e) {
            this._exitRoom();
            ipcRenderer.send("close-win");
        },
        minimize: function (e) {
            ipcRenderer.send("minimize-win");
        },
        subscribeMixStream:async function(){
            const that = this;
            (that.enableAudio || that.enableVideo) && that.publishVideo();

            var streams = that.conference.info.remoteStreams;
            console.log(streams);
            for (const stream of streams) {
                if ((stream.source.audio === 'mixed' || stream.source.video ===
                    'mixed') && stream.id.indexOf('-common') != -1) {
                    that.subscribeStream(stream, (subscribe) => {
                        console.log('subscribeStream result');
                        that.subscriptionGlobal = subscribe;
                        that.subscriptionGlobal && (that.playerStream = stream.mediaStream, that.mixStreamGlobal = stream);
                        that.subscriptionGlobal.addEventListener('error',(e)=>{
                            console.log("subscriptionGlobal error",e);
                            
                        });
                        streams.filter((s)=>s.source.video == 'screen-cast').length > 0 && that.switchVideoParam(true);
                        that.subscriptionGlobal.addEventListener('ended',(e)=>{
                            console.log("subscriptionGlobal ended",e);
                            setTimeout(that.subscribeMixStream.bind(that),5000);
                        });
                    },()=>{
                        setTimeout(that.subscribeMixStream.bind(that),5000);
                    });
                    console.log('subscribeStream finish');
                }
                that.streamAdded({ stream });
            }
        },
        subscribeStream: async function (stream, callback,reject) {
            const that = this;
            if (!that.conference) return;
            try {
                let resolution = stream.settings.video[0].resolution;
                if(stream.source.video != 'screen-cast')
                {
                    stream.settings.video.forEach(v => {
                        v.resolution.width == 1280 && v.resolution.height == 720 && (resolution = v.resolution);
                    });
    
                    resolution.width != 1280 && stream.extraCapabilities.video.resolutions.forEach(r => {
                        r.width == 1280 && (resolution = r);
                    });
    
                    console.log(resolution,stream.settings.video)
                }
                await that.conference.subscribe(stream, {
                    audio: stream.source.audio ? true : false,
                    video: {
                        codec: { name: "h264", profile: "CB" },
                        resolution: resolution,
                    }
                }).then(callback, (err) => {
                    console.log('subscribe failed', err);
                    reject && reject();
                });
            } catch (error) {
                console.log('subscribe failed', error);
                reject && reject();
            }
            return;
        },
        convertSource: function (streamSource) {
            const dict = { camera: "摄像头", "screen-cast": "桌面" };
            if (streamSource in dict) return dict[streamSource];
            return '视频';
        },
        convertSource2: function (remoteStream) {
            return this.getStreamUserId(remoteStream)+"的"+this.convertSource(remoteStream.source.video);
        },
        getUserIdFromOrigin: function (origin) {
            const p = this.participants.find(p => p.id == origin);
            if (!p) return '';
            const userId = this.participants.find(p => p.id == origin).userId;
            return userId == this.myId ? userId + '(我)' : userId;
        },
        getStreamUserId: function (remoteStream) {
            if (!remoteStream) return ''
            return this.getUserIdFromOrigin(remoteStream.origin);
        },
        participantjoined: function (e) {
            if (/robot/.test(e.participant.userId)) return;
            console.log('participantjoined', e);

            e.participant.addEventListener('left', this.participantleft.bind(this, e.participant))

            this.participants = this.conference.info.participants.filter(p => !/robot/.test(p.userId));
            console.log(this.conference.info);
            var audio = new Audio('audio/some_one_join_room.wav'); // path to file
            audio.play();
            audio = null;
            this.showMessage(null, { type: 'msg_text', content: `<div class=content>成员 <div class=nick>${e.participant.userId}</div> 加入频道</div>` });
        },
        participantleft: function (participant, e) {
            console.log('participantleft', e);

            this.participants = this.conference.info.participants.filter(p => !/robot/.test(p.userId));
            var audio = new Audio('audio/some_one_join_room.wav'); // path to file
            audio.play();
            audio = null;
            this.showMessage(null, { type: 'msg_text', content: `<div class=content>成员 <div class=nick>${participant.userId}</div> 离开频道</div>` });
        },
        messagereceived: function (e) {

            console.log(e);
            if (e.origin == this.myId) return;
            if (e.message.type == 'msg_text' || e.message.type == 'msg_emoji') {
                this.showMessage(this.getUserIdFromOrigin(e.origin), e.message);
            }
        },
        showMessage: function (userId, message) {
            const duration = 8888;
            const offset = 94;
            const spacing = 2;
            message.type == 'msg_text' && this.$notify({
                customClass: 'notify_msg',
                message: `${userId ? ('<div class=nick>' + userId + '</div>') : ''} <div class=content>${message.content}</div>`,
                position: 'bottom-left',
                duration: duration,
                dangerouslyUseHTMLString: true,
                showClose: false,
                offset: offset,
                spacing: spacing,
                insertHead: true
            });
            message.type == 'msg_emoji' && this.$notify({
                customClass: 'notify_msg emoji',
                message: `${userId ? ('<div class=nick>' + userId + '</div>') : ''} <img src="imgs/emoji/${message.content}.png" width="28" height="28" />`,
                position: 'bottom-left',
                duration: duration,
                dangerouslyUseHTMLString: true,
                showClose: false,
                offset: offset,
                spacing: spacing,
                insertHead: true
            });
            message.type == 'msg_html' && this.$notify({
                customClass: 'notify_msg emoji',
                message: `${userId ? ('<div class=nick>' + userId + '</div>') : ''} ${message.content}`,
                position: 'bottom-left',
                duration: duration,
                dangerouslyUseHTMLString: true,
                showClose: false,
                offset: offset,
                spacing: spacing,
                insertHead: true
            });
        },
        serverdisconnected: function (e) {
            console.log('serverdisconnected', e)
            this._exitRoom();
        },
        streamAdded: function (e) {
            const that = this;
            const stream = e.stream;
            console.log('A new stream is added ', stream.id);
            if (!that.conference) return;
            that.remoteStreams = that.conference.info.remoteStreams.filter(r => r.source && r.source.video && r.source.video != 'mixed');
            if (stream.origin !== that.myId && stream.source
                && stream.source.video
                && stream.source.video == 'screen-cast') {
                that.screenSharingUser = that.getStreamUserId(stream);
                // that.subscribeStream(stream, (subscription) => {
                //     that.showScreenStream(stream, subscription);
                // });
                that.switchVideoParam(true);
            }
            stream.addEventListener('ended', that.streamEnded.bind(that, stream));
        },
        streamEnded: function (stream) {
            console.log(stream.id + ' is ended.');
            const that = this;
            if (!that.conference) return;
            stream.source && stream.source.video == 'screen-cast' && (that.screenSharingUser = '',that.subscriptionGlobal && that.subscriptionGlobal.applyOptions({video:{frameRate:24}}))
            that.remoteStreams = that.conference.info.remoteStreams.filter(r => r.source && r.source.video && r.source.video != 'mixed');
        },
        switchVideoParam:function(isScreenShared, bitrateMultiplier){
            
            const that = this;
            const frameRateOrigin = that.mixStreamGlobal ? that.mixStreamGlobal.settings.video[0].frameRate:24;
            that.mixStreamGlobal && that.subscriptionGlobal && that.subscriptionGlobal.applyOptions({
                video:{
                    frameRate:isScreenShared?6:frameRateOrigin,
                    bitrateMultiplier:0.9,
                    resolution:isScreenShared?{width:1920,height:1080}:{width:1280,height:720}
                }})
        },
        checkDevices: async function () {
            const that = this;
            let videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
            let audioConstraints = [new Owt.Base.AudioTrackConstraints(Owt.Base.AudioSourceInfo.MIC), false];
            let resolutions = [{ width: 1280, height: 720 },{ width: 720, height: 1280 },undefined, false];
            let mediaStream;
            for (const audioConstraint of audioConstraints) {
                for (const resolution of resolutions) {
                    try {
                        if (resolution === false) {
                            videoConstraints = false;
                        }
                        else {
                            videoConstraints.resolution = resolution;
                            if (resolution == undefined) videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
                        }
                        mediaStream = await Owt.Base.MediaStreamFactory.createMediaStream(new Owt.Base.StreamConstraints(
                            audioConstraint, videoConstraints));
                        break;
                    } catch (error) {
                        mediaStream = null;
                        console.error(error);
                    }
                }
                if (mediaStream) break;
            }
            if (!mediaStream) return;
            let vT = mediaStream.getVideoTracks();
            let aT = mediaStream.getAudioTracks();
            let videoTrack, audioTrack;
            vT && vT.length && (videoTrack = vT[0]) &&
                (that.usedCamera = videoTrack.label.replace(/ ?\([\w:]{9}\)/, ''))
            aT && aT.length && (audioTrack = aT[0]) &&
                (that.usedMicrophone = audioTrack.label.replace(/ ?\([\w:]{9}\)/, ''))

            try {
                let devices = await navigator.mediaDevices.enumerateDevices();
                let vDevices = devices.filter(d => d.kind && d.kind == 'videoinput');
                if (vDevices.length >= 2 && videoTrack) {
                    vDevices = vDevices.filter(d => d.label != videoTrack.label);
                    vDevices && vDevices.length && (that.usedCamera2 = vDevices[0].label.replace(/ ?\([\w:]{9}\)/, ''), that.usedCamera2DeviceId = vDevices[0].deviceId)
                }
                else {
                    that.usedCamera2 = '';
                    that.usedCamera2DeviceId = '';
                }
            } catch (error) {
                console.error(error);
            }
            that._destroyMediaStream(mediaStream);
            mediaStream = null;
        },
        publishVideo: async function () {
            const that = this;
            let audioConstraints = [new Owt.Base.AudioTrackConstraints(Owt.Base.AudioSourceInfo.MIC), false];
            let facingModes = [{exact:"user"},undefined];
            let resolutions = [{ width: 1280, height: 720 }, { width: 640, height: 360 }, undefined, false];
            screen && screen.orientation && screen.orientation.type && screen.orientation.type.indexOf('landscape') == -1 &&
            resolutions.unshift({ width: 720, height: 1280 },{ width: 360, height: 640 });
            (!screen || !screen.orientation ) && document.body.clientWidth < document.body.clientHeight && 
             resolutions.unshift({ width: 720, height: 1280 },{ width: 360, height: 640 });
            let mediaStream;
            for (const audioConstraint of audioConstraints) {

                for(const facingMode of facingModes){
                    
                    for (const resolution of resolutions) {
                        try {
                            let videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
                            facingMode && (videoConstraints.facingMode = facingMode);
                            
                            if (resolution === false) {
                                videoConstraints = false;
                            }
                            else {
                                videoConstraints.resolution = resolution;
                                if (resolution == undefined) videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
                            }
                            mediaStream = await Owt.Base.MediaStreamFactory.createMediaStream(new Owt.Base.StreamConstraints(
                                audioConstraint, videoConstraints));
                            break;
                        } catch (error) {
                            mediaStream = null;
                            console.error(error);
                        }
                    }
                    if (mediaStream) break;
                }
                if (mediaStream) break;
            }
            if (!mediaStream) return;
            let vT = mediaStream.getVideoTracks();
            let aT = mediaStream.getAudioTracks();
            let videoTrack, audioTrack;
            vT && vT.length && (videoTrack = vT[0]) &&
                (that.usedCamera = videoTrack.label.replace(/ ?\([\w:]{9}\)/, ''))
            aT && aT.length && (audioTrack = aT[0]) &&
                (that.usedMicrophone = audioTrack.label.replace(/ ?\([\w:]{9}\)/, ''))

            let devices = await navigator.mediaDevices.enumerateDevices();
            let vDevices = devices.filter(d => d.kind && d.kind == 'videoinput');
            if (vDevices.length >= 2 && videoTrack) {
                vDevices = vDevices.filter(d => d.label != videoTrack.label);
                vDevices && vDevices.length && (that.usedCamera2 = vDevices[0].label.replace(/ ?\([\w:]{9}\)/, ''), that.usedCamera2DeviceId = vDevices[0].deviceId)
            }
            else {
                that.usedCamera2 = '';
                that.usedCamera2DeviceId = '';
            }

            audioTrack && (audioTrack.enabled = that.enableAudio);
            videoTrack && (videoTrack.enabled = that.enableVideo);
            try{
                await videoTrack.applyConstraints({frameRate:{max:15}})
            }
            catch(err){
                console.log("applyConstraints")
                console.erroe(err)
            }
            that.isCameraMuted = videoTrack ? !videoTrack.enabled : true;
            that.isMicMuted = audioTrack ? !audioTrack.enabled : true;

            that.localStream = new Owt.Base.LocalStream(mediaStream, new Owt.Base.StreamSourceInfo('mic', 'camera'));
            try {
                that.publicationGlobal = await that.conference.publish(that.localStream, { video: [{ codec: { name: 'h264', profile: 'CB' }, maxBitrate: 1024 }] });
            } catch (error) {
                that.publicationGlobal = null;
                console.error(error);
                that._clearLocalCamera();
            }
            if (!that.publicationGlobal)
                return;
            mixStream(that.myRoomId, that.publicationGlobal.id, ['common']);
            that.publicationGlobal.addEventListener('error', that._clearLocalCamera.bind(that));
            that.publicationGlobal.addEventListener('ended', that._clearLocalCamera.bind(that));
        },
        publishVideoSecond: async function () {
            const that = this;
            let videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
            let resolutions = [{ width: 1280, height: 720 }, { width: 1280, height: 720 }, { width: 640, height: 360 }, undefined];
            screen && screen.orientation && screen.orientation.type && screen.orientation.type.indexOf('landscape') == -1 &&
             resolutions.unshift({ width: 720, height: 1280 },{ width: 360, height: 640 });
            
            let mediaStream;
            videoConstraints.deviceId = that.usedCamera2DeviceId;
            for (const resolution of resolutions) {
                try {
                    videoConstraints.resolution = resolution;
                    if(resolution == undefined) videoConstraints = new Owt.Base.VideoTrackConstraints(Owt.Base.VideoSourceInfo.CAMERA);
                    
                    mediaStream = await Owt.Base.MediaStreamFactory.createMediaStream(new Owt.Base.StreamConstraints(
                        false, videoConstraints));
                    break;
                } catch (error) {
                    mediaStream = null;
                    console.error(error);
                }
            }
            if (!mediaStream) return;
            
            let vT = mediaStream.getVideoTracks();
            let videoTrack;
            vT && vT.length && (videoTrack =vT[0] )
            try{
                await videoTrack.applyConstraints({frameRate:{exact:15,ideal:15}})
            }
            catch(err){
                console.log("applyConstraints")
                console.erroe(err)
            }

            that.localStreamSecond = new Owt.Base.LocalStream(mediaStream, new Owt.Base.StreamSourceInfo('mic', 'camera'));
            try {
                that.publicationGlobalSecond = await that.conference.publish(that.localStreamSecond, { video: [{ codec: { name: 'h264', profile: 'CB' }, maxBitrate: 1024 }], audio: false });
                that.isCamera2Muted = false;
            } catch (error) {
                that.publicationGlobalSecond = null;
                console.error(error);
                that._clearLocalCameraSecond();
            }
            if (!that.publicationGlobalSecond)
                return;
            mixStream(that.myRoomId, that.publicationGlobalSecond.id, ['common']);
            that.publicationGlobalSecond.addEventListener('error', that._clearLocalCameraSecond.bind(that));
            that.publicationGlobalSecond.addEventListener('ended', that._clearLocalCameraSecond.bind(that));
        },
        _clearLocalCamera: function () {
            const that = this;
            that.localStream && that.localStream.mediaStream && that._destroyMediaStream(that.localStream.mediaStream), (that.localStream = null);

            that.isCameraMuted = that.isMicMuted = true;
        },
        _clearLocalCameraSecond: function () {
            const that = this;
            that.localStreamSecond && that.localStreamSecond.mediaStream && that._destroyMediaStream(that.localStreamSecond.mediaStream), (that.localStreamSecond = null);

            that.isCamera2Muted = true;
        },
        _startShareScreen: async function (id) {
            const that = this;
            let mediaStream;
            try{
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: {
                        mandatory: {
                            chromeMediaSource: 'screen',
                            chromeMediaSourceId: id,
                            maxWidth: 1920
                        }
                    }
                });
            }
            catch(err){
                console.log("applyConstraints")
                console.error(err)
                return;
            }

            let vT = mediaStream.getVideoTracks();
            let videoTrack;
            vT && vT.length && (videoTrack =vT[0] )
            try{
                await videoTrack.applyConstraints({frameRate:{max:5}})
            }
            catch(err){
                console.log("applyConstraints")
                console.erroe(err)
            }

            that.screen_select_visible = false;

            let publishOption = { video: [{ codec: { name: 'h264', profile: 'CB' }, maxBitrate: 2500 }] };
            that.ScreenStream = new Owt.Base.LocalStream(mediaStream, new Owt.Base.StreamSourceInfo('screen-cast', 'screen-cast'));
            that.conference.publish(that.ScreenStream, publishOption).then(publication => {
                that.publicationScreenGlobal = publication;

                that.screenSharingUser = "我";
                that.isDesktopShared = true;

                mixStream(that.myRoomId, publication.id, ['common'],()=>{
                    
                    const remoteStreams = this.conference.info.remoteStreams.filter(r => r.source && r.source.video && r.source.video == 'mixed');
                    remoteStreams.forEach(remoteStream => {
                        activeLayoutStream(that.myRoomId, remoteStream.id, publication.id);
                    })
                });
                publication.addEventListener('error', that._clearScreenShare.bind(that));
                publication.addEventListener('ended', that._clearScreenShare.bind(that));

                that.switchVideoParam(true);
                // that.showScreenStream(that.ScreenStream);

            }, err => {
                that._clearScreenShare();
            })
        },
        startShareScreen: function (e) {
            this._startShareScreen(e.target.getAttribute('data'));
        },
        showScreenStream: function (stream, subscription) {
            if (!stream.mediaStream) return;
            const that = this;
            const { webContentsId } = ipcRenderer.sendSync('create-video-windows');
            ipcRenderer.on('win-onload', this._onLoadWindow.bind(this, webContentsId, stream, subscription));
        },
        _onLoadWindow: async function (webContentsId, stream, subscription, e) {
            if (e.senderId != webContentsId) return;
            const pc = new RTCPeerConnection();
            stream.mediaStream.getTracks().forEach(track => pc.addTransceiver(track, { streams: [stream.mediaStream], direction: 'sendonly' }));
            stream.addEventListener('ended', this.showStreamEnded.bind(this, pc, webContentsId, subscription));
            pc.onicecandidate = function ({ candidate }) {
                candidate && ipcRenderer.sendTo(webContentsId, 'set-peer-param', { candidate: candidate.toJSON() });
            }
            pc.onnegotiationneeded = async () => {
                await pc.setLocalDescription();
                ipcRenderer.sendTo(webContentsId, 'set-peer-param', { localDescription: pc.localDescription.toJSON() });
            }
            ipcRenderer.on('set-peer-param', this._setPeerParam.bind(this, pc, webContentsId, subscription));
        },
        _setPeerParam: async function (peerConnection, webContentsId, subscription, e, { localDescription, candidate, close }) {
            if (e.senderId != webContentsId) return;
            peerConnection && localDescription && await peerConnection.setRemoteDescription(localDescription);
            peerConnection && candidate && await peerConnection.addIceCandidate(candidate);
            close && subscription && subscription.stop();
        },
        showStreamEnded: function (pc, webContentsId, subscription) {
            try {
                console.log("showStreamEnded", pc);
                pc && pc.close();
            } catch (error) {

            }
            try {
                subscription && subscription.stop();
            } catch (error) {

            }
            ipcRenderer.sendTo(webContentsId, 'stream_ended');
        },
        _clearScreenShare: function () {
            const that = this;
            that.ScreenStream && that.ScreenStream.mediaStream && (that.ScreenStream.dispatchEvent({ type: 'ended' }), that._destroyMediaStream(that.ScreenStream.mediaStream)), (that.ScreenStream = null);
            try {
                that.publicationScreenGlobal && that.publicationScreenGlobal.stop();
            } catch (error) {
                console.error(error)
            }
            finally {
                that.publicationScreenGlobal = null;
            }
            that.screenSharingUser = '';
            that.isDesktopShared = false;
            that.parentWebContentsId >= 0 && ipcRenderer.sendTo(that.parentWebContentsId, 'message', { isDesktopShared: false });
            that.switchVideoParam(false);
        },
        _getStat: async function () {
            const that = this;
            let bytesSent = 0;
            let bytesReceived = 0;
            let stats;

            function statForEach(stat) {
                /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesSent'] && (bytesSent = bytesSent + stat['bytesSent']);
                /^RTCIceCandidatePair/.test(stat['id']) && stat['bytesReceived'] && (bytesReceived = bytesReceived + stat['bytesReceived']);
            }

            that.subscriptionGlobal && (stats = await that.subscriptionGlobal.getStats());
            stats && (stats.forEach(statForEach),stats = null);
            that.publicationGlobal && (stats = await that.publicationGlobal.getStats());
            stats && (stats.forEach(statForEach),stats = null);
            that.publicationGlobalSecond && (stats = await that.publicationGlobalSecond.getStats());
            stats && (stats.forEach(statForEach),stats = null);
            that.publicationScreenGlobal && (stats = await that.publicationScreenGlobal.getStats());
            stats && (stats.forEach(statForEach),stats = null);

            if (that.bytesReceivedGlobal && bytesReceived > that.bytesReceivedGlobal) {
                that.statDownload = Math.round((bytesReceived - that.bytesReceivedGlobal) / 1024);
            }
            if (that.bytesSentGlobal && bytesSent > that.bytesSentGlobal) {
                that.statUpload = Math.round((bytesSent - that.bytesSentGlobal) / 1024);
            }
            that.bytesReceivedGlobal = bytesReceived;
            that.bytesSentGlobal = bytesSent;
        },
        selectStreamChange: function(){
            if(!this.selectStreamId) return;
            this.clickChangeLayout(`activeLayout-${this.selectStreamId}`);
        },
        clickChangeLayout: function (e) {
            const that = this;
            console.log(e);
            if (e.indexOf('activeLayout') == 0)
            {
                const subStream = e.substr('activeLayout-'.length);
                const remoteStreams = this.conference.info.remoteStreams.filter(r => r.source && r.source.video && r.source.video == 'mixed');
                remoteStreams.forEach(remoteStream => {
                    activeLayoutStream(that.myRoomId, remoteStream.id, subStream);
                })
                return;
            }
            if (e.indexOf('switchLayout') != 0) return;
            if (!this.subscriptionGlobal) return;
            const layouts = [
                [{"region":[{"id":"1","area":{"height":"1","width":"1","top":"0","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1","width":"1","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"214/1080","width":"386/1920","top":"8/10","left":"8/10"},"shape":"rectangle"},{"id":"3","area":{"height":"214/1080","width":"386/1920","top":"6/10","left":"8/10"},"shape":"rectangle"},{"id":"4","area":{"height":"214/1080","width":"386/1920","top":"4/10","left":"8/10"},"shape":"rectangle"},{"id":"5","area":{"height":"214/1080","width":"386/1920","top":"2/10","left":"8/10"},"shape":"rectangle"},{"id":"6","area":{"height":"214/1080","width":"386/1920","top":"0","left":"8/10"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"8/10","width":"8/10","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"214/1080","width":"386/1920","top":"8/10","left":"8/10"},"shape":"rectangle"},{"id":"3","area":{"height":"214/1080","width":"386/1920","top":"6/10","left":"8/10"},"shape":"rectangle"},{"id":"4","area":{"height":"214/1080","width":"386/1920","top":"4/10","left":"8/10"},"shape":"rectangle"},{"id":"5","area":{"height":"214/1080","width":"386/1920","top":"2/10","left":"8/10"},"shape":"rectangle"},{"id":"6","area":{"height":"214/1080","width":"386/1920","top":"0","left":"8/10"},"shape":"rectangle"},{"id":"7","area":{"height":"214/1080","width":"386/1920","top":"8/10","left":"6/10"},"shape":"rectangle"},{"id":"8","area":{"height":"214/1080","width":"386/1920","top":"8/10","left":"4/10"},"shape":"rectangle"},{"id":"9","area":{"height":"214/1080","width":"386/1920","top":"8/10","left":"2/10"},"shape":"rectangle"},{"id":"10","area":{"height":"214/1080","width":"386/1920","top":"8/10","left":"0"},"shape":"rectangle"}]}],
                [{ "region": [{ "id": "1", "area": { "height": "1", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "1", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "959/1920", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "539/1080", "width": "959/1920", "top": "541/1080", "left": "961/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "538/1080", "width": "959/1920", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "539/1080", "width": "959/1920", "top": "541/1080", "left": "961/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "538/1080", "width": "639/1920", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "539/1080", "width": "639/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "638/1920", "top": "0", "left": "641/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "539/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "539/1080", "width": "638/1920", "top": "541/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "359/1080", "width": "638/1920", "top": "0", "left": "641/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "0" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "358/1080", "width": "638/1920", "top": "361/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "7", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "0" }, "shape": "rectangle" }, { "id": "8", "area": { "height": "359/1080", "width": "638/1920", "top": "721/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "9", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "1281/1920" }, "shape": "rectangle" }] }],
                [{"region":[{"id":"1","area":{"height":"1","width":"1","top":"0","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"971/1080","width":"1","top":"109/1080","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"108/1080","width":"190/1920","top":"0","left":"864/1920"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"971/1080","width":"1","top":"109/1080","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"108/1080","width":"190/1920","top":"0","left":"767/1920"},"shape":"rectangle"},{"id":"3","area":{"height":"108/1080","width":"190/1920","top":"0","left":"961/1920"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"971/1080","width":"1","top":"109/1080","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"108/1080","width":"190/1920","top":"0","left":"864/1920"},"shape":"rectangle"},{"id":"3","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1057/1920"},"shape":"rectangle"},{"id":"4","area":{"height":"108/1080","width":"190/1920","top":"0","left":"671/1920"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"971/1080","width":"1","top":"109/1080","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"108/1080","width":"190/1920","top":"0","left":"767/1920"},"shape":"rectangle"},{"id":"3","area":{"height":"108/1080","width":"190/1920","top":"0","left":"961/1920"},"shape":"rectangle"},{"id":"4","area":{"height":"108/1080","width":"190/1920","top":"0","left":"576/1920"},"shape":"rectangle"},{"id":"5","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1154/1920"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"971/1080","width":"1","top":"109/1080","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"108/1080","width":"190/1920","top":"0","left":"864/1920"},"shape":"rectangle"},{"id":"3","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1057/1920"},"shape":"rectangle"},{"id":"4","area":{"height":"108/1080","width":"190/1920","top":"0","left":"671/1920"},"shape":"rectangle"},{"id":"5","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1250/1920"},"shape":"rectangle"},{"id":"6","area":{"height":"108/1080","width":"190/1920","top":"0","left":"478/1920"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"971/1080","width":"1","top":"109/1080","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"108/1080","width":"190/1920","top":"0","left":"767/1920"},"shape":"rectangle"},{"id":"3","area":{"height":"108/1080","width":"190/1920","top":"0","left":"961/1920"},"shape":"rectangle"},{"id":"4","area":{"height":"108/1080","width":"190/1920","top":"0","left":"576/1920"},"shape":"rectangle"},{"id":"5","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1154/1920"},"shape":"rectangle"},{"id":"6","area":{"height":"108/1080","width":"190/1920","top":"0","left":"383/1920"},"shape":"rectangle"},{"id":"7","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1347/1920"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"971/1080","width":"1","top":"109/1080","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"108/1080","width":"190/1920","top":"0","left":"864/1920"},"shape":"rectangle"},{"id":"3","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1057/1920"},"shape":"rectangle"},{"id":"4","area":{"height":"108/1080","width":"190/1920","top":"0","left":"671/1920"},"shape":"rectangle"},{"id":"5","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1250/1920"},"shape":"rectangle"},{"id":"6","area":{"height":"108/1080","width":"190/1920","top":"0","left":"478/1920"},"shape":"rectangle"},{"id":"7","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1443/1920"},"shape":"rectangle"},{"id":"8","area":{"height":"108/1080","width":"190/1920","top":"0","left":"285/1920"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"971/1080","width":"1","top":"109/1080","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"108/1080","width":"190/1920","top":"0","left":"767/1920"},"shape":"rectangle"},{"id":"3","area":{"height":"108/1080","width":"190/1920","top":"0","left":"961/1920"},"shape":"rectangle"},{"id":"4","area":{"height":"108/1080","width":"190/1920","top":"0","left":"576/1920"},"shape":"rectangle"},{"id":"5","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1154/1920"},"shape":"rectangle"},{"id":"6","area":{"height":"108/1080","width":"190/1920","top":"0","left":"383/1920"},"shape":"rectangle"},{"id":"7","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1347/1920"},"shape":"rectangle"},{"id":"8","area":{"height":"108/1080","width":"190/1920","top":"0","left":"190/1920"},"shape":"rectangle"},{"id":"9","area":{"height":"108/1080","width":"190/1920","top":"0","left":"1540/1920"},"shape":"rectangle"}]}],
                [{"region":[{"id":"1","area":{"height":"1","width":"1","top":"0","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1","width":"1","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"3","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"4","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"5","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"6","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"7","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"8","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"9","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"10","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"11","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"12","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"13","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"14","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"15","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"16","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"}]}],
            ];
            this.layoutIndex = Number.parseInt(e.substr(-1,1));

            let values = [];
            layouts[this.layoutIndex].forEach(__ => {
                let regions = __["region"];
                let _ = [];
                regions.forEach(region => {
                    _.push({ region: region });
                }),values.push(_);
            });
            setLayoutStream(this.myRoomId, this.mixStreamGlobal.id, values);
        },
        clickSpeak: function (e) {
            this.isSpeakMuted = !this.isSpeakMuted;
        },
        clickMicrophone: function (e) {
            let tracks, track;
            if (!this.localStream || !this.localStream.mediaStream) {
                this.isMicMuted = true;
                this.enableAudio = true;
                this.enableVideo = false;
                this.publishVideo();
                return;
            }
            tracks = this.localStream.mediaStream.getAudioTracks();
            tracks && tracks.length && (track = tracks[0]);
            this.isMicMuted = track ? !this.isMicMuted : true;
            track && (track.enabled = !this.isMicMuted);
        },
        clickCamera: function (e) {
            let tracks, track;
            if (!this.localStream || !this.localStream.mediaStream) {
                this.isCameraMuted = true;
                this.enableAudio = false;
                this.enableVideo = true;
                this.publishVideo();
                return;
            }
            tracks = this.localStream.mediaStream.getVideoTracks();
            tracks && tracks.length && (track = tracks[0]);
            this.isCameraMuted = track ? !this.isCameraMuted : true;
            track && (track.enabled = !this.isCameraMuted);
        },
        clickCamera2: function (e) {
            if (!this.publicationGlobalSecond || !this.localStreamSecond || !this.localStreamSecond.mediaStream) {
                this.isCamera2Muted = true;
                this.publishVideoSecond();
                return;
            }
            this._clearLocalCameraSecond();
            this.publicationGlobalSecond && this.publicationGlobalSecond.stop(), this.publicationGlobalSecond = null;
            this.isCamera2Muted = true;
        },
        clickDesktop: function (e) {
            const that = this;
            if (that.publicationScreenGlobal) {
                that._clearScreenShare();
                return;
            }
            if (that.screenSharingUser != '') {
                that.$alert(`[${that.screenSharingUser}]`+'已经有人在分享桌面了，您当前不能再进行分享操作', '提示', { confirmButtonText: '确定' });
                return
            }
            that.screen_data = [];
            desktopCapturer.getSources({ types: ['screen'] }).then(sources => sources.forEach(source => that.screen_data.push({ id: source.id, src: source.thumbnail.toDataURL() })));
            that.screen_select_visible = true;
        },
        clickRecord: function (e) {

        },
        _exitRoom: function (e) {
            const that = this;
            try {
                that.publicationGlobal && that.publicationGlobal.stop(), that.publicationGlobal = null;
                that.publicationGlobalSecond && that.publicationGlobalSecond.stop(), that.publicationGlobalSecond = null;
                that.subscriptionGlobal && that.subscriptionGlobal.stop(), that.subscriptionGlobal = null;
                that.publicationScreenGlobal && that.publicationScreenGlobal.stop(), that.publicationScreenGlobal = null;
            } catch (_) { }

            try {
                that.conference && that.conference.leave(), that.conference = null;
            } catch (_) { }

            that.mixStreamGlobal && that.mixStreamGlobal.mediaStream && that._destroyMediaStream(that.mixStreamGlobal.mediaStream), (that.mixStreamGlobal = null);
            that.ScreenStream && that.ScreenStream.mediaStream && that._destroyMediaStream(that.ScreenStream.mediaStream), (that.ScreenStream = null);
            that.localStream && that.localStream.mediaStream && that._destroyMediaStream(that.localStream.mediaStream), (that.localStream = null);
            that.conference = that.publicationGlobal = that.subscriptionGlobal = null;

            that.playerStream = null;
            that.statInterval && (clearInterval(that.statInterval), that.statInterval = 0);
        },
        _destroyMediaStream: function (mediaStream) {
            if (!mediaStream) return
            try {
                mediaStream.getTracks().forEach(t => { t.stop(); mediaStream.removeTrack(t); }), mediaStream = null;
            } catch (err) {
                console.error(err);
            }
            finally {
                mediaStream = null;
            }
        }
    },
    mounted: function () {
        this.init();
    }
});

window.onbeforeunload = _app._exitRoom.bind(_app);