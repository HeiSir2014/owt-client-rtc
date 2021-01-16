const os = require('os');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { app, BrowserWindow, Tray, ipcMain, shell, Menu, dialog,session, webContents } = require('electron');
const isDev = require('electron-is-dev');
let mainWindow = null;
let screenWindow = null;
let loginRoomWindow = null;
let logger;


(function(){

    // 单例应用程序
    if (!app.requestSingleInstanceLock()) {
        app.quit()
        return
    }
    app.on('second-instance', (event, argv, cwd) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore()
            } else if (mainWindow.isVisible()) {
                mainWindow.focus()
            } else {
                mainWindow.show()
                mainWindow.focus()
            }
        } else {
            app.quit();
        }
    });
    process.on('uncaughtException',(err, origin) =>{
        logger.error(`uncaughtException: ${err} | ${origin}`)
    });
    process.on('unhandledRejection',(reason, promise) =>{
        logger.error(`unhandledRejection: ${promise} | ${reason}`)
    });

    app.on('ready', async () => {

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

        logger.info('loadExtension success');

        let param = getStartParam();
        if(param.userId == 'any')
        {
            loginRoomWindow = CreateDefaultWin({width:800,height:520});
            loginRoomWindow.loadFile( path.join(__dirname, 'static/loginRoom.html'));
            loginRoomWindow.on('closed', () => {
                loginRoomWindow = null;
            });
        }
        else
        {
            mainWindow = CreateDefaultWin();
            mainWindow.loadFile( path.join(__dirname, 'static/index.html'),{ query:param });
            mainWindow.on('closed', () => {
                mainWindow = null;
            });
        }
    });
})();

function getStartParam()
{
    let param = {
        serverURL: Buffer.from('aHR0cHM6Ly96aGliby5kamRldmVsb3Blci5jbjozMDA0Lw==','base64').toString(),
        room:'8888',
        userId:'any',
        userNick:'游客'
    };

    logger.info(`process.argv = ${JSON.stringify(process.argv)}`);

    process.argv.forEach(arg => {
        let _ = null;
        if((_ = arg.match(/^--(.*)=([^=]*)$/)) && _.length > 2)
        {
            param[ _[1] ]=_[2];
        }
    });
    return param;
}

function CreateDefaultWin(options)
{
    let opt = {
        width: 1280,
        height: 720,
        backgroundColor: '#ff2e2c29',
        skipTaskbar: false,
        transparent: false, frame: false, resizable: true,
        webPreferences: {
            nodeIntegration: true,
            spellcheck: false,
            webSecurity:!isDev
        },
        icon: path.join(__dirname, 'static/icon/logo.png'),
        alwaysOnTop: false,
        hasShadow: false,
    };
    if(options)
    {
        for (const key in options) {
            if (Object.hasOwnProperty.call(options, key)) {
                opt[key] = options[key];
            }
        }
    }
    let win = new BrowserWindow(opt);
    win.setMenu(null);
    isDev && win.openDevTools();
    win.webContents.on('ipc-message',ipcMessageFun);
    win.webContents.on('new-window', (event, url, frameName, disposition, options) => {
        event.preventDefault();
        shell.openExternal(url);
    });
    return win;
}

function ipcMessageFun(e,channel,data){
    logger.info( `win webContents Id:${ e.sender.id } | ${channel} | ${data}`);
    let win = BrowserWindow.fromWebContents( webContents.fromId(e.sender.id) );
    if(win == null)
    { 
        logger.error( `winId:${e.sender.id } | win = null`);
        return;
    }
    if (channel === 'close-win') {
        win.close();
    }
    else if(channel === 'show-screen'){
        screenWindow && (screenWindow.close());
        screenWindow = null;
        screenWindow = CreateDefaultWin();
        let param = getStartParam();
        let p = JSON.parse(JSON.stringify(param));
        p['streamId'] = data;
        screenWindow.loadFile( path.join(__dirname, 'static/screen.html'),{ query:p });
        screenWindow.moveTop();
        screenWindow.maximize();
        screenWindow.on('closed',()=>{
            screenWindow = null;
        });
    }
    else if(channel === 'joinRoom'){
        let param = getStartParam();
        if(data)
        {
            for (const key in data) {
                if (Object.hasOwnProperty.call(data, key)) {
                    param[key] = data[key];
                }
            }
        }
        mainWindow = CreateDefaultWin();
        mainWindow.loadFile( path.join(__dirname, 'static/index.html'),{ query:param });
        mainWindow.on('closed', () => {
            mainWindow = null;
        });
        
        loginRoomWindow && (loginRoomWindow.close());
    }
}