'use strict';
const { ipcRenderer } = require('electron');

const _app = new Vue({
    el: '#App',
    data:function(){
        return {
            version:'',
            isMaximized:false,
            playerStream:null,
            isSpeakMuted:false,
            lastMoveTime: 0,
            hideCursorHandle:null,
            toolsIsVisible:true,
            toolsIsHover:false,
            mainWebContentsId: Number.parseInt(getParameterByName('id'))
        }
    },
    methods:{
        init:function(e){
            const that = this;


            ipcRenderer.on('maximizeChanged',that.maximizeChanged.bind(that));
            ipcRenderer.on('set-version', that._setVersion.bind(that) );
            ipcRenderer.on('stream_ended', that.clickClose.bind(that) );
            window.addEventListener('keyup', that.onkeyup.bind(that));
            window.addEventListener('mousemove', that.onmousemove.bind(that));

            const pc = new RTCPeerConnection();
            ipcRenderer.on('set-peer-param',that._setPeerParam.bind(that , pc));
            pc.onicecandidate = function( { candidate } ) {
                console.log('onicecandidate')
                candidate && ipcRenderer.sendTo(that.mainWebContentsId,'set-peer-param',{ candidate:candidate.toJSON() });
            }
        
            pc.ontrack = function(e) {
                console.log(e);
                
                that.playerStream = null, (that.playerStream = e.streams[0],
                     that.playerStream.onremovetrack = that._removeTrack.bind(that) )
            }

            pc.onconnectionstatechange = () => {
                console.log('onconnectionstatechange');
                (pc.connectionState == 'closed'|| pc.connectionState == 'failed') && (pc.close(),that.clickClose());
            }

            ipcRenderer.sendTo(this.mainWebContentsId , 'win-onload' );
            this.lastMoveTime = Date.now();
            this.hideCursorHandle = setInterval(this.hideCursorInterval.bind(this), 2000);
        },
        _setVersion:function(event , version){
            this.version = version;
        },
        _setPeerParam:async function(peerConnection, e, { localDescription, candidate }){
            console.log('_setPeerParam', e , localDescription , candidate , peerConnection);
            this.mainWebContentsId == -1 && (this.mainWebContentsId = e.senderId);
            localDescription && ( await peerConnection.setRemoteDescription(localDescription),
                await peerConnection.setLocalDescription(),
                ipcRenderer.sendTo(this.mainWebContentsId,'set-peer-param',{ localDescription:peerConnection.localDescription.toJSON() }) );
            
            candidate && peerConnection.addIceCandidate(candidate);
        },
        _removeTrack:function(e){
            console.log('_removeTrack')
        },
        onkeyup:function(e){
            e.keyCode == 27 && this.isMaximized && ipcRenderer.send('setFullScreen-win',false);
            return e.keyCode != 27;
        },
        onmousemove:function(e){
            if(this.hideCursorHandle == null)
            {
                this.lastMoveTime = Date.now();
                this.hideCursorHandle = setInterval(this.hideCursorInterval.bind(this), 2000);
                
                document.body.style.cursor = "default";
                this.toolsIsVisible = true;
            }
            this.lastMoveTime = Date.now();
            return true;
        },
        hideCursorInterval:function(){
            if(!this.toolsIsHover &&  this.lastMoveTime && Date.now() - 5000 > this.lastMoveTime){
                clearInterval(this.hideCursorHandle),this.hideCursorHandle = null;

                document.body.style.cursor = "none";
                this.toolsIsVisible = false;
            }
        },
        maximizeChanged:function( event , isMaximized ) {
            this.isMaximized = isMaximized;
            if(this.isMaximized)
            {
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
        clickFullScreen:function(e){
            ipcRenderer.send('setFullScreen-win',true);
        },
        clickUnFullScreen:function(e){
            ipcRenderer.send('setFullScreen-win',false);
        },
        clickClose:function(e){
            this.playerStream = null;
            ipcRenderer.send("close-win");
        },
        clickMinimize:function(e){
            ipcRenderer.send("minimize-win");
        },
        _destroyMediaStream:function( mediaStream ){
            if( !mediaStream ) return
            try {
                mediaStream.getTracks().forEach(t=>{ t.stop(); mediaStream.removeTrack(t);}),mediaStream = null;
            } catch (err) {
                console.error(err);
            }
            finally {
                mediaStream = null;
            }
        },
        _unInit:function(e)
        {
            const that = this;
            that.playerStream = null;
        }
    },
    mounted:function(){
        this.init();
    }
});

window.onbeforeunload = _app._unInit.bind(_app);