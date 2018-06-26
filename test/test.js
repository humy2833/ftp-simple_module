var FTP = require('../main');
var config = {
	"host": "humy2833.dothome.co.kr",
	"port": 21,
	"user": "humy2833",
	"pass": "28332833"
};
var ftp = FTP.create(config);
ftp.on("open", function(client){
	console.log("event open", arguments.length);	
	ftp.cd('html', function(err){
		console.log(`cd : ${err}`);
		ftp.ls('.', function(err, list){
			console.log(`cd : ${err}, ${list}`);
			setTimeout(() => {
				end();
			}, 1000 * 60);
		});
	})
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

function end(){
	ftp.close();
}
