var request = require('request');
var cli = require('commander');
var async = require('async');
var targz = require('tar.gz');
var pkg = require('./package.json');

var fs = require('fs');
var path = require('path');

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
var delayBetweenCalls = 3000;

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
			async.waterfall([
				function downloadWoff(cbf) {
					console.log('Downloading "'+file.name+'" in WOFF format.');

					var woffFile = 'fonts/woff/'+file.name+'.'+fontFormat;
					request({
						method: 'GET',
						uri: file.url,
						jar: cookies
					}).pipe(fs.createWriteStream(woffFile));

					cbf(null, woffFile);
				},

				function send2Converter(woffFile, cbf) {
					// Convert font to TTF (https://www.mashape.com/warting/online-font-converter)
					console.log('Converting "'+file.name+'" to TTF format.');

					var r = request({
						method: 'POST',
						url: 'https://ofc.p.mashape.com/directConvert/',//http://requestb.in/p426qzp4
						headers: {
					        'X-Mashape-Authorization': 'ugMVmnJS66Ge32taP76XTBnKKOxJ3PLR'
					    },
					    encoding: null
					}, function (error, response, targzFileBuffer) {
						console.log(error);
						console.log(response);
						console.log(targzFileBuffer);
						cbf(null, targzFileBuffer);
					});

					var form = r.form();
					form.append('format', 'ttf');
					form.append('file', fs.createReadStream(path.join(__dirname, woffFile)));

					console.log(path.join(__dirname, woffFile));

					/*var Request = unirest.post('https://ofc.p.mashape.com/directConvert/')
						.headers({ 
							'X-Mashape-Authorization': 'ugMVmnJS66Ge32taP76XTBnKKOxJ3PLR'
						})
						.field('format', 'ttf')
						.attach('file', '../../'+)
						.end(function (response) {
							console.log(response.body);
							cbf(null, response.response.body);
						});*/
				},

				function saveTarGz(body, cbf) {
					console.log('Save tar.gz for "'+file.name+'" font.');
					var tarGzFile = 'fonts/tmp/'+file.name+'.tar.gz';
					fs.writeFile(tarGzFile, body, function (err) {
						if (err) throw err;

						cbf(null, tarGzFile);
					});
				},

				function extractTarGz(tarGzFile, cbf) {
					console.log('Extract tar.gz for "'+file.name+'" font.');
					var extractedFolder = './fonts/tmp/'+file.name;
					var compress = new targz().extract(tarGzFile, extractedFolder, function(err){
						if (err) throw err;

						cbf(null, extractedFolder);
					});
				},

				function moveTTF(extractedFolder, cbf) {
					console.log('Move TTF for "'+file.name+'" font.');
					var ttfFile = './fonts/ttf/'+file.name+'.ttf';
					fs.rename(extractedFolder+'/onlinefontconverter.com/converted-files'+file.name+'.ttf', ttfFile, function(err) {
						if (err) throw err;

						cbf(null, ttfFile);
					});
				}
			], function(err) {
				setTimeout(function() {
					cb(null);
				}, delayBetweenCalls);
			});			
		}, function(err) {
			console.log('Done.');
			callback(err);
		});
	}
], function(error) {
	console.log('Successfully downloaded fonts !');
});


