const os = require('os');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { app, BrowserWindow, Tray, ipcMain, shell, Menu, dialog,session } = require('electron');
const isDev = require('electron-is-dev');
let mainWindow = null;
let screenWindow = null;
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

        let param = {
            serverURL:'',
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

        mainWindow = new BrowserWindow({
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
        });
        mainWindow.setMenu(null);
        mainWindow.loadFile( path.join(__dirname, 'static/index.html'),{ query:param });
        isDev && mainWindow.openDevTools();
        mainWindow.on('closed', () => {
            mainWindow = null;
        });
        mainWindow.webContents.on('new-window', (event, url, frameName, disposition, options) => {
            event.preventDefault()
            shell.openExternal(url);
        });
        mainWindow.webContents.on('ipc-message',ipcMessageFun);

    });
})();


function ipcMessageFun(e,channel,data){
    let win = BrowserWindow.fromId(e.frameId);
    if(win == null) return;
    if (channel === 'close-win') {
        win.close();
    }
    else if(channel === 'show-screen'){
        screenWindow && (screenWindow.close());
        screenWindow = null;
        screenWindow = new BrowserWindow({
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
        });
        screenWindow.setMenu(null);
        let p = JSON.parse(JSON.stringify(param));
        p['streamId'] = data;
        screenWindow.loadFile( path.join(__dirname, 'static/screen.html'),{ query:p });
        isDev && screenWindow.openDevTools();
        screenWindow.moveTop();
        screenWindow.webContents.on('ipc-message',ipcMessageFun);
        screenWindow.on('closed',()=>{
            screenWindow = null;
        });
    }
}