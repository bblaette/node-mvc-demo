
let records = require("../records/home.js");
let all = require("./all_controllers.js");
let auth = require('../main/auth.js');
let log = require('../main/logging.js');


/*
 * Global pointers to controller files
 */

module.exports = {
    index: index
}


/*
 * Global parameters and settings
 */
function index(req, res, next) {
    let title = "Welcome to City Ratings, a Node MVC Demo!";
    
    var callback = function(status, results, meta) {
        let variables = {
            title: title,
            showcase: results,
            meta: auth.meta_flush(req, meta), // include session message
            user: auth.user(req)
        }
        
        if (status != "success") {
            // Fallback to simple home page if showcase fails
            let fallback_variables = {
                title: title,
                showcase: { general: [], featured: [], trending: [] },
                meta: auth.meta_flush(req, { has_featured: false, has_trending: false }), // include session message
                user: auth.user(req)
            }
            return res.render('home/index', fallback_variables, log.whiteout, res);
        }
        res.render('home/index', variables, log.whiteout, res);
    };
    
    records.showcase(req, callback);
}


