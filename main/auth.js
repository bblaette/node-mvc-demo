
let session = require('express-session');
let crypto = require('crypto');
let bcrypt = require("bcryptjs");
let log = require('../main/logging.js');

module.exports = {
    check: check,
    
    login: login,
    
    logout: logout,
    
    deny: deny,

    unknown: unknown,     
    
    user: user, 
    
    meta: meta,
    
    meta_flush: meta_flush,
    
    elapsed: elapsed
}

/*
 * Check session exists and if user is allowed to access the page
 * TODO: use init(params) to specify individual access permissions
 */
function check(req, res, next) { // log.debug("auth.check()"); log.debug(req.session);
    let session_complete = req.hasOwnProperty("session") && 
        req.session.hasOwnProperty("user") && 
        req.session.hasOwnProperty("login_id") &&
        req.session.user.hasOwnProperty("id");
    if (!session_complete) { return deny(req, res); }
    // log.debug("session complete");
    
    let user_id = req.session.user.id.toString();
    let user_id_len = user_id.length;
    let login_id = req.session.login_id;
    let login_id_suffix = login_id.substr(login_id.length - user_id_len);
    // log.debug(user_id +" / "+ login_id_suffix);
    if (login_id_suffix != user_id) { return deny(req, res); }

    // log.debug("next()");
    next();
}

/*
 * Deny access, render "access_denied" template
 */
function deny(req, res, message) { // log.debug("auth.deny()");
    // let redirect = message == "redirect";
    let msg = typeof message == "string" /* && !redirect */ ? message : "You are not authorized to access this page";
    let title = "Access Denied";
    
    let variables = {
        title: title,
        records: {},
        meta: {
            message: msg,
            message_type: "error"
        },
        user: user(req)
    }

    res.render('auth/access_denied', variables, log.whiteout, res);
}

/*
 * Unknown page, render "unknown_page" template
 */
function unknown(req, res) {
    let title = "Page Unknown";
    
    let variables = {
        title: title,
        records: {},
        meta: {},
        user: user(req)
    }

    res.render('auth/unknown_page', variables, log.whiteout, res);
}
    

/*
 * Login: create login_id and do callback
 */
function login(req, user, params, callback) {
    let call_back = typeof params == "function" ? params : callback;
    // log.debug("session"); log.debug(req.session);
    crypto.randomBytes(48, function(err, buffer) {
        let login_id = buffer.toString('hex');
        delete user.hash;
        req.session.user = user;
        req.session.login_id = login_id +""+ user.id;
        
        if (typeof call_back == "function") { call_back(); }
    });
}


/*
 * Logout: terminate session and do callback
 */
function logout(req, callback) { // log.debug(req.session);
    if (req.hasOwnProperty("session")) {
        if (req.session.hasOwnProperty("meta")) { // save from destruct
            let meta = req.session.meta;
            req.meta = Object.assign({}, meta); // keep meta data in req
        }
        req.session.destroy();
    }
    // log.debug(req.session);
        
    if (typeof callback == "function") { callback(); }
}


/*
 * User returns req.session.user if we have it
 */
function user(req) { // log.debug("auth.user");
    let have_user = req.hasOwnProperty("session") && 
        req.session.hasOwnProperty("user");
        
    return have_user ? req.session.user : null;
}


/*
 * Meta returns meta data or merges any new data in req.session.meta
 */
function meta(req, data) {
    let meta = req.hasOwnProperty("session") ? 
        (req.session.hasOwnProperty("meta") ? req.session.meta : {}) :
        (req.hasOwnProperty("meta") ? req.meta : {});
        
    if (typeof data == "string") {
        return meta.hasOwnProperty(data) ? meta[data] : null;
    }
    if (typeof data == "undefined") {
        return meta;
    }    
    
    let meta_assign = Object.assign(meta, data);
    if (req.hasOwnProperty("session")) {
        req.session.meta = meta_assign; // log.debug("session.meta"); log.debug(req.session.meta);
        
    } else {
        req.meta = meta_assign; // log.debug("req.meta"); log.debug(req.meta);
    }
    return meta_assign;
}


/*
 * Returns meta data stored in session and clears it out
 */
function meta_flush(req, data) {
    let m = {};
    let meta_obj = req.hasOwnProperty("session") ? 
        (req.session.hasOwnProperty("meta") ? req.session.meta : null) :
        (req.hasOwnProperty("meta") ? req.meta : null);
    let have_meta = meta_obj !== null;
        
    if (typeof data == "object" && have_meta) {
        m = Object.assign(meta_obj, data);
        
    } else if (typeof data == "object" && !have_meta) {
        m = data;
        
    } else if (have_meta) {
        m = meta_obj;
        
    } else {
        m = meta(req, data);
    }
    
    if (have_meta) {
        if (req.hasOwnProperty("session") && req.session.hasOwnProperty("meta")) { 
            delete req.session.meta; 
        }
        if (req.hasOwnProperty("meta")) { 
            delete req.meta; 
        }
    }
    // log.debug(req.session);
    
    return m;
}


/*
 * Elapsed time since last elapsed call
 */
function elapsed(req) {
    let call_time = meta(req, "call_time");
    let this_time = new Date();
    if (call_time == null) { 
        call_time = this_time; 
        
    } else {
        call_time = new Date(call_time);
    }
    
    let elapsed = this_time - call_time; // log.debug("elapsed: "+ elapsed);

    meta(req, { call_time: this_time });
    return elapsed;
}
