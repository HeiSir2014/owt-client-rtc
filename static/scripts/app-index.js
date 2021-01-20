const { ipcRenderer } = require('electron');

const _app = new Vue({
    el: '#App',
    data:function(){
        return {
            version:'1.0.2',
            statUpload:0,
            statDownload:0,
        }
    },
    methods:{
        init:function(e){

        },
        close:function(e){
            
            ipcRenderer.send("close-win");
        }
    },
    mounted:function(){
        this.init();
    }
});