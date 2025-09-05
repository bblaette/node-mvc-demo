
let s = require("./query_string.js");
let q = require("./query_run.js");
let all = require("./all_records.js");
let bcrypt = require("bcryptjs");
let log = require('../main/logging.js');

module.exports = {
    login_post: login_post
}

/* 
 * Global parameters
 */
let tableName = "users";
let bcryptRounds = 12;

// let cipherKey = "Q2aPfWp1S1BhRLawS4jMYIjTAqAXRMhI";
// let salt = "bCrsZG7s15uf5dbC";


/*
 * Access index data
 */
function login_post(req, callback) {
    login_post_validation(req, function(status, details) {
        // log.debug(status); log.debug(details);
        let meta = login_post_meta(req, status, details);
        let record = details.related;
        if (meta.hasOwnProperty("role_name")) { 
            record.role_name = meta.role_name; // add role name to user
        };
        let results = status == "success" ? record : null;
        
        callback(status, results, meta);
    });
}

function login_post_validation(req, call_complete) {
    let fields = [];
    let issues = [];
    let related = {};
    
    let body_ok = req.hasOwnProperty('body') && 
        req.body.hasOwnProperty('email') && 
        req.body.hasOwnProperty('password');
    if (!body_ok) {
        fields.push('email');
        fields.push('password');
        issues.push("Email field is required");
        issues.push("Password field is required");
        call_complete("error", { fields: fields, issues: issues, related: related });
        return; // form cannot be processed
    }
    
    let email = req.body.email;    
    let email_ok = typeof email == "string" && email.length > 3 && email.length < 256 &&
        (email.indexOf("@") > -1 && email.indexOf(".") > -1 || email == 'admin');
    if (!email_ok) {
        fields.push("email");
        issues.push("Please enter a valid email address");
    }
    
    let password = req.body.password;
    let password_format = typeof password == "string" && password.length > 3  && password.length < 256;
    if (!password_format) {
        fields.push("password");
        issues.push("Please enter your password");
    }
    
    if (issues.length > 0) { // stop and report back issues
        call_complete("error", { fields: fields, issues: issues, related: related });
        return;
    }
    
    if (log.level() == "debug") {
        bcryptHash(password, function(hash) { log.info("hash: "+ hash +" / "+ email.substr(0,3)); });
    }
    
    // we've got an email and password, let's see if there is a match
    let query = s.querySelectRecords(tableName, "email", email); // log.debug(query);
    
    q.run(query, [email], function(stat, res) { // log.debug(stat); log.debug(res[0]); 
        let check_ok = stat == "success" && res.length > 0; // found login entry
        if (!check_ok) { // do nothing, this r_code has an access link
            fields.push('form');
            issues.push("Login failed, sorry"); // user is unknown
            call_complete("error", { fields: fields, issues: issues, related: related });
            return; // stop and report back
        }
        
        let record = res[0]; // first match
        related = record; // forward record (for later use)
        bcrypt.compare(password, record.hash, function(err, match_ok) {
            if (err) {
                log.error("Fatal error during bcrypt.compare()"); log.error(err); 
                return false;
            }
            // log.debug(match_ok);
            if (!match_ok) { // do nothing, this r_code has an access link
                fields.push('form');
                issues.push("Login failed, sorry"); // password is wrong
                call_complete("error", { fields: fields, issues: issues, related: related });
                return; // stop and report back
            }
            call_complete("success", { fields: fields, issues: issues, related: related });
        });
    });
}


function login_post_meta(req, status, details) { // meta data for login
    if (status == "success") { // provide role and welcome message
        let role = details.related.role; // related now contains record fields
        let role_name = role.charAt(0).toUpperCase() + role.slice(1);
        let message = "Welcome "+ role_name +"!";
        let message_type = "success";
        let js = [
            { variable: "role", value: role, type: "string" },
            { variable: "role_name", value: role_name },
            { variable: "message", value: message }
        ];
        return {
            role: role,
            role_name: role_name,
            message: message,
            message_type: message_type,
            js: js
        }
    }
    
    let form_issue_idx = details.fields.indexOf("form");
    let form_issue = form_issue_idx > -1 ? details.issues[form_issue_idx] : null;
    let message = form_issue ? form_issue : "";
    let message_type = form_issue ? "error" : "";
    
    let validation = { 
        selector: "form",
        fields: details.fields, 
        issues: details.issues 
    };
    let js = [
        { variable: "validation", value: JSON.stringify(validation), type: "json" }
    ];
        
    return {
        message: message,
        message_type: message_type,
        js: js
    }
}


function bcryptHash(password, callback) {
    bcrypt.hash(password, 12, function(err, hash) {
        if (err) {
            log.error("Fatal error during bcrypt.hash()"); log.error(err); 
            return callback(false);
        }
        callback(hash);
    });
}
