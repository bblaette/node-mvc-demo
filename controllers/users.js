
let all = require("./all_controllers.js");
let auth = require('../main/auth.js');
let records = require("../records/users.js");
let bcrypt = require("bcryptjs");
let favorites = require("./favorites.js");
let home = require("./home.js");
let log = require('../main/logging.js');

module.exports = {
    login: login,
    
    login_post: login_post,
    
    logout: logout
}


/*
 * Index action with login form
 */
function login(req, res, next) {
    let title = "Login";

    let variables = {
        title: title,
        meta: {},
        auth: {}
    }

    auth.elapsed(req); // measure elapsed time

    res.render('users/login', variables, log.whiteout, res);    
}
    

function login_post(req, res, next) { // form submit
    let title = "Login";

    var callback = function(status, results, meta) {
        let variables = {
            title: title,
            records: results,
            meta: auth.meta_flush(req, meta),
            user: auth.user(req)
        }
        
        auth.elapsed(req); // meta is flushed, enable elapsed time again
        
        if (status != "success") { // return to login form and show issues
            return res.render('users/login', variables, log.whiteout, res);
        }
        
        let user = results;
        auth.login(req, user, function() {
            auth.meta(req, {
                message: "Welcome "+ meta.role_name +"!",
                message_type: "success"
            });
            return favorites.index(req, res, next); // go to /favorites
        });
    };
    
    let elapsed = auth.elapsed(req);
    if (elapsed < 2000 && elapsed > 0) {
        let meta = {
            message: "Login failed, sorry",
            message_type: "error"
        };
        return callback("error", null, meta); // index(req, res, next);
    }
    
    return records.login_post(req, callback);
}


/*
 * Logout action with redirect to home page
 */
function logout(req, res, next) {
    let title = "Login";

    auth.logout(req, function() {
        auth.meta(req, {
            message: "You are logged out now. Thanks for stopping by!",
            message_type: "success"
        });
        return home.index(req, res, next);
    });
}
