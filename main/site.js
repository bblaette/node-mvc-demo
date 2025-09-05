
var config = require('../main/config.js');
var express = require('express');
var session = require('express-session');
var path = require('path');
var router = require('./routes');
var body = require('body-parser');
var app = express();
var fs = require('fs');
var log = require('../main/logging.js');

module.exports = {
    app: app,
    
    port: port,
    
    init: function(params) { 
        return init(params); 
    }
}

/*
 * Global parameters and configuration
 */

// site folder (leave blank, if site is not in a subfolder)
app.locals.site_base = config.get("site_base"); // "/subdir" -> start slash, no trailing one
app.locals.city_img_path = config.get("city_img_path"); // path to city images
app.locals.env = config.get("env"); // "DEV" or "PROD"

// hosts
var hostname = config.get("hostname"); 

// port
var have_port = process.argv.length == 3 && process.argv[2].replace(/^80\d\d$/, "ok") == "ok";
var port = have_port ? process.argv[2] : config.get("port"); ;
app.set('port', port); // app.set('port', process.env.PORT || 8080);
// config.set("port", port); // for consistency

// ejs view engine
app.set('view engine', 'ejs');
app.use(express.static(sitePath('public')));

// app.set('x-powered-by', false);


// req.body data population
app.use(body.urlencoded({ // support for form posts (req.body)
    extended: true
}));
app.use(body.json()); // support json parsing (req.body)


// sessions
var sess = config.get("session");
if (app.get('env') === 'production') {
  //app.set('trust proxy', 1); // trust first proxy
  sess.cookie.secure = true; // serve secure cookies
}
app.use(session(sess));


// error logging
app.use(function(err, req, res, next) { // console.log("beep!"); // log errors
    if (!err) { return next(); }
    
    log.error('Internal server error');
    log.error(err);
    res.status(500);
    res.send('500: Internal server error');
});

process.on('uncaughtException', function(err) {
    log.error('Uncaught error');
    log.error(err);
    // process.exit(1); // graceful shutdown, close database connection, etc
});

process.on('unhandledRejection', function(reason, promise) {
    log.error('Unhandled rejection');
    log.error({ reason: reason, promise: promise });
});


// preprocessing requests, custom render() and redirect() handlers
app.use(function(req, res, next) { // all requests (!) go through this
    try {
        // log.debug("hostSetter: "+ hostSetter(req));
        if (!app.locals.host) {
            app.locals.host = hostSetter(req); // remember host
            config.set("host", app.locals.host);
        }
        app.locals.env = config.get("env");
        // config.set("env", app.locals.env);
        // log.debug('environment: '+ app.locals.env);
        
        next();
        
    } catch(err) {
        log.whiteout(err, res); // don't print the err
    }
});

var render = express.response.render; // support log.whiteout() callback
express.response.render = function(view, options, callback, res) {
    let call_back = typeof options == "function" ? options :
        (typeof callback == "function" ? callback : null);
    let call = typeof call_back != "function" ? callback : function(err, html) {
        if (err) {
            call_back(err, res); // provide response obj to err callback
            
        } else {
            res.send(html); // no err -> send rendered html
        }
    }
    if (typeof options == "function" || typeof callback == "undefined") {
        render.apply(this, [view, call]); // use our extended callback
        
    } else {
        render.apply(this, [view, options, call]); // use our callback
    }
};

var redirect = express.response.redirect;
express.response.redirect = function (status_or_url, url) {
    // log.debug(status_or_url); log.debug(url);
    if (typeof url == "undefined") {
        return redirect.apply(this, [app.locals.site_base + status_or_url]);
    }
    // log.debug(app.locals.site_base + url);

    return redirect.apply(this, [status_or_url, url]);
}

/*
 * Initialization of express parts
 */
function init(params) {
    routes();
}


/*
 * Express routes
 */
function routes() {
    app.disable('x-powered-by');
    app.use(demo_reset_middleware); // Check for daily demo reset
    app.use(router);
}


/*
 * Helper function to determine our host (which may be behind a proxy)
 */
 
var execSync = require('child_process').execSync;

function hostSetter(req) { // log.debug("hostSetter");
    let headers = req.headers;
    let host = req.get('host'); // req.host;
    let have_session = req.hasOwnProperty("session");
    let s_host = have_session && req.session.hasOwnProperty("host") ? 
        req.session.host : "";
    let xf_host = headers.hasOwnProperty("x-forwarded-host") && headers["x-forwarded-host"].length < 256 ?
        headers["x-forwarded-host"] : "";
    xf_host = xf_host.replace(/\:\d+/, ""); // remove any port number
    // log.debug(headers); log.debug(host); log.debug(have_session);
    // log.debug("s_host: "+ s_host);
    // log.debug("xf_host: "+ xf_host); log.debug("hostname: "+ hostname);
    
    if (s_host != "" && (s_host == host || s_host == xf_host)) {
        host = s_host;
        
    } else if (xf_host != "") { // log.debug("OS: "+ process.platform);
        let xf_host_confirmed = xf_host == hostname;
        if (xf_host_confirmed) {
            // log.debug("xf_host: confirmed");
            host = xf_host;

        } else {
            // log.debug("forwarded host: "+ xf_host);
        }
        // log.debug("host set to: "+ host);
    }
    
    if (have_session) {
        req.session.host = host;
    }
    // log.debug("hostSetter() host: "+ host); log.debug(req.session);
    
    return host;
}


/*
 * Helper functions
 */
function sitePath(...args) {
    return path.join(__dirname.replace(/\/main$/, ""), ...args);
}


/*
 * Demo reset middleware - checks if daily reset is needed
 */
function demo_reset_middleware(req, res, next) {
    // Skip for static files and admin reset routes to avoid loops
    if (req.path.startsWith('/css') || req.path.startsWith('/js') || 
        req.path.startsWith('/img') || req.path.startsWith('/admin/demo-reset')) {
        return next();
    }
    
    // Only check once per day per server instance
    if (app.locals.demo_checked_today) {
        return next();
    }
    
    let favorites = require('../records/favorites.js');
    let moment = require('moment');
    let today = moment().format('YYYY-MM-DD');
    
    favorites.get_last_demo_reset(function(status, last_reset) {
        if (status === "success" && last_reset !== today) {
            // Need to reset demo data
            log.debug("Demo reset needed - last reset: " + (last_reset || "never") + ", today: " + today);
            
            favorites.demo_reset(function(reset_status) {
                if (reset_status === "success") {
                    log.debug("Daily demo reset completed successfully");
                } else {
                    log.error("Daily demo reset failed");
                }
                
                // Mark as checked to avoid multiple resets per day
                app.locals.demo_checked_today = true;
                next();
            });
        } else {
            // No reset needed
            app.locals.demo_checked_today = true;
            next();
        }
    });
}
