var FTP = require('../ftp');
var config = {
	"host": "localhost",
	"port": 21,
	"user": "",
	"pass": ""
};

var ftp = new FTP(config);
ftp.on("open", function(){
	console.log("event open", arguments.length);	
});
ftp.on("error", function(){
	console.log("event error", arguments);
});
ftp.on("download", function(){
	console.log("event download", arguments);
});
ftp.on("upload", function(){
	console.log("event upload", arguments);
});
ftp.on("close", function(){
	console.log("event close", arguments.length);
});
ftp.ls(".", function(err, list){
	console.log("ls", JSON.stringify(arguments));
	end();
});
function end(){
	ftp.close();
}
