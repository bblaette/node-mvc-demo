let records = require("../records/cities.js");
let all = require("./all_controllers.js"); // definitions for all controllers
let auth = require('../main/auth.js');
let log = require('../main/logging.js');


module.exports = { // check ../main/routes.js for url->action mapping
    index: index,
    
    index_page: index_page,
    
    view: view,
    
    del: del
}


/*
 * Index action for cities controller (public city browsing)
 */
function index(req, res, next) {
    req.params.page = 1;
    index_page(req, res, next);
}


/*
 * Index action with pagination (public view of all cities with averages)
 */
function index_page(req, res, next) {
    let title = "All Cities";
    
    // Handle admin impersonation context (pass through from referrer)
    let user = auth.user(req);
    let impersonate_user_id = null;
    if (user && user.role === "admin" && req.query.user_id) {
        let parsed_user_id = parseInt(req.query.user_id, 10);
        if (!isNaN(parsed_user_id)) {
            impersonate_user_id = parsed_user_id;
            title = "All Cities (Admin View)";
        }
    }
        
    var callback = function(status, results, meta) {
        let variables = {
            title: title,
            cities: results,
            meta: auth.meta_flush(req, meta), // include session message
            user: auth.user(req),
            impersonating_user_id: impersonate_user_id
        }
        
        if (status != "success") { // log.error(results);
            return auth.deny(req, res, "Could not retrieve city records");
        }
        res.render('cities/index', variables, log.whiteout, res);
    };
    
    let param_ok = all.param_check(req.params, "page", "(int)");
    if (param_ok) {
        let page_num = req.params.page;
        let pagination_params = all.index_page_params(page_num);
        req.params.offset = pagination_params.offset;
        req.params.limit = pagination_params.limit;
        
        return records.index_page(req, callback);
    }
    
    return index(req, res, next);
}


/*
 * View action for given city id (public city details)
 */
function view(req, res, next) {
    let title = "City Details";
    
    // Handle admin impersonation context (pass through from referrer)
    let user = auth.user(req);
    let impersonate_user_id = null;
    if (user && user.role === "admin" && req.query.user_id) {
        let parsed_user_id = parseInt(req.query.user_id, 10);
        if (!isNaN(parsed_user_id)) {
            impersonate_user_id = parsed_user_id;
            title = "City Details (Admin View)";
        }
    }
    
    var callback = function(status, results, meta) {
        let variables = {
            title: title,
            city: results,
            meta: auth.meta_flush(req, meta), // include session message
            user: auth.user(req),
            impersonating_user_id: impersonate_user_id
        }
        
        if (status != "success") { // log.error(results);
            return auth.deny(req, res, "Could not retrieve city data");
        }
        res.render('cities/view', variables, log.whiteout, res);
    };
    
    let id_ok = all.param_check(req.params, "id", "(int)");
    if (!id_ok) { // log.error(results);
        return auth.deny(req, res, "Cannot process parameter");
    }
    records.view(req, callback);
}

/*
 * Delete action for given city id (admin only)
 */
function del(req, res, next) {
    let id_ok = all.param_check(req.params, "id", "(int)");
    if (!id_ok) { // log.error(results);
        return auth.deny(req, res, "Cannot process parameter");
    }
    let id = req.params.id;
    
    var callback = function(status, results, meta) {
        let link_back = meta != null && meta.link_back.length > 0 ?
            meta.link_back : 
            "/cities";
        let message = status != "success" ? 
            "Could not delete city" :
            "Deleted city with id "+ id;
        let message_type = status != "success" ? "error" : status;
        
        auth.meta(req, { 
            message: message,
            message_type: message_type
        });
        
        return res.redirect(link_back); // redirect + check_auth
    };
    
    var user = auth.user(req);
    var is_admin = user != null && user.role == "admin";
    if (!is_admin) { // log.error(results);
        return auth.deny(req, res, "Cannot process request");
    }
    
    records.del(req, callback);
}
