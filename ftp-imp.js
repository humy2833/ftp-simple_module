'use strict';
var util = require('util');
var ftpimp  = require('ftpimp');
var Queue = ftpimp.Queue;
var loop = require('easy-loop');
var EventEmitter = require('events');
var pathUtil = require('./lib/path-util');
var fileUtil = require('./lib/file-util');

/**
 * ftpimp 모듈을 이용한 FTP 모듈로서 기본 ftp 모듈이 안될때는 이걸로 해보자.
 * 예) 000webhost 일때
 * @param {object} config 
 */
function FTP(config){
	if(!this instanceof FTP) throw "must 'FTP.create(config)'";
	EventEmitter.call(this);
	if(config.username) config.user = config.username;
	if(config.password) config.pass = config.password;
	if(!config.host) config.host = "127.0.0.1";
	if(!config.port) config.port = 21;
	this.currentPath = "/";
	this.isPasv = false;
	this.isLoginFail = false;
	this.waitCount = 0;
	this.isConnect = false;
	if(config.debugMode === true) config.debug = true;
	this.client = ftpimp.create(config, false);
	this.client.connect(() => {
		this.init(config);
	});
	process.on("uncaughtException", err => {
		this.emit("error", err);
	});
}
util.inherits(FTP, EventEmitter);

FTP.prototype.init = function(config){
	var self = this;
	var p = "/";
	if(config.path)	p = this.getRealRemotePath(config.path);
	this.cd(p, function(err, path){
		if(!err) body();
		else
		{
			self.cd("/", function(err, path){
				if(!err) body();
				else self.emit("error", err);
			});
		}
		function body(){
			self.isConnect = true;
			self.currentPath = p;
			self.isPasv = true;
			self.emit("open", self.client);
			self.emit("ready", self.client);
		}
	});
};
FTP.prototype.waitConnect = function(cb){
	var self = this;
	if(this.isLoginFail || this.waitCount >= 50)
	{
		this.close();
		return;
	}
	if(!this.isConnect)
	{
		this.waitCount++;
		setTimeout(function(){
			self.waitConnect(cb);
		}, 500);
	}
	else
	{
		this.waitCount = 0;
		cb();
	}
};
FTP.prototype.cd = function(path, cb){
	var self = this;
	var p = this.getRealRemotePath(path);
	this.client.chdir(p, function(err, path){
		if(!err) self.currentPath = p;
		if(cb)cb(err, err ? null : p);
	}, Queue.RunNow);
};
FTP.prototype.rm = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.rm(path, cb);
		});
		return;
	}
	var p = this.getRealRemotePath(path);
	this.client.unlink(p, function(err, path){
		if(err && err.message.indexOf("Invalid argument") > -1)
		{
			deleteChild(p, function(err){
				if(!err)
				{
					self.client.rmdir(p, function(err){
						if(cb) cb(err);
					}, true);
				}
				else if(cb) cb(err);
			});
		}
		else
		{
			if(cb) cb(err);
		}
	});
	
	function deleteChild(path, cb){		
		self.ls(path, function(err, list){
			if(!err)
			{
				loop(list, function(i, value, next){
					self.rm(path + "/" + value.name, function(err){
						next(err);
					});
				}, function(err){
					if(cb)cb(err);
				});
			}
			else if(cb) cb(err);
		});
	}	
};
FTP.prototype.mkdir = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.mkdir(path, cb);
		});
		return;
	}
	var p = this.getRealRemotePath(path);
	this.exist(p, function(result){
		if(!result)
		{
			self.client.mkdir(p, function(err){
				if(err)
				{
					var arr = p.split("/");
					var i = 2, len = arr.length;
					var errorCnt = len - i;
					loop(function(){
						return i <= len;
					}, function(next){
						var pp = arr.slice(0, i).join("/");
						self.client.mkdir(pp, function(err){
							if(err) errorCnt--;
							i++;
							next();
						});
					}, function(err){
						if(cb) cb(len > 2 && errorCnt < 0 ? "mkdir fail : " + p : err);
					});
				}
				else if(cb)cb(err);
			}, true);
		}
		else if(cb) cb(undefined);
	});
};
FTP.prototype.mv = function(oldPath, newPath, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.mv(oldPath, newPath, cb);
		});
		return;
	}
	var op = this.getRealRemotePath(oldPath);
	var np = this.getRealRemotePath(newPath);
	this.client.rename([op, np], function(err, res){
		if(cb) cb(err, np);
	});
};
FTP.prototype.lsAll = function(path, cb){
	var self = this;
	var arr = [];
	path = this.getRealRemotePath(path);
	self.ls(path, function(err, list){
		if(err)	cb(err, list);
		else
		{
			loop(list, function(i, value, next){
				let newPath = pathUtil.join(path, value.name);
				if([".", ".."].indexOf(value.name) > -1) next();
				else if(value.type === 'd')
				{
					self.lsAll(newPath, function(err, list){
						if(list.length === 0) arr.push(newPath);
						arr = arr.concat(list);
						next();
					});
				}
				else
				{
					arr.push(newPath);
					next();
				}
			}, function(err){
				if(cb) cb(err, arr);
			});
		}
	});
}
FTP.prototype.ls = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.ls(path, cb);
		});
		return;
	}
	var p = this.getRealRemotePath(path);
	this.client.ls(p, function(err, data){
		if(!err)
		{	
			if(cb) cb(err, parsePasvListFromArray(data));
		}
		else if(cb) cb(err);
	});
};
FTP.prototype.pwd = function(cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.pwd(cb);
		});
		return;
	}
	this.client.getcwd(function(err, path){
		if(cb) cb(err, path);
	});
};
FTP.prototype.isDir = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.isDir(path, cb);
		});
		return;
	}
	var p = this.getRealRemotePath(path);
	this.ls(p, function(err){
		if(cb) cb(err ? false : true);
	});
}
FTP.prototype.exist = function(path, cb){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.exist(path, cb);
		});
		return;
	}
	var p = this.getRealRemotePath(path);
	var result = false;
	this.ls(pathUtil.getParentPath(p), function(err, list){
		if(!err)
		{
			for(var i=0; i<list.length; i++)
			{
				if(list[i].name == pathUtil.getFileName(p)) 
				{
					result = true;
					break;
				}
			}
			if(cb) cb(result);
		}
		else if(cb) cb(result);
	});
};

FTP.prototype.upload = function(localPath, remotePath, cb, isRecursive){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.upload(localPath, remotePath, cb, isRecursive);
		});
		return;
	}
	var cwd = this.currentPath;
	if(localPath instanceof Array)
	{
		if(typeof remotePath === 'function')
		{
			cb = remotePath;
			remotePath = null;
		}
		loop(localPath, function(i, value, next){
			var local = value;
			var remote = remotePath;
			if(typeof value === 'object')
			{
				local = value.local;
				remote = value.remote;
			}
			self.upload(local, remote, function(err){
				next(err);
			});
		}, function(err){
			self.cd(cwd, function(){
				if(cb)cb(err);
			});
		});
		return;
	}
	localPath = pathUtil.normalize(localPath);
	if(/\/\*{1,2}$/.test(localPath))
	{
		isRecursive = true;
		localPath = localPath.replace(/\/\*{1,2}$/, '');
	}
	remotePath = this.getRealRemotePath(remotePath);
	fileUtil.isDir(localPath, function(err, isDir){
		if(isDir)
		{
			if(!isRecursive)
			{
				isRecursive = pathUtil.getFileName(localPath) == pathUtil.getFileName(remotePath);
			}
			var parent = pathUtil.normalize(remotePath + (isRecursive ? "" : "/" + pathUtil.getFileName(localPath)));
			self.cd(parent, function(err){
				if(err)	
				{	
					self.mkdir(parent, function(err){
						if(err) 
						{
							self.cd(cwd, function(e){
								if(!e) bodyDir();
								else if(cb)cb(err);
							});
						}
						else
						{
							self.emit("upload", parent);
							bodyDir();
						}
					});
				}
				else bodyDir();
			});
			
			function bodyDir(){
				fileUtil.ls(localPath, function(err, list){
					loop(list, function(i, value, next){
						self.upload(localPath + "/" + value, parent + "/" + value, function(err){
							next(err);
						}, true);
					}, function(err){
						self.cd(cwd, function(){
							if(cb)cb(err);
						});
					});
				});
			}	
		}
		else
		{
			if(!isRecursive)
			{
				self.cd(remotePath, function(err){
					if(!err)
					{
						remotePath = pathUtil.normalize(remotePath + "/" + pathUtil.getFileName(localPath));
					}
					var parent = pathUtil.getParentPath(remotePath);
					self.cd(parent, function(err){
						if(err)	
						{
							self.mkdir(parent, function(err){
								if(err) 
								{
									self.cd(cwd, function(e){
										if(!e) uploadFile();
										else if(cb)cb(err);
									});
								}
								else
								{
									self.emit("upload", parent);
									uploadFile();
								}
							});
						}
						else uploadFile();
					});
				});
			}
			else uploadFile();
		}
	});

	function uploadFile(){
		self.client.put([localPath, remotePath], function(err, path){
			if(!err) self.emit("upload", remotePath);
			self.cd(cwd, function(){
				if(cb)cb(err);
			});
		});
	}
};
FTP.prototype.download = function(remotePath, localPath, cb, isRecursive){
	var self = this;
	if(!this.isConnect)
	{
		this.waitConnect(function(){
			self.download(remotePath, localPath, cb, isRecursive);
		});
		return;
	}
	var cwd = this.currentPath;
	if(remotePath instanceof Array)
	{
		if(typeof localPath === 'function')
		{
			cb = localPath;
			localPath = null;
		}
		loop(remotePath, function(i, value, next){
			var local = localPath;
			var remote = value;
			if(typeof value === 'object')
			{
				local = value.local;
				remote = value.remote;
			}
			self.download(remote, local, function(err){
				next(err);
			});
		}, function(err){
			self.cd(cwd, function(){
				if(cb)cb(err);
			});
		});
		return;
	}
	remotePath = this.getRealRemotePath(remotePath);
	var tempLocalPath = localPath;
	localPath = pathUtil.normalize(localPath);
	if(/\/\*{1,2}$/.test(remotePath))
	{
		isRecursive = true;
		remotePath = remotePath.replace(/\/\*{1,2}$/, '');
	}
			
	this.cd(remotePath, function(err, path){
		if(err)
		{
			if(!isRecursive)
			{
				fileUtil.isDir(localPath, function(err, isDir){
					if(isDir)
					{
						localPath = pathUtil.normalize(localPath + "/" + pathUtil.getFileName(remotePath));
						bodyFile();
					}
					else
					{
						if(/\/$/.test(tempLocalPath))
						{	
							fileUtil.mkdir(tempLocalPath, function(){
								localPath = tempLocalPath + pathUtil.getFileName(remotePath);
								bodyFile();
							});
						}
						else
						{
							fileUtil.mkdir(pathUtil.getParentPath(localPath), function(){
								bodyFile();
							});
						}
					}
				});
			}
			else bodyFile();
		}
		else
		{
			if(!isRecursive)
			{
				isRecursive = pathUtil.getFileName(localPath) == pathUtil.getFileName(remotePath);
			}
			var parent = pathUtil.normalize(localPath + (isRecursive ? "" : "/" + pathUtil.getFileName(remotePath)));
			fileUtil.exist(parent, function(bool){
				if(!bool)
				{
					fileUtil.mkdir(parent, function(){
						self.emit("download", parent);
						bodyDir(parent);
					});
				}
				else bodyDir(parent);
			});
		}
	});
	
	function bodyDir(parent){
		self.ls(remotePath, function(err, list){
			loop(list, function(i, value, next){
				self.download(remotePath + "/" + value.name, parent + "/" + value.name, function(err){
					next(err);
				}, true);
			}, function(err){
				self.cd(cwd, function(){
					if(cb)cb();
				});
			});
		});
	}
	
	function bodyFile(){
		self.client.save([remotePath, localPath], function(err, path){
			if(!err)self.emit("download", localPath);
			self.cd(cwd, function(){
				if(cb)cb(err);
			});
		});
	}
};
FTP.prototype.end = FTP.prototype.close = function(cb){
	var self = this;
	this.client.quit(function() {
			self.isConnect = false;
	    self.emit("close");
			if(cb) cb();
	});
};
FTP.prototype.getRealRemotePath = function(path){
	var p = path;
	if(path.indexOf("/") !== 0)
	{
		var tempCurrentPath = this.currentPath;
		if(path.indexOf("./") === 0 && path.length > 2)
		{
			path = path.substring(2);
		}
		var upIdx = path.indexOf("../");		
		while(upIdx === 0 && tempCurrentPath != "/")
		{
			tempCurrentPath = tempCurrentPath.substring(0, tempCurrentPath.lastIndexOf("/"));
			path = path.substring(3);
			upIdx = path.indexOf("../");
		}
		if(tempCurrentPath === '/') 	p = tempCurrentPath + path;
		else 	p = tempCurrentPath + "/" + path;		
	}
	if(p.length > 1 && /\/$/.test(p)) p = p.substring(0, p.length-1);
	return p;
};
function parsePasvListFromArray(list){
	var arr = [];
	for(var i=0, len=list.length; i<len; i++)
	{
		if([".", ".."].indexOf(list[i].filename) > -1) continue;
		list[i].type = list[i].isDirectory ? 'd' : 'f';
		list[i].size = parseInt(list[i].size);
		list[i].date = new Date(list[i].mtime);
		list[i].name = list[i].filename;
		arr.push(list[i]);
	}
	return arr;
}
module.exports = FTP;