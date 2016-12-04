var https = require('https');
var qs = require('querystring');
var AWS = require('aws-sdk');
var polly = new AWS.Polly({apiVersion: '2016-06-10'});
var s3 = new AWS.S3();

exports.handler = (event, context, callback) => {
    try{
        console.log(JSON.stringify(event));
    
        // Lauch Request
        if (event.request.type == 'LaunchRequest') {
            // Initialize Session
            var body = '';
            var lang         = process.env.lang;
            callback(null, reprompt(lang, "Translate to Japanese. Please speak English text"));
        
        // Session End
        }else if(event.request.type == 'SessionEndedRequest'){
            callback(null, endSession("Good bye"));
        
        // Language Intent
        }else if(event.request.intent.name == 'LanguageIntent'){
            var lang = event.session.attributes.lang;
            if(lang_list[event.request.intent.slots.Lang.value]){
                var lang = lang_list[event.request.intent.slots.Lang.value];
                callback(null, reprompt(lang, "Translate to " + event.request.intent.slots.Lang.value + ". Please speak English text"));
            }else{
                callback(null, reprompt(lang, event.request.intent.slots.Lang.value + " is not supported."));
            }
        
        // Stop Intent
        }else if(event.request.intent.name == 'AMAZON.StopIntent'){
            callback(null, endSession("Good bye"));
        
        // Translate Intent
        }else{
            // Merge Original Message
            const slots = event.request.intent.slots;
            const orig_text = 
                (slots.TextA.value ? slots.TextA.value : "")
                + (slots.TextB.value ? " " + slots.TextB.value : "")
                + (slots.TextC.value ? " " + slots.TextC.value : "")
                + (slots.TextD.value ? " " + slots.TextD.value : "")
                + (slots.TextE.value ? " " + slots.TextE.value : "")
                + (slots.TextF.value ? " " + slots.TextF.value : "")
                + (slots.TextG.value ? " " + slots.TextG.value : "")
                + (slots.TextH.value ? " " + slots.TextH.value : "");
            console.log(`event.request.intent.slots.Text=${orig_text}`);
            var lang         = event.session.attributes.lang;
            var orig_lang    = event.request.locale.split('-')[0];
            
            // Translate
            var options = "key=" + process.env.client_secret + "&source="+ orig_lang + "&target=" + lang + "&q=" + qs.escape(orig_text);
            console.log(options);
            var tran_text = '';
            var req = https.request({
	            host: 'www.googleapis.com',
	            path: "/language/translate/v2?" + options,
	            method: 'GET'
            }, function (res) {
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    tran_text += chunk;
                }).on('end', function () {
                    console.log(`Translated=${tran_text}`);
                	tran_text = JSON.parse(tran_text);
                    if(tran_text.data && tran_text.data.translations){
                        tran_text = tran_text.data.translations[0].translatedText;
                        
                        // Get Pronounce
                        var params = {
                            OutputFormat: 'mp3',
                            Text: tran_text,
                            VoiceId: 'Mizuki',
                            TextType: 'text'
                        };
                        polly.synthesizeSpeech(params, function(err, sound) {
                            if (err){
                                console.log(err, err.stack); // an error occurred  
                                callback(null, endSession("Polly can't read it."));
                            }else{
                                console.log(sound);
                                
                                //PUT Object
                                var params = {
                                    Bucket: process.env.bucket,
                                    Key: event.request.requestId, /* reques id as object key */
                                    ACL: 'public-read',
                                    Body: sound.AudioStream,
                                    ContentType: sound.ContentType
                                };
                                s3.putObject(params, function(err, data) {
                                    if (err){
                                        console.log(err, err.stack);
                                        callback(null, endSession("Polly can't read it."));
                                    } else {
                                        console.log(data);
                                        callback(null, response(lang, tran_text, event.request.requestId));
                                    }
                                });
                            }
                        });                                
                    }else{
                        callback(null, endSession("Translator is busy now, please try later"));
                    }
                });
            }).on('error', function (err) {
                callback(null, endSession("Translator is busy now, please try later"));
            });
            req.end();
        } 
    } catch (err) {
        console.log(err);
        callback(err);
    }
};  

function reprompt(lang, output){
    return {
        "version": "1.0",
        "sessionAttributes": {"lang": lang},
        "response": {
            outputSpeech: {
                type: 'PlainText',
                text: output
            },
            card: {
                type: "Simple",
                title: "Translator",
                content: output
            },
            reprompt: {
                outputSpeech: {
                    type: 'PlainText',
                    text: output,
                }
            },
            shouldEndSession: false
        }
    };
}


function endSession(output){
    return {
        "version": "1.0",
        "response": {
            outputSpeech: {
                type: 'PlainText',
                text: output
            },
            card: {
                type: "Simple",
                title: "Translator",
                content: output
            },
            shouldEndSession: true
        }
    };
}

function response(lang, output, s3_key) {
    return {
        "version": "1.0",
        "sessionAttributes": {"lang": lang},
        "response": {
            outputSpeech: {
                type: 'SSML',
                ssml: "<speak><audio src=\"https://s3.amazonaws.com/" + process.env.bucket + "/" + s3_key + "\" /></speak>"
            },
            card: {
                type: "Simple",
                title: "Translator",
                content: output
            },
            shouldEndSession: false
        }
    };

}

const lang_list = {
	"Arabic": "ar",
	"Chinese": "zh-CN",
	"Danish":"da",
	"Dutch": "nl",
	"French": "fr",
	"German": "de",
	"Italian": "it",
	"Japanese": "ja",
	"Russian": "ru",
	"Spanish": "es",
	"Turkish": "tr"
};
