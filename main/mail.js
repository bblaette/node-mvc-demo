
require('dotenv').config();
let mailer = require('nodemailer'); // https://nodemailer.com/smtp/
let log = require('../main/logging.js');

module.exports = {    
    init: init,
    
    send: send
}

/*
 * Global parameters
 */
let log_level = log.level();
let debug = ["verbose", "debug", "silly"].indexOf(log_level) > -1;

var transport = {
    // pool: true, // do _NOT_ specify -> service: "gmail"!
    host: process.env.MAIL_HOST || "smtp-relay.gmail.com",
    port: parseInt(process.env.MAIL_PORT) || 587,
    name: process.env.MAIL_NAME || "node-mvc.example.com",
    // secure: true, // use tls
    /* tls: {
        maxVersion: 'TLSv1.3',
        minVersion: 'TLSv1.2',
        ciphers: 'TLS_AES_128_GCM_SHA256',
    }, */
    logger: debug, // if set to true then logs to console
    debug:  debug
};

// Add auth credentials if provided
if (process.env.MAIL_USER && process.env.MAIL_PASS) {
    transport.auth = {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    };
}

// var from = "";
var options = {
    from: "Node MVC Team <node-mvc.example.com>",
    to: "",
    subject: "Test",
    text: "Hi, this is an email test...",
    /* html also works! example below:
    html: '<b>Hello!</b><br /> This is an email test<br /><img src="cid:001-logo.png" alt="node-mvc-logo" />',
    attachments: [{
        cid: '001-logo.png', // skip if not embedded in html
        filename: 'node_mvc_logo.png',
        path: __dirname + '/../public/img/node_mvc_logo.png'
    }] // there could be more attachments in the array
    */
};

var transportHandler = null;

/*
 * Initialize transport (allows overriding default parameters)
 */
function init(transport_conf, from_addr) {
    if (typeof transport_conf != "object") { return false; }
    
    transport = Object.assign({}, transport, transport_conf);

    if (typeof from_addr == "string") { 
        options.from = from_addr;
    }

    transportHandler = mailer.createTransport(transport);

    return true;
}

/*
function attachments(one_or_more_attachments) {
    let opt_copy = JSON.parse(JSON.stringify(options)); // copy default
    let attach_arr = Array.isArray(one_or_more_attachments) ? 
        one_or_more_attachments : [one_or_more_attachments];
    if (attach_arr.length > 0 && !opt_copy.hasOwnProperty(attachments)) {
        opt_copy.attachments = [];
    }
    for (let i = 0; i < attach_arr.length; i++) {
        opt_copy.attachments.push(attach_arr[i]);
    }
    return opt_copy; // use opt_copy to call send(opts)
}
*/

/*
 * Main send function
 */
function send(to_or_options, subject_or_attachments_or_callback, text, attachments_or_callback, or_callback) {
    log.debug("transport:"); log.debug(transport);
    // log.debug("send to... "); log.debug(to_or_options);
    if (transportHandler === null) {
        transportHandler = mailer.createTransport(transport);
    }
    let opts = {}; // need individual variable for async calls
    if (typeof to_or_options == "object") {
        opts = Object.assign({}, options, to_or_options);

    } else if (typeof to_or_options == "string") {
        opts = Object.assign({}, options);
        opts.from = options.from;
        opts.to = to_or_options;
        if (typeof subject_or_attachments_or_callback == "string") {
            opts.subject = subject_or_attachments_or_callback;
        }
        if (typeof text == "string") { // assuming plain text
            opts.text = text;
        }

    } else {
        log.error("Invalid mail parameters for send() specified")
        return false;
    }
    if (typeof subject_or_attachments_or_callback == "object") {
        opts.attachments = subject_or_attachments_or_callback;

    } else if (typeof attachments_or_callback == "object") {
        opts.attachments = attachments_or_callback;
    }
    if (opts.hasOwnProperty('attachments') && !Array.isArray(opts.attachments)) {
        opts.attachments = [opts.attachments];
    }
    log.debug("send() options:"); log.debug(opts);

    transportHandler.sendMail(opts, (error, info) => {
        if (error) {
            log.error(error);

        } else {
            log.info("Email dispatch to "+ opts.to +", status: "+ info.item);
        }
        if (typeof subject_or_attachments_or_callback == "function") {
            subject_or_attachments_or_callback(error, info, opts);

        } else if (typeof attachments_or_callback == "function") {
            attachments_or_callback(error, info, opts);

        } else if (typeof or_callback == "function") {
            or_callback(error, info, opts);
        }
        return error ? false : true;
    });
}
