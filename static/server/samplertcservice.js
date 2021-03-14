/*global require, __dirname, console, process*/
'use strict';

var express = require('express'),
  spdy = require('spdy'),
  bodyParser = require('body-parser'),
  errorhandler = require('errorhandler'),
  morgan = require('morgan'),
  fs = require('fs'),
  log4js = require('log4js'),
  https = require('https'),
  icsREST = require('./rest');



log4js.configure({
  appenders: {
    console: {
      type: 'console'
    },
    server: {
      type: 'file',
      filename: __dirname + '/../../logs/server.log',
      "maxLogSize": 4096760,
      "numBackups": 5
    },
    stream: {
      type: 'file',
      filename: __dirname + '/../../logs/stream.log',
      "maxLogSize": 4096760,
      "numBackups": 5
    },
    'just-errors': {
      type: 'logLevelFilter',
      appender: 'stream',
      level: 'error'
    }
  },
  categories: {
    default: {
      appenders: ['console', 'server', 'just-errors'],
      level: 'debug'
    }
  }
});

const logger = log4js.getLogger();

var app = express();

// app.configure ya no existe
app.use(errorhandler());
app.use(morgan('dev'));
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
app.disable('x-powered-by');

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, PATCH, OPTIONS, DELETE');
  res.header('Access-Control-Allow-Headers', 'origin, content-type');
  res.header('Strict-Transport-Security', 'max-age=1024000; includeSubDomain');
  res.header('X-Content-Type-Options', 'nosniff');
  if (req.method == 'OPTIONS') {
    res.send(200);
  } else {
    next();
  }
});

//vod 点播目录
if(fs.existsSync(path.join(__dirname ,'/../../vod/')))
{
  fs.mkdirSync(path.join(__dirname ,'/../../vod/'));
}
app.use(express.static(fs.realpathSync(__dirname + '/../../vod/')));

icsREST.API.init('_service_ID_', '_service_KEY_', 'http://localhost:3000/', false);

logger.info('AppService Start...');

var sampleRoom;
var pageOption = {
  page: 1,
  per_page: 9999999
};
(function initSampleRoom() {
  icsREST.API.getRooms(pageOption, function (rooms) {
    logger.info(rooms.length + ' rooms in this service.');
    logger.info('AppService Start Success!');
    var tryCreate = function (room, callback) {
      var options = {};
      //setDefaultRoomOption(options);
      icsREST.API.createRoom(room.name, options, function (response) {
        let r = response;
        filterRoom(r);
        icsREST.API.updateRoom(response._id, r, function (result) {

        }, function (err) {
          logger.error('createRoom end' + err);
          r.send(err);
        });
        callback(r._id);
      }, function (status, err) {
        logger.error('Error in creating room:' + err + " [Retry]");
        setTimeout(function () {
          tryCreate(room, options, callback);
        }, 100);
      }, room);
    };

    var room;
    if (!sampleRoom) {
      room = {
        name: 'sampleRoom'
      };
      tryCreate(room, function (Id) {
        sampleRoom = Id;
        logger.info('sampleRoom Id:', sampleRoom);
      });
    }
  }, function (stCode, msg) {
    console.log('getRooms failed(', stCode, '):', msg);
  });

})();


////////////////////////////////////////////////////////////////////////////////////////////
// legacy interface begin
// /////////////////////////////////////////////////////////////////////////////////////////
app.get('/getLog', function (req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf8'
  });
  res.end(fs.readFileSync(__dirname + '/../../logs/server.log'));
});
app.get('/getLogError', function (req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf8'
  });
  res.end(fs.readFileSync(__dirname + '/../../logs/stream.log'));
});

app.get('/getUsers/:room', function (req, res) {
  var room = req.params.room;
  icsREST.API.getParticipants(room, function (users) {
    res.send(users);
  }, function (err) {
    res.send(err);
  });
});

app.get('/getRoom/:room', function (req, res) {
  'use strict';
  var room = req.params.room;
  icsREST.API.getRoom(room, function (rooms) {
    res.send(rooms);
  }, function (err) {
    res.send(err);
  });
});

app.get('/room/:room/user/:user', function (req, res) {
  'use strict';
  var room = req.params.room;
  var participant_id = req.params.user;
  icsREST.API.getParticipant(room, participant_id, function (user) {
    res.send(user);
  }, function (err) {
    res.send(err);
  });
});

app.delete('/room/:room/user/:user', function (req, res) {
  'use strict';
  var room = req.params.room;
  var participant_id = req.params.user;
  icsREST.API.dropParticipant(room, participant_id, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
})

app.delete('/room/:room', function (req, res) {
  'use strict';
  var room = req.params.room;
  icsREST.API.deleteRoom(room, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
})
////////////////////////////////////////////////////////////////////////////////////////////
// legacy interface begin
// /////////////////////////////////////////////////////////////////////////////////////////

function filterRoom(room) {
  if (typeof room != 'object' || room == null) {
    return;
  }
  let r = room;
  r.roles = [{
    "subscribe": {
      "video": true,
      "audio": true
    },
    "publish": {
      "video": true,
      "audio": true
    },
    "role": "presenter"
  }, {
    "subscribe": {
      "video": true,
      "audio": true
    },
    "publish": {
      "video": true,
      "audio": true
    },
    "role": "sip"
  }, {
    "subscribe": {
      "video": true,
      "audio": true
    },
    "publish": {
      "video": true,
      "audio": true
    },
    "role": "presenter_guest"
  }, {
    "subscribe": {
      "video": true,
      "audio": true
    },
    "publish": {
      "video": false,
      "audio": false
    },
    "role": "viewer"
  }];
  r.mediaOut.video.format = [{ "codec": "h264", "profile": "CB" }];
  r.mediaOut.video.parameters.bitrate = ["x1.2", "x1.0", "x0.8", "x0.6"];
  r.transcoding.video.parameters.bitrate = true;
  r.transcoding.video.parameters.framerate = true;

  r.views[0].audio.vad = false;
  r.views[0].video.bgColor = { "b": 44, "g": 44, "r": 44 };
  r.views[0].video.format = { "codec": "h264", "profile": "CB" };
  r.views[0].video.motionFactor = 1.0;
  r.views[0].video.parameters.resolution.height = 1080;
  r.views[0].video.parameters.resolution.width = 1920;
  r.views[0].video.layout.templates.custom = [{ "region": [{ "id": "1", "area": { "height": "1", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "1/4", "width": "1/4", "top": "3/4", "left": "3/4" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "1279/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "1279/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "1439/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "269/1080", "width": "479/1920", "top": "0", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "268/1080", "width": "479/1920", "top": "271/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "268/1080", "width": "479/1920", "top": "541/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "269/1080", "width": "479/1920", "top": "811/1080", "left": "1441/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "719/1080", "width": "1279/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "358/1080", "width": "639/1920", "top": "721/1080", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "809/1080", "width": "1439/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "269/1080", "width": "479/1920", "top": "0", "left": "481/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "268/1080", "width": "479/1920", "top": "281/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "268/1080", "width": "479/1920", "top": "541/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "268/1080", "width": "479/1920", "top": "811/1080", "left": "1441/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "269/1080", "width": "479/1920", "top": "811/1080", "left": "961/1920" }, "shape": "rectangle" }, { "id": "7", "area": { "height": "269/1080", "width": "479/1920", "top": "811/1080", "left": "481/1920" }, "shape": "rectangle" }, { "id": "8", "area": { "height": "269/1080", "width": "479/1920", "top": "811/1080", "left": "0" }, "shape": "rectangle" }] }];
  r.views[0].video.layout.templates.base = "lecture";
  //r.views[0].video.layout.templates.inputCount = 9;
  r.views[0].video.layout.fitPolicy = "crop"; //crop / letterbox
  r.views[0].video.layout.crop = true;
  if (r.views.length <= 1) {
    var presenters = JSON.parse(JSON.stringify(r.views[0]));
    presenters['label'] = 'presenters';
    presenters.video.parameters.resolution.height = 1080;
    presenters.video.parameters.resolution.width = 1920;
    presenters.video.layout.templates.inputCount = 9;
    r.views.push(presenters);
  }
  if (r.views.length <= 2) {
    var presenters = JSON.parse(JSON.stringify(r.views[0]));
    presenters['label'] = 'small';
    presenters.video.parameters.resolution.height = 1080;
    presenters.video.parameters.resolution.width = 480;   // 720 - 320 | 1080 - 480
    presenters.video.maxInput = 4;
    presenters.video.layout.templates.inputCount = 4;
    //不携带边框的布局
    //presenters.video.layout.templates.custom = [{"region":[{"id":"1","area":{"height":"1/4","width":"1","top":"0","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/4","width":"1","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/4","width":"1","top":"1/4","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/4","width":"1","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/4","width":"1","top":"1/4","left":"0"},"shape":"rectangle"},{"id":"3","area":{"height":"1/4","width":"1","top":"1/2","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/4","width":"1","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/4","width":"1","top":"1/4","left":"0"},"shape":"rectangle"},{"id":"3","area":{"height":"1/4","width":"1","top":"1/2","left":"0"},"shape":"rectangle"},{"id":"4","area":{"height":"1/4","width":"1","top":"3/4","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/4","width":"1","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/4","width":"1","top":"1/4","left":"0"},"shape":"rectangle"},{"id":"3","area":{"height":"1/4","width":"1","top":"1/2","left":"0"},"shape":"rectangle"},{"id":"4","area":{"height":"1/4","width":"1","top":"3/4","left":"0"},"shape":"rectangle"},{"id":"5","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/4","width":"1","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/4","width":"1","top":"1/4","left":"0"},"shape":"rectangle"},{"id":"3","area":{"height":"1/4","width":"1","top":"1/2","left":"0"},"shape":"rectangle"},{"id":"4","area":{"height":"1/4","width":"1","top":"3/4","left":"0"},"shape":"rectangle"},{"id":"5","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"6","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/4","width":"1","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/4","width":"1","top":"1/4","left":"0"},"shape":"rectangle"},{"id":"3","area":{"height":"1/4","width":"1","top":"1/2","left":"0"},"shape":"rectangle"},{"id":"4","area":{"height":"1/4","width":"1","top":"3/4","left":"0"},"shape":"rectangle"},{"id":"5","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"6","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"7","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/4","width":"1","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/4","width":"1","top":"1/4","left":"0"},"shape":"rectangle"},{"id":"3","area":{"height":"1/4","width":"1","top":"1/2","left":"0"},"shape":"rectangle"},{"id":"4","area":{"height":"1/4","width":"1","top":"3/4","left":"0"},"shape":"rectangle"},{"id":"5","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"6","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"7","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"},{"id":"8","area":{"height":"0","width":"0","top":"0","left":"0"},"shape":"rectangle"}]}];
    //携带边框的布局
    presenters.video.layout.templates.custom = [{ "region": [{ "id": "1", "area": { "height": "269/1080", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "269/1080", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "269/1080", "width": "1", "top": "271/1080", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "269/1080", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "269/1080", "width": "1", "top": "271/1080", "left": "0" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "269/1080", "width": "1", "top": "541/1080", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "269/1080", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "268/1080", "width": "1", "top": "271/1080", "left": "0" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "268/1080", "width": "1", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "269/1080", "width": "1", "top": "811/1080", "left": "0" }, "shape": "rectangle" }] }];
    //presenters["audio"] = true;
    r.views.push(presenters);
  }
  if (false && r.views.length <= 3) {
    var presenters = JSON.parse(JSON.stringify(r.views[0]));
    presenters['label'] = 'rectangle';
    presenters.video.parameters.resolution.height = 720;
    presenters.video.parameters.resolution.width = 1280;
    presenters.video.layout.templates.inputCount = 9;
    presenters.video.maxInput = 9;
    //不携带边框的布局
    //presenters.video.layout.templates.custom = [{"region":[{"id":"1","area":{"height":"1","width":"1","top":"0","left":"0"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1","width":"1/2","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1","width":"1/2","top":"0","left":"1/2"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1","width":"1/2","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/2","width":"1/2","top":"0","left":"1/2"},"shape":"rectangle"},{"id":"3","area":{"height":"1/2","width":"1/2","top":"1/2","left":"1/2"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/2","width":"1/2","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/2","width":"1/2","top":"0","left":"1/2"},"shape":"rectangle"},{"id":"3","area":{"height":"1/2","width":"1/2","top":"1/2","left":"0"},"shape":"rectangle"},{"id":"4","area":{"height":"1/2","width":"1/2","top":"1/2","left":"1/2"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/2","width":"1/2","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/2","width":"1/2","top":"0","left":"1/2"},"shape":"rectangle"},{"id":"3","area":{"height":"1/2","width":"1/3","top":"1/2","left":"0"},"shape":"rectangle"},{"id":"4","area":{"height":"1/2","width":"1/3","top":"1/2","left":"1/3"},"shape":"rectangle"},{"id":"5","area":{"height":"1/2","width":"1/3","top":"1/2","left":"2/3"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/2","width":"1/3","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/2","width":"1/3","top":"0","left":"1/3"},"shape":"rectangle"},{"id":"3","area":{"height":"1/2","width":"1/3","top":"0","left":"2/3"},"shape":"rectangle"},{"id":"4","area":{"height":"1/2","width":"1/3","top":"1/2","left":"0"},"shape":"rectangle"},{"id":"5","area":{"height":"1/2","width":"1/3","top":"1/2","left":"1/3"},"shape":"rectangle"},{"id":"6","area":{"height":"1/2","width":"1/3","top":"1/2","left":"2/3"},"shape":"rectangle"}]},{"region":[{"id":"1","area":{"height":"1/3","width":"1/3","top":"0","left":"0"},"shape":"rectangle"},{"id":"2","area":{"height":"1/3","width":"1/3","top":"0","left":"1/3"},"shape":"rectangle"},{"id":"3","area":{"height":"1/3","width":"1/3","top":"0","left":"2/3"},"shape":"rectangle"},{"id":"4","area":{"height":"1/3","width":"1/3","top":"1/3","left":"0"},"shape":"rectangle"},{"id":"5","area":{"height":"1/3","width":"1/3","top":"1/3","left":"1/3"},"shape":"rectangle"},{"id":"6","area":{"height":"1/3","width":"1/3","top":"1/3","left":"2/3"},"shape":"rectangle"},{"id":"7","area":{"height":"1/3","width":"1/3","top":"2/3","left":"0"},"shape":"rectangle"},{"id":"8","area":{"height":"1/3","width":"1/3","top":"2/3","left":"1/3"},"shape":"rectangle"},{"id":"9","area":{"height":"1/3","width":"1/3","top":"2/3","left":"2/3"},"shape":"rectangle"}]}];
    //携带边框的布局
    presenters.video.layout.templates.custom = [{ "region": [{ "id": "1", "area": { "height": "1", "width": "1", "top": "0", "left": "0" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "1", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "1", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "959/1920", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "539/1080", "width": "959/1920", "top": "541/1080", "left": "961/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "538/1080", "width": "959/1920", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "539/1080", "width": "959/1920", "top": "541/1080", "left": "961/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "959/1920", "top": "0", "left": "961/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "538/1080", "width": "639/1920", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "539/1080", "width": "639/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "539/1080", "width": "638/1920", "top": "0", "left": "641/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "539/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "0" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "539/1080", "width": "638/1920", "top": "541/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "539/1080", "width": "639/1920", "top": "541/1080", "left": "1281/1920" }, "shape": "rectangle" }] }, { "region": [{ "id": "1", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "0" }, "shape": "rectangle" }, { "id": "2", "area": { "height": "359/1080", "width": "638/1920", "top": "0", "left": "641/1920" }, "shape": "rectangle" }, { "id": "3", "area": { "height": "359/1080", "width": "639/1920", "top": "0", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "4", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "0" }, "shape": "rectangle" }, { "id": "5", "area": { "height": "358/1080", "width": "638/1920", "top": "361/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "6", "area": { "height": "358/1080", "width": "639/1920", "top": "361/1080", "left": "1281/1920" }, "shape": "rectangle" }, { "id": "7", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "0" }, "shape": "rectangle" }, { "id": "8", "area": { "height": "359/1080", "width": "638/1920", "top": "721/1080", "left": "641/1920" }, "shape": "rectangle" }, { "id": "9", "area": { "height": "359/1080", "width": "639/1920", "top": "721/1080", "left": "1281/1920" }, "shape": "rectangle" }] }];
    //presenters.audio = null;

    r.views.push(presenters);
  }
  console.log("viewport length:" + r.views.length);
}

////////////////////////////////////////////////////////////////////////////////////////////
// New RESTful interface begin
// /////////////////////////////////////////////////////////////////////////////////////////
app.post('/rooms', function (req, res) {
  'use strict';
  var name = req.body.name;
  var options = req.body.options;
  logger.info(req.originalUrl + " " + JSON.stringify(req.body));
  icsREST.API.createRoom(name, options, function (response) {
    let r = response;
    filterRoom(r);
    icsREST.API.updateRoom(response._id, r, function (result) {
      res.send(result);
    }, function (err) {
      logger.error('createRoom end' + err);
      res.send(err);
    })
  }, function (err) {
    logger.error('createRoom end' + err);
    res.send(err);
  });
});

app.get('/rooms', function (req, res) {
  'use strict';
  var psw = req.query.psw;
  psw == 'token' && icsREST.API.getRooms(pageOption, function (rooms) {
    res.send(rooms);
  }, function (err) {
    res.send(err);
  });
  psw != 'token' && res.status(404).send(`<!DOCTYPE html>
  <html lang="en">
  <head>
  <meta charset="utf-8">
  <title>Error</title>
  </head>
  <body>
  <pre>Cannot GET /rooms</pre>
  </body>
  </html>`);
});

app.get('/rooms/:room', function (req, res) {
  'use strict';
  var room = req.params.room;
  icsREST.API.getRoom(room, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.put('/rooms/:room', function (req, res) {
  'use strict';
  var room = req.params.room,
    config = req.body;
  icsREST.API.updateRoom(room, config, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.patch('/rooms/:room', function (req, res) {
  'use strict';
  var room = req.params.room,
    items = req.body;
  icsREST.API.updateRoomPartially(room, items, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.delete('/rooms/:room', function (req, res) {
  'use strict';
  var room = req.params.room;
  icsREST.API.deleteRoom(room, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.get('/rooms/:room/participants', function (req, res) {
  'use strict';
  var room = req.params.room;
  icsREST.API.getParticipants(room, function (participants) {
    res.send(participants);
  }, function (err) {
    res.send(err);
  });
});

app.get('/rooms/:room/participants/:id', function (req, res) {
  'use strict';
  var room = req.params.room;
  var participant_id = req.params.id;
  icsREST.API.getParticipant(room, participant_id, function (info) {
    res.send(info);
  }, function (err) {
    res.send(err);
  });
});

app.patch('/rooms/:room/participants/:id', function (req, res) {
  'use strict';
  var room = req.params.room;
  var participant_id = req.params.id;
  var items = req.body;
  icsREST.API.updateParticipant(room, participant_id, items, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.delete('/rooms/:room/participants/:id', function (req, res) {
  'use strict';
  var room = req.params.room;
  var participant_id = req.params.id;
  icsREST.API.dropParticipant(room, participant_id, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.get('/rooms/:room/streams', function (req, res) {
  'use strict';
  var room = req.params.room;
  icsREST.API.getStreams(room, function (streams) {
    res.send(streams);
  }, function (err) {
    res.send(err);
  });
});

app.get('/rooms/:room/streams/:stream', function (req, res) {
  'use strict';
  var room = req.params.room,
    stream_id = req.params.stream;
  icsREST.API.getStream(room, stream_id, function (info) {
    res.send(info);
  }, function (err) {
    res.send(err);
  });
});

app.patch('/rooms/:room/streams/:stream', function (req, res) {
  'use strict';
  var room = req.params.room,
    stream_id = req.params.stream,
    items = req.body;
  icsREST.API.updateStream(room, stream_id, items, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.delete('/rooms/:room/streams/:stream', function (req, res) {
  'use strict';
  var room = req.params.room,
    stream_id = req.params.stream;
  icsREST.API.deleteStream(room, stream_id, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.post('/rooms/:room/streaming-ins', function (req, res) {
  'use strict';
  var room = req.params.room,
    url = req.body.url,
    transport = req.body.transport,
    media = req.body.media;

  icsREST.API.startStreamingIn(room, url, transport, media, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.delete('/rooms/:room/streaming-ins/:id', function (req, res) {
  'use strict';
  var room = req.params.room,
    stream_id = req.params.id;
  icsREST.API.stopStreamingIn(room, stream_id, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.get('/rooms/:room/streaming-outs', function (req, res) {
  'use strict';
  var room = req.params.room;
  icsREST.API.getStreamingOuts(room, function (streamingOuts) {
    res.send(streamingOuts);
  }, function (err) {
    res.send(err);
  });
});

app.post('/rooms/:room/streaming-outs', function (req, res) {
  'use strict';
  var room = req.params.room,
    protocol = req.body.protocol,
    url = req.body.url,
    parameters = req.body.parameters,
    media = req.body.media;

  icsREST.API.startStreamingOut(room, protocol, url, parameters, media, function (info) {
    res.send(info);
  }, function (err) {
    res.send(err);
  });
});

app.patch('/rooms/:room/streaming-outs/:id', function (req, res) {
  'use strict';
  var room = req.params.room,
    id = req.params.id,
    commands = req.body;
  icsREST.API.updateStreamingOut(room, id, commands, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.delete('/rooms/:room/streaming-outs/:id', function (req, res) {
  'use strict';
  var room = req.params.room,
    id = req.params.id;
  icsREST.API.stopStreamingOut(room, id, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.get('/rooms/:room/recordings', function (req, res) {
  'use strict';
  var room = req.params.room;
  icsREST.API.getRecordings(room, function (recordings) {
    res.send(recordings);
  }, function (err) {
    res.send(err);
  });
});

app.post('/rooms/:room/recordings', function (req, res) {
  'use strict';
  var room = req.params.room,
    container = req.body.container,
    media = req.body.media;
  logger.info("startRecording " + [room, container, media].join("|"));
  icsREST.API.startRecording(room, container, media, function (info) {
    res.send(info);
  }, function (err) {
    logger.error("startRecording error " + [room, container, media, err].join("|"));
    res.send(err);
  });
});

app.patch('/rooms/:room/recordings/:id', function (req, res) {
  'use strict';
  var room = req.params.room,
    id = req.params.id,
    commands = req.body;
  icsREST.API.updateRecording(room, id, commands, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

const {
  exec
} = require('child_process');
const os = require('os');


function CopyFile(srcFile, destFile, callback) {
  var readStream = fs.createReadStream(srcFile);
  var writeStream = fs.createWriteStream(destFile);
  readStream.pipe(writeStream);
  writeStream.on('close', (e) => {
    if (callback != null) {
      callback();
    }
    //console.log("CopyFile " + srcFile + " =>> " + destFile);
  })


}

Date.prototype.Format = function (fmt) { //author: meizz
  var o = {
    "M+": this.getMonth() + 1, //月份
    "d+": this.getDate(), //日
    "h+": this.getHours(), //小时
    "m+": this.getMinutes(), //分
    "s+": this.getSeconds(), //秒
    "q+": Math.floor((this.getMonth() + 3) / 3), //季度
    "S": this.getMilliseconds() //毫秒
  };
  if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
  for (var k in o)
    if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
  return fmt;
};

app.get('/vod/:recordid/:recordm3u8', function (req, res, next) {
  'use strict';
  let recordid = req.params.recordid;
  let recordm3u8 = req.params.recordm3u8;
  let vodRootDir = fs.realpathSync(__dirname + '/../../vod');
  let destDescPath = `${vodRootDir}/${recordid}.json`;
  if (fs.existsSync(destDescPath)) {
    let desc = JSON.parse(fs.readFileSync(destDescPath));
    if (desc.room) {
      let id = desc.room + (new Date(desc.time)).Format("yyyyMMdd");
      if (recordm3u8.endsWith('m3u8')) {
        res.redirect(`/${id}/index.m3u8`)
        return
      }
      else if (recordm3u8.endsWith('mp4')) {
        res.redirect(`/${id}/${id}.mp4`)
      }
    }
  }
  res.redirect(`/${recordid}/${recordm3u8}`)
});

app.delete('/rooms/:room/recordings/:id', function (req, res) {
  'use strict';
  var room = req.params.room,
    id = req.params.id;
  logger.info("stopRecording " + room + " id = " + id);
  icsREST.API.stopRecording(room, id, function (result) {
    res.send(result);
  }, function (err) {
    logger.error("stopRecording error:" + err);
    res.send(err);
  });
});

var dict_room_rid = {};

function getTokenById(req, res) {
  var room = req.body.room || sampleRoom,
    user = req.body.user,
    role = req.body.role,
    appKey = req.body.appKey;
  var preference = {
    isp: 'isp',
    region: 'region'
  };
  var room_key = appKey + "_" + room;
  if (dict_room_rid[room_key] == null) {
    icsREST.API.getRooms({
      page: 1,
      per_page: 99999999
    }, function (rooms) {
      console.log(`all rooms:${rooms.length} room_key:${room_key}`)
      for (const idx in rooms) {
        let _room = rooms[idx];
        if (_room.name == room_key) {
          dict_room_rid[room_key] = _room._id;
          icsREST.API.createToken(_room._id, user, role, preference, function (token_) {
            res.send(token_);
          }, function (err_) {
            logger.error(req.originalUrl + " " + [room, user, role].join(' ') + " /tokens error:" + err_);
            res.status(401).send(err_);
          });
          return;
        }
      }
      console.log(`not found room ${room_key}`)

      icsREST.API.createRoom(room_key, {}, function (response) {
        let r = response;
        filterRoom(r);
        let oldid = response._id;
        dict_room_rid[room_key] = oldid;
        icsREST.API.updateRoom(oldid, r, function (result) {
          icsREST.API.createToken(result._id, user, role, preference, function (token_) {
            res.send(token_);
          }, function (err_) {
            logger.error(req.originalUrl + " " + [room, user, role].join(' ') + " /tokens error:" + err_);
            res.status(401).send(err_);
          });
        }, function (err) {
          logger.error('createRoom end' + err);
          res.send(err);
        });
      }, function (err) {
        logger.error('createRoom end' + err);
        res.send(err);
      });
    });
  }
  else {
    icsREST.API.createToken(dict_room_rid[room_key], user, role, preference, function (token_) {
      res.send(token_);
    }, function (err_) {
      logger.error(req.originalUrl + " " + [room, user, role].join(' ') + " /tokens error:" + err_);
      res.status(401).send(err_);
    });
  }
}

//Sip call management.
app.get('/rooms/:room/sipcalls', function (req, res) {
  'use strict';
  var room = req.params.room;
  icsREST.API.getSipCalls(room, function (sipCalls) {
    res.send(sipCalls);
  }, function (err) {
    res.send(err);
  });
});

app.post('/rooms/:room/sipcalls', function (req, res) {
  'use strict';
  var room = req.params.room,
    peerUri = req.body.peerURI,
    mediaIn = req.body.mediaIn,
    mediaOut = req.body.mediaOut;
  icsREST.API.makeSipCall(room, peerUri, mediaIn, mediaOut, function (info) {
    res.send(info);
  }, function (err) {
    res.send(err);
  });
});

app.patch('/rooms/:room/sipcalls/:id', function (req, res) {
  'use strict';
  var room = req.params.room,
    id = req.params.id,
    commands = req.body;
  icsREST.API.updateSipCall(room, id, commands, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.delete('/rooms/:room/sipcalls/:id', function (req, res) {
  'use strict';
  var room = req.params.room,
    id = req.params.id;
  icsREST.API.endSipCall(room, id, function (result) {
    res.send(result);
  }, function (err) {
    res.send(err);
  });
});

app.post('/tokens', function (req, res) {
  'use strict';
  var room = req.body.room || sampleRoom,
    user = req.body.user,
    role = req.body.role,
    appKey = req.body.appKey;

  logger.info(req.originalUrl + " " + [room, user, role].join(' '));
  //Note: The actual *ISP* and *region* information should be retrieved from the *req* object and filled in the following 'preference' data.
  var preference = {
    isp: 'isp',
    region: 'region'
  };

  if (appKey) {
    getTokenById(req, res);
    return
  }
  res.status(404).send("appKey not found");
});
////////////////////////////////////////////////////////////////////////////////////////////
// New RESTful interface end
////////////////////////////////////////////////////////////////////////////////////////////

spdy.createServer({
  spdy: {
    plain: true
  }
}, app).listen(3001, (err) => {
  if (err) {
    logger.error("Failed to setup plain server, " + err);
    return process.exit(1);
  }
});

var cipher = require('./cipher');
cipher.unlock(cipher.k, 'cert/.woogeen.keystore', function cb(err, obj) {
  if (!err) {
    spdy.createServer({
      pfx: fs.readFileSync('cert/certificate.pfx'),
      passphrase: obj.sample
    }, app).listen(3004, (error) => {
      if (error) {
        console.log('Failed to setup secured server: ', error);
        return process.exit(1);
      }
    });
  }
  if (err) {
    console.error('Failed to setup secured server:', err);
    return process.exit();
  }
});
