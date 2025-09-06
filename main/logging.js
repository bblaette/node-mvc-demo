
let config = require('../main/config.js');
let moment = require('moment');
let fs = require('fs');
var colors = require('colors/safe');

var log_level = config.get("log_level"); // e.g. 'debug' down to info
var log_compact = false;

module.exports = {
    info:    function(message) { log_for_level('info', message); },
    
    warn:    function(message) { log_for_level('warn', message); },
    
    error:   function(message) { log_for_level('error', message); },
    
    verbose: function(message) { log_for_level('verbose', message); },
    
    debug:   function(message) { log_for_level('debug', message); },
    
    silly:   function(message) { log_for_level('silly', message); },
    
    level:   function() { return log_level; },
    
    whiteout: whiteout
}

/* 
 * Module parameters and main function
 */
let debug_log_file = __dirname +'/../logs/debug.log';
let error_log_file = __dirname +'/../logs/error.log';
 
let log_value = { 
    error: 0, 
    warn: 1, 
    info: 2, 
    verbose: 3, 
    debug: 4, 
    silly: 5 
};

let log_color = {
    error:   function(m) { return colors.red(m) },
    warn:    function(m) { return colors.yellow(m) },
    info:    function(m) { return colors.green(m) },
    verbose: function(m) { return colors.cyan(m) },
    debug:   function(m) { return colors.blue(m) },
    silly:   function(m) { return colors.magenta(m) }
}

function log_for_level(level, message) { // main function observing log_level
    if (log_value[level] <= log_value[log_level]) {
        log_console(level, message); // console.log(message);
        log_files(level, message);
    }
}

function log_timestamp() {
    return moment().format('YYYY-MM-DD HH:mm:ss');
}

function log_console(level, message) { // console.log("...log_console()...");
    let use_color = true;
    let log_str = log_string(level, message, use_color);
    console.log(log_str);
}

function log_files(level, message) { // console.log("...log_files()...");
    let do_debug = log_value[level] <= log_value["silly"];
    let do_error = log_value[level] <= log_value["warn"];
    if (!do_debug && !do_error) { return; }
    
    let use_color = false;
    let log_str = log_string(level, message, use_color) +"\n";
    
    if (do_debug) {
        fs.appendFileSync(debug_log_file, log_str);
    }
    if (do_error) {
        fs.appendFileSync(error_log_file, log_str);
    }
}

function log_string(level, message, use_color) { // console.log("...log_string()...");
    if (typeof message == "object" && message !== null && typeof message.stack == "string"
        && typeof message.message == "string") { // console.log("Error object!");
        let info = typeof message.info == "string" ? message.info +"\n" : "";
        message = info + message.stack; // it's an Error object: take its stack
    }
    let msg_str = typeof message == "string" || typeof message == "number" ?
        message +"" : pretty_json(message, use_color);

    let timestamp = log_timestamp();
    let level_col = typeof use_color != "undefined" && use_color ?
        log_color[level](level) : level;
    let log_str = timestamp +" - "+ level_col +": "+ msg_str;
    
    return log_str;
}

function pretty_json(msg, use_color) {
    let do_color = typeof use_color != "undefined" && use_color;
    let json_str = JSON.stringify(msg, null, 2);
    if (log_compact) { json_str = compact_json_str(json_str); }
    
    if (!use_color || typeof json_str == "undefined") { 
        return json_str;
    }
    
    let json_color = json_str.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let colored = colors.magenta(match); // 'number'
        
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                colored = match; // colors.yellow(match); // 'key'
                
            } else {
                colored = colors.green(match); // 'string'
            }
        } else if (/true|false/.test(match)) {
            colored = colors.yellow(match); // 'boolean'
            
        } else if (/null/.test(match)) {
            colored = colors.red(match); // 'null'
        }
        return colored;
    });
    return json_color;
}

function compact_json_str(json_str) {
    if (json_str.length > 5 * 1024 * 1024) { return json_str; }
    
    let json_parts = json_str.split("\n");
    let json_compact = "";
    let was_short = false;
    let ref_len = 0;
    
    for (let i = 0; i < json_parts.length; i++) {
        let line = json_parts[i];
        let can_compact = i + 3 < json_parts.length && 
            ( line.trim() == "{" && (
                json_parts[i+1].trim().replace(",", "") == "}" ||
                json_parts[i+2].trim().replace(",", "") == "}" ||
                json_parts[i+3].trim().replace(",", "") == "}"
              ) || 
              line.trim() == "[" && (
                json_parts[i+1].trim().replace(",", "") == "]" ||
                json_parts[i+2].trim().replace(",", "") == "]" ||
                json_parts[i+3].trim().replace(",", "") == "]"
              ) 
            ) && 
            80 > line.length + json_parts[i+1].length + json_parts[i+2].length + json_parts[i+3].length;
        if (can_compact) {
            json_compact += line;
            let spaces = " ".repeat(3 - 1 - (line.length + json_parts[i+1].trim().length) % 3);
            do {
                i++; json_compact += " "+ json_parts[i].trim() + spaces;
                spaces = " ";
            } while (line.trim() + json_parts[i].trim().replace(",", "") != "[]" &&
                line.trim() + json_parts[i].trim().replace(",", "") != "{}")
            json_compact += "\n";
            continue;
        }
        
        let is_value = /^\s*\"/.test(line) || /^\s*[+\-]?[\.\d]/.test(line) || 
            /^\s*(true|false|null)/.test(line);
        if (is_value && /\[\s*$/.test(line) || is_value && /\{\s*$/.test(line)) {
            is_value = false;
        }
        
        let is_short = is_value && line.trim().length < 30 && line.length < 45;
        
        if (!is_short) {
            if (was_short) { json_compact += "\n"; }
            json_compact += line +"\n"; 
            ref_len = 0;
            was_short = false; 
            continue;
        }
        
        if (!was_short && is_short) {
            json_compact += line;
            ref_len = ref_len > 0 ? ref_len : Math.floor(1 + line.length/5) * 5 + 0;
            was_short = true;
            continue;
        }
        
        if (was_short && is_short) {
            let was_len = i > 0 ? json_parts[i-1].length : 0;
            ref_spaces = ref_len <= 0 ? 2 : 
                (was_len < ref_len ? ref_len - was_len : 2);
            let spaces = " ".repeat(ref_spaces);
            json_compact += spaces + line.trim() +"\n"; 
            was_short = false; 
            continue;
        }
    }
    return json_compact;
}


/*
 * White screen response when encoutering an error (for template rendering)
 */
function whiteout(err, res) { // console.log("...whiteout()..."); // console.log(err);
    log_for_level('error', err);
    return res.send(""); // wsod
    // return res.render('auth/unknown_page');
}
