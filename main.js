const os = require('os');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { app, BrowserWindow, Tray, ipcMain, shell, Menu, dialog,session, webContents,systemPreferences } = require('electron');
const isDev = require('electron-is-dev');
const package_self = require('./package.json');
let mainWindow = null;
let videoWindows = [];
let loginRoomWindow = null;
let logger;
let localConfig;
let _startParam = null;


(function(){

    localConfig = path.join(app.getPath('userData'),'config.json');
    logger = winston.createLogger({
        level: 'debug',
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`+(info.splat!==undefined?`${info.splat}`:" "))
        ),
        transports: [
            new winston.transports.Console(),
            new winston.transports.File({ filename: path.join(app.getPath('userData'),'logs/error.log'), level: 'error' }),
            new winston.transports.File({ filename: path.join(app.getPath('userData'),'logs/all.log') }),
        ],
    });

    // 单例应用程序
    if (!isDev && !app.requestSingleInstanceLock()) {
        app.quit()
        return
    }
    app.on('second-instance', (event, argv, cwd) => {
        const [win] = BrowserWindow.getAllWindows();
        logger.info( "second-instance: "+ JSON.stringify(argv))
        if (win) {
            if (win.isMinimized()) {
                win.restore()
            }
            win.show()
            win.focus()
        }
        if(argv)
        {
            console.log(argv);
            let param = getStartParam(argv);
            param.userId != 'any' && CreateMainWin(param);
        }
    });
    process.on('uncaughtException',(err, origin) =>{
        logger.error(`uncaughtException: ${err} | ${origin}`)
    });
    process.on('unhandledRejection',(reason, promise) =>{
        logger.error(`unhandledRejection: ${promise} | ${reason}`)
    });

    app.on('open-url', function (event, url) {
        event.preventDefault();
        logger.info('open-url:' + url);
        var u = new URL(url);
        if(u.pathname == "/inmeeting")
        {
            let param = getStartParam();
            param['room'] = u.searchParams.get('room');
            param['userId'] = u.searchParams.get('user');
            if(app.isReady())
            {
                CreateMainWin(param);
                return;
            }
            _startParam = param;
        }
    });

    app.on('ready', async () => {

        !app.isDefaultProtocolClient('rtcclient') && app.setAsDefaultProtocolClient("rtcclient");

        logger.info('load success');

        let param = _startParam ? _startParam : getStartParam();
        if(param.userId == 'any')
        {
            loginRoomWindow = CreateDefaultWin({width:800,height:520,resizable:false});
            loginRoomWindow.loadFile( path.join(__dirname, 'static/loginRoom.html'));
            loginRoomWindow.on('closed', () => {
                loginRoomWindow = null;
            });
        }
        else
        {
            CreateMainWin(param);
        }
    });
})();

function MergeObject(a, b) {
    let c = JSON.parse(JSON.stringify(a))
    for (const key in b) {
        if (Object.hasOwnProperty.call(b, key)) {
            c[key] = (typeof b[key] == 'object' && c[key] && typeof c[key] == 'object') ? MergeObject(c[key],b[key]) : b[key]
        }
    }
    return c;
}

function getStartParam(argv)
{
    let param = {
        serverURL: Buffer.from('aHR0cHM6Ly95enNsLmJlaWppbmd5dW56aGlzaGFuZy5jb20v','base64').toString(),
        room:'8888',
        userId:'any',
        userNick:'游客'
    };
    
    let _argv = argv ? argv : process.argv;

    logger.info(`process.argv = ${JSON.stringify(_argv)}`);

    _argv.forEach(arg => {
        let _ = null;
        if(arg.startsWith("rtcclient://page/inmeeting"))
        {
            let u = new URL(arg);
            param['room'] = u.searchParams.get('room');
            param['userId'] = u.searchParams.get('user');
            return;
        }
        if((_ = arg.match(/^--(.*)=([^=]*)$/)) && _.length > 2)
        {
            param[ _[1] ]=_[2];
        }
    });

    logger.info(`param = ${JSON.stringify(param)}`);

    return param;
}

function CreateMainWin(param)
{
    let win = mainWindow;

    os.platform == 'darwin' && systemPreferences.askForMediaAccess('microphone');
    os.platform == 'darwin' && systemPreferences.askForMediaAccess('camera');

    mainWindow = CreateDefaultWin();
    mainWindow.loadFile( path.join(__dirname, 'static/index.html'),{ query:param });
    mainWindow.on('closed', () => {
        mainWindow = null;
        BrowserWindow.getAllWindows().forEach(window => {
            isDev && window.webContents.closeDevTools()
            window.close();
        })
    });
    
    mainWindow.once('ready-to-show',()=>{
        mainWindow.focus();
        mainWindow.moveTop();
        //mainWindow.setAspectRatio(16.0/9.0);
    });

    win && win.close();

    _startParam = null;
}

function CreateDefaultWin(options)
{
    let opt = {
        width: 960,
        height: 572,
        backgroundColor: '#ff2e2c29',
        skipTaskbar: false,
        transparent: false, frame: false, resizable: true,
        webPreferences: {
            nodeIntegration: true,
            spellcheck: false,
            webSecurity:!isDev,
            contextIsolation:false
        },
        icon: path.join(__dirname, 'static/icon/logo.png'),
        alwaysOnTop: false,
        hasShadow: false,
    };
    options && (opt = MergeObject(opt,options));
    let win = new BrowserWindow(opt);
    win.setMenu(null);
    isDev && win.webContents.openDevTools();
    win.webContents.on('ipc-message',ipcMessageFun);
    win.webContents.on('ipc-message-sync',ipcMessageFun);
    win.on('enter-full-screen',fullScreenChanged);
    win.on('leave-full-screen',fullScreenChanged);
    win.webContents.on('new-window', function(event, url, frameName, disposition, options){
        event.preventDefault();
        shell.openExternal(url);
    });
    win.webContents.on('dom-ready',function(e){
        let win = BrowserWindow.fromWebContents(e.sender);
        e.sender.send('maximizeChanged', win.isFullScreen());
        e.sender.send('set-version', package_self.version);
    });
    return win;
}

function fullScreenChanged(e){
    e.sender.webContents.send('maximizeChanged', !e.sender.isFullScreen());
}


function ipcMessageFun(e,channel,...theArgs){
    const data = theArgs.length ? theArgs[0] : null;
    logger.info( `win webContents Id: ${ e.sender.id } | ${channel} | ${data}`);
    let win = BrowserWindow.fromWebContents( webContents.fromId(e.sender.id) );
    if(win == null)
    { 
        logger.error( `winId:${e.sender.id } | win = null`);
        return;
    }
    
    if (/-win$/.test(channel)) {
        const cmd = channel.replace(/-win$/,'');
        isDev && cmd == 'close' && win.webContents.closeDevTools();
        win[cmd].call(win,...theArgs);
        return;
    }

    if (channel === 'getUser') {
        if(fs.existsSync(localConfig))
        {
            let con = JSON.parse(fs.readFileSync(localConfig,{encoding:'utf-8',flag:'r'}));
            win.webContents.send('getUserRsp',con);
        }
        return;
    }

    if(channel === 'create-video-windows'){
        newWindows = CreateDefaultWin();
        newWindows.loadFile( path.join(__dirname, 'static/videoWindows.html'),{query:{ id:e.sender.id}});
        newWindows.moveTop();
        videoWindows.push( newWindows );
        e.returnValue = { webContentsId: newWindows.webContents.id };
        return;
    }
    if(channel === 'joinRoom'){
        let param = getStartParam();
        
        let con = fs.existsSync(localConfig)? 
            JSON.parse(fs.readFileSync(localConfig,{encoding:'utf8',flag:'r'})):{};
        let lastConfigStr = JSON.stringify(con);
        let mapKeys = ['userId','enableAudio','enableVideo']
        for (const key in data) {
            Object.hasOwnProperty.call(data, key) && (param[key] = data[key],mapKeys.indexOf(key) != -1 && (con[key] = data[key]));
        }
        JSON.stringify(con) != lastConfigStr && (fs.writeFileSync(localConfig,JSON.stringify(con),{encoding:'utf-8'}));

        CreateMainWin(param);
        
        loginRoomWindow && (loginRoomWindow.close());
        return;
    }
}