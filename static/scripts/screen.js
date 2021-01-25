'use strict';
const { ipcRenderer } = require('electron');
window.onload = function() {
    let close = document.querySelector('.systools .close');
    const pc = new RTCPeerConnection();
    ipcRenderer.on('set-remote-stream',async function(event,remoteDesc){
        await pc.setRemoteDescription(remoteDesc);
        await pc.setLocalDescription();
        const localDesc = pc.localDescription;
        ipcRenderer.send('set-remote-desc',remoteDesc,localDesc.toJSON());
    });

    ipcRenderer.on('set-icecandidate',function(event,candidate){
        pc.addIceCandidate(candidate);
    });

    pc.onicecandidate = function({candidate})
    {
        candidate && ipcRenderer.send('set-icecandidate-remote',candidate.toJSON());
    }

    pc.ontrack = function(e){
        let v = document.querySelector('.video-container .playRTC');
        v && (v.srcObject != e.streams[0]) && (v.srcObject = e.streams[0]);
        v.srcObject.addEventListener("ended",()=>{
            close.click();
        });
    }
    pc.onconnectionstatechange = ()=>{
        pc.connectionState == 'closed'||pc.connectionState == 'failed' && close.click();
    }

    close.onclick = () => {
        let v = document.querySelector('.video-container .playRTC');
        v && (v.srcObject = null);
        ipcRenderer.send("close-win");
    };
    
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

window.onbeforeunload = function(event){
    return;
}