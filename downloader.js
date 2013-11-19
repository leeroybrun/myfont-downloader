var request = require('request');
var cli = require('commander');
var async = require('async');
var pkg = require('./package.json');

var fs = require('fs');

cli
	.version(pkg.version)
	.usage('[options] "http://www.myfonts.com/fonts/.../..."')
	.option('-f, --format [type]', 'Select the font format [ttf, woff, eot]')
	.parse(process.argv);

if(cli.args.length == 0) {
	cli.help();
}

if(('format' in cli) === false) {
	var fontFormat = 'woff';
} else {
	var fontFormat = cli.format;
}

var cookies = request.jar();
var delayBetweenCalls = 5000;

console.log('Start programm...');

async.waterfall([
	// Get font page and parse it to get CSS file URL
	function getCssFileUrl(callback) {
		console.log('Get CSS file from main URL...');

		request({
			method: 'GET',
			uri: cli.args[0],
			jar: cookies
		}, function(error, response, body) {
			if(response.statusCode != 200) {
				console.log('Error, can\'t fetch the font page.');
				process.exit(1);
			}

			var cssFile = (new RegExp("easy.myfonts.net(.+)'")).exec(body)[1];
			cssFile = 'http://easy.myfonts.net'+ cssFile;

			console.log('Done. Waiting '+ delayBetweenCalls/1000 +' seconds before next call.');

			setTimeout(function() {
				callback(null, cssFile);
			}, delayBetweenCalls);
		});
	},

	function getCssFileContent(fileUrl, callback) {
		console.log('Get CSS file content...');

		request({
			method: 'GET',
			uri: fileUrl,
			jar: cookies
		}, function(error, response, body) {
			if(response.statusCode != 200) {
				console.log('Error, can\'t fetch the css file.');
				process.exit(1);
			}

			console.log('Done. Waiting '+ delayBetweenCalls/1000 +' seconds before next call.');

			setTimeout(function() {
				callback(null, body);
			}, delayBetweenCalls);
		});
	},

	function parseCssFile(fileContent, callback) {
		console.log('Parse CSS file...');

		var fonts = fileContent.match(/{([^}]+)}/g);

		var fontsFiles = [];
		
		for(var i = 0; i < fonts.length; i++) {
			var fontName = (new RegExp("font-family: '([^']+)'")).exec(fonts[i])[1];
			var fontUrl = (new RegExp("/v2/"+ fontFormat +"\\?([^)]+)\\)")).exec(fonts[i])[1];

			fontUrl = 'http://easy.myfonts.net/v2/'+ fontFormat +'?'+ fontUrl;

			fontsFiles.push({
				name: fontName,
				url: fontUrl
			});
		}

		console.log('Done.');

		callback(null, fontsFiles);
	},

	function downloadFonts(files, callback) {
		console.log('Start download of fonts files...');

		async.eachSeries(files, function(file, cb) {
			console.log('Downloading "'+file.name+'".');
			request({
				method: 'GET',
				uri: file.url,
				jar: cookies
			}).pipe(fs.createWriteStream('fonts/'+file.name+'.'+fontFormat));

			setTimeout(function() {
				cb(null);
			}, delayBetweenCalls);
		}, function(err) {
			console.log('Done.');
			callback(err);
		});
	}
], function(error) {
	console.log('Successfully downloaded fonts !');
});


