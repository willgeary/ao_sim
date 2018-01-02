/* 

   PJD Dykes
   #AccessibleOlli
   mvp4
   
   olli audio event agent
*/

var config = require("config");

var module_name = config.get("agents.olli_audio_agent.module_name");

var debug = require("debug")(module_name);
debug("Debug enabled in module: %s", module_name);

var prefix_text = "[" + config.get("agents.olli_audio_agent.module_Name") + "]";

var listener_target = config.get("global.nosql_url") +
    "/" +
    config.get("agents.event_manager.events_database");

var keep_audio_files_data = config.get("agents.olli_audio_agent.retain_audio_artifacts");

var keep_audio_files = false;

if (keep_audio_files_data == "true") {
    keep_audio_files = true;
}

debug(prefix_text, "Retain Audio FIles:", keep_audio_files);

console.log(prefix_text, "Listener target:", listener_target, "^c to exit");

var player = require('play-sound')(opts = {});

var fs = require('fs');

var watson = require('watson-developer-cloud');

var watson_url = config.get("agents.olli_audio_agent.watson_url");
var watson_username = config.get("agents.olli_audio_agent.watson_username");
var watson_password = config.get("agents.olli_audio_agent.watson_password");

var text_to_speech_cfg = {
    version: 'v1',
    url: watson_url,
    username: watson_username,
    password: watson_password
}

var watson_tts = watson.text_to_speech(text_to_speech_cfg);

var request = require('request');
var follow = require('follow');

var opts = {
    db: listener_target,
    since: 'now',
    include_docs: true
}; // Same options paramters as before
var feed = new follow.Feed(opts);


// setup queuing, for voice, only one at a time via speaker...

var Queue = require('better-queue');

// async waterfall

var async = require('async');
var waterfall = require('async-waterfall');


function evaluate_data(event_body, callback) {
    debug(prefix_text, "Phase 1: Evaluate audio play request:", JSON.stringify(event_body, null, 4));
    callback(null, event_body);
}

function convert_text_to_speech(event_body, callback) {

    debug(prefix_text, "Phase 2: Convert text to speech:", JSON.stringify(event_body, null, 4));

    if (!event_body.payload.hasOwnProperty("text")) {
        if (event_body.payload._event_type == "telemetry_rule_event") {
            event_body.payload['text'] = "Audio Error. Missing audio text for telemetry event, at offset " + event_body.payload._offset + ".";
        }
        if (event_body.payload._event_type == "simulation_rule_event") {
            event_body.payload['text'] = "Audio Error. Missing audio text for simulation event, at delta time " + event_body.payload._simulation_delta_time + ".";
        }
    }

    if (!event_body.payload.hasOwnProperty("accept")) {
        event_body.payload['accept'] = "audio/mp3";
    }

    var audio_params = {
        text: event_body.payload.text,
        accept: event_body.payload.accept
    };

    event_body.payload['audio_params'] = audio_params;

    debug(prefix_text, "event_body:", JSON.stringify(event_body, null, 4));

    watson_tts
        .synthesize(audio_params, function (err, audio) {
            if (err) {
                console.log(prefix_text, "Audio content creation error:", err);
                callback(err, null);
            } else {
                try {  // some bugs in this, in sdk, eat error for now
                    watson_tts.repairWavHeader(audio);
                } catch (err) {
                    console.log(prefix_text, "Error adjusting headering, pursue later", err);
                }
                
                /*
                if (event_body.payload._event_type == "telemetry_rule_event") {
                    event_body.payload['filename'] = "telemetry_event_" +
                        event_body.payload._offset.toString() +
                        "_" +
                        event_body.payload._simulation_real_time.toString() +
                        ".mp3";
                }
                if (event_body.payload._event_type == "simulation_rule_event") {
                    event_body.payload['filename'] = "simuluation_event_" +
                        event_body.payload._simulation_delta_time.toString() +
                        "_" +
                        event_body.payload._simulation_real_time.toString() +
                        ".mp3";
                } +
                fs.writeFileSync(event_body.payload.filename, audio);
                
                */
                
                callback(null, event_body, audio);
                // fs.writeFileSync('audio.wav', audio);
            }
        });
}

// skip for now, evaluating

function correct_audio_header(event_body, audio, callback) {
    // debug(prefix_text, "Phase 2a: Update header for audio:", JSON.stringify(event_body, null, 4));
    // watson_tts.repairWavHeader(audio);
    callback(null, event_body, audio);
    /*
    watson_tts.repairWavHeader(audio, function (err, audio_hdr_fix_result) {
        if (err) {
            console.log(prefix_text, "Error updating header:", err);
            callback(err, null);
        } else {
            console.log('corrected audio wav header');
            callback(null, event_body, audio_hdr_fix_result);
        }
    });
    */
}

function write_audio_to_file(event_body, audio, callback) {

    debug(prefix_text, "Phase 3: Write audio file:", JSON.stringify(event_body, null, 4));


    // create filename

    if (event_body.payload._event_type == "telemetry_rule_event") {
        event_body.payload['filename'] = "telemetry_event_" +
            event_body.payload._offset.toString() +
            "_" +
            event_body.payload._simulation_real_time.toString() +
            ".mp3";
    }
    if (event_body.payload._event_type == "simulation_rule_event") {
        event_body.payload['filename'] = "simuluation_event_" +
            event_body.payload._simulation_delta_time.toString() +
            "_" +
            event_body.payload._simulation_real_time.toString() +
            ".mp3";
    }

    fs.writeFile(event_body.payload.filename, audio, function (err) {
        if (err) {
            console.log(prefix_text + "Error writing audio event file for:" + event_body.payload.filename);
            callback(err, null);
        } else {
            callback(null, event_body);
        }
    });
    
}

function play_audio(event_body, callback) {
    debug(prefix_text, "Phase 4: Play sound", JSON.stringify(event_body, null, 4));

    try {
        debug(prefix_text + "Playing audio files:", event_body.payload.filename);
        player.play(event_body.payload.filename, {}, function (err) {
            if (err) {
                debug(prefix_text + "Audio playback error:", err);
                callback(err);
            } else {
                callback(null, event_body);
            }
        });
    } catch (err) {
        debug(prefix_text, "Audio Play Error:", error);
        callback(err, null);
    }
}


function confirm_playback(event_body, callback) {

    debug(prefix_text, "Phase 5: Audio playback complete:", JSON.stringify(event_body, null, 4));
    if (!keep_audio_files) {
        fs.unlink(event_body.payload.filename, function (err) {
            if (err) {
                console.log(prefix_text, "Audio removeal error:", err);
                callback(null, event_body); // not making error
            } else {
                console.log(prefix_text, 'Audio file deleted successfully:', event_body.payload.filename);
                callback(null, event_body);
            }
        });
    } else {
        console.log(prefix_text, 'Audio file preserved successfully:', event_body.payload.filename);
        callback(null, event_body);
    }
}


function audio_out(event_body, callback) {
    try {
        debug(prefix_text, "Incoming audio event:", event_body);
        waterfall([
             async.apply(evaluate_data, event_body),
             convert_text_to_speech,
             /* correct_audio_header,   - may add back */
             write_audio_to_file, // will be caching these
             play_audio,
             confirm_playback
            ],
            function (err, results) {
                debug(prefix_text, "Event result:", JSON.stringify(results, null, 4));
                if (err !== null) {
                    debug("Error Result:",
                        err);
                    callback(null, results);
                } else {
                    // play static content previously stored 
                    console.log(prefix_text, "TBD Read Static Stored Data:" + JSON.stringify(results, null, 4));
                    callback(err, null);
                }
            });
    } catch (err) {
        debug(prefix_text, "Error on audio play:", err);
        callback(err, null);
    }
}


// lets funnell all playback requests one at a time to audio device
// defaults to 1 at a time...

var voice_playback_queue = new Queue(function (input, cb) {
    audio_out(input, function () {
        console.log(prefix_text, "Voice Play Queue entry queued");
        cb();
    });
}, {
    failTaskOnProcessException: false,
    autoResume: true
});

voice_playback_queue.on('empty', function () {
    console.log(prefix_text, "Audio queue now empty");
});


voice_playback_queue.on('drain', function () {
    console.log(prefix_text, "Audio queue now drained");
});


// ---------------------------------------------------

feed.on('change', function (change) {
    if (change.doc.payload.hasOwnProperty("type") &&
        change.doc.payload.type == "audio")

    {
        console.log(prefix_text, "***Audio Event to be queued:", JSON.stringify(change.doc, null, 4));

        // audio_out(change.doc);
        voice_playback_queue.push(change.doc)
            .on('finish', function () {
                console.log(prefix_text, "Audio event success.");
            })
            .on('failed', function () {
                onsole.log(prefix_text, "Audio event failed.");
            })
    }
});

feed.on('error', function (er) {
    console.error('Since Follow always retries on errors, this must be serious', er);
    // throw er;
});

feed.follow();