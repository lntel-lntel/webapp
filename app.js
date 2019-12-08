// Netboot.xyz
// Main Node.js app

var app = require('express')();
var exec = require('child_process').exec;
var express = require('express');
var fs = require('fs');
var http = require('http').Server(app);
var io = require('socket.io')(http);
var isBinaryFile = require("isbinaryfile").isBinaryFile;
var request = require('request');
var si = require('systeminformation');
var yaml = require('js-yaml');

////// PATHS //////
//// Main ////
app.get("/", function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});
//// Public JS and CSS ////
app.use('/public', express.static(__dirname + '/public'));



// Socket IO connection
io.on('connection', function(socket){
  //// Socket Connect ////
  // Log Client and connection time
  console.log(socket.id + ' connected time=' + (new Date).getTime());
  socket.join(socket.id);
  ///////////////////////////
  ////// Socket events //////
  ///////////////////////////
  // When dashboard info is requested send to client
  socket.on('getdash', function(){
    var tftpcmd = '/usr/sbin/in.tftpd --version';
    var nginxcmd = '/usr/sbin/nginx -v';
    // Hard code until we have endpoints to ingest
    var dashinfo = {};
    dashinfo['webversion'] = "0.0.1";
    dashinfo['menuversion'] = "1.04";
    dashinfo['remotemenuversion'] = "1.05";
    si.cpu(function(cpu) {
      dashinfo['cpu'] = cpu;
      si.mem(function(mem) {
        dashinfo['mem'] = mem;
        si.currentLoad(function(currentLoad) {
          dashinfo['CPUpercent'] = currentLoad.currentload_user;
          exec(tftpcmd, function (err, stdout) {
            dashinfo['tftpversion'] = stdout;
            exec(nginxcmd, function (err, stdout, stderr) {
               dashinfo['nginxversion'] = stderr;
               io.sockets.in(socket.id).emit('renderdash',dashinfo);
            });
          });  
        });
      });
    });
  });
  // When config info is requested send file list to client
  socket.on('getconfig', function(){
    var local_files = fs.readdirSync('/config/menus/local',{withFileTypes: true}).filter(dirent => !dirent.isDirectory()).map(dirent => dirent.name);
    var remote_files = fs.readdirSync('/config/menus/remote',{withFileTypes: true}).filter(dirent => !dirent.isDirectory()).map(dirent => dirent.name);
    io.sockets.in(socket.id).emit('renderconfig',remote_files,local_files);
  });
  // When a file is requested send it's contents to the client
  socket.on('editgetfile', function(filename,islocal){
    var file = '/config/menus/' + filename ;
    var data = fs.readFileSync(file);
    var stat = fs.lstatSync(file);
    isBinaryFile(data, stat.size).then((result) => {
      if (result) {
        io.sockets.in(socket.id).emit('editrenderfile','CANNOT EDIT THIS IS A BINARY FILE',filename,'nomenu');
      }
      else {
        io.sockets.in(socket.id).emit('editrenderfile',data.toString("utf8"),filename,islocal);
      }
    });
  });
  // When save is requested save it sync files and return user to menu
  socket.on('saveconfig', function(filename,text){
    fs.writeFileSync('/config/menus/local/' + filename, text);
    layermenu(function(response){
      var local_files = fs.readdirSync('/config/menus/local',{withFileTypes: true}).filter(dirent => !dirent.isDirectory()).map(dirent => dirent.name);
      var remote_files = fs.readdirSync('/config/menus/remote',{withFileTypes: true}).filter(dirent => !dirent.isDirectory()).map(dirent => dirent.name);
      io.sockets.in(socket.id).emit('renderconfig',remote_files,local_files,filename,true);
    });
  });
  // When save is requested save it sync files and return user to menu
  socket.on('revertconfig', function(filename){
    fs.unlinkSync('/config/menus/local/' + filename);
    layermenu(function(response){
      var local_files = fs.readdirSync('/config/menus/local',{withFileTypes: true}).filter(dirent => !dirent.isDirectory()).map(dirent => dirent.name);
      var remote_files = fs.readdirSync('/config/menus/remote',{withFileTypes: true}).filter(dirent => !dirent.isDirectory()).map(dirent => dirent.name);
      io.sockets.in(socket.id).emit('renderconfig',remote_files,local_files);
    });
  });
  // When the endpoints content is requested send it to the client
  socket.on('getlocal', function(filename){
    // hard code for now
    var remotemenuversion = '1.04';
    request.get('https://raw.githubusercontent.com/netbootxyz/netboot.xyz/development/endpoints.yml', function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var endpoints = yaml.safeLoad(body);
            io.sockets.in(socket.id).emit('renderlocal',endpoints,remotemenuversion);
        }
    });
  });
});

//// Functions ////
function layermenu(callback){
  var local_files = fs.readdirSync('/config/menus/local',{withFileTypes: true}).filter(dirent => !dirent.isDirectory()).map(dirent => dirent.name);
  var remote_files = fs.readdirSync('/config/menus/remote',{withFileTypes: true}).filter(dirent => !dirent.isDirectory()).map(dirent => dirent.name);
  for (var i in remote_files){
    var file = remote_files[i];
    fs.copyFileSync('/config/menus/remote/' + file, '/config/menus/' + file);
  }
  for (var i in local_files){
    var file = local_files[i];
    fs.copyFileSync('/config/menus/local/' + file, '/config/menus/' + file);
  }
  callback(null, 'done');
}

// Spin up application on port 3000
http.listen(3000, function(){
  console.log('listening on *:3000');
});
