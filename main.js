const os = require('os');
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Tray, ipcMain, shell, Menu, dialog } = require('electron');
const isDev = require('electron-is-dev');
let mainWindow = null;


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
            app.quit()
        }
    });
    process.on('uncaughtException',(err, origin) =>{
        logger.error(`uncaughtException: ${err} | ${origin}`)
    });
    process.on('unhandledRejection',(reason, promise) =>{
        logger.error(`unhandledRejection: ${promise} | ${reason}`)
    });

    app.on('ready', () => {

        let param = {
            serverURL:'',
            room:'8888',
            userId:'any',
            userNick:'游客',
        };
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
        mainWindow.webContents.on('ipc-message',(e,channel,data)=>{
            if (channel === 'close-win') {
                mainWindow.close();
            }
        });
    });
})();