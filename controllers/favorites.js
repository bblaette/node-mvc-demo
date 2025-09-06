
let records = require("../records/favorites.js");
let all = require("./all_controllers.js"); // definitions for all controllers
let auth = require('../main/auth.js');
let log = require('../main/logging.js');


module.exports = { // check ../main/routes.js for url->action mapping
    auth_check: auth_check,
    
    index: index,
    
    index_page: index_page,
    
    view: view,
    
    del: del,
    
    edit: edit,
    
    edit_post: edit_post,
    
    demo_reset: demo_reset
}


/*
 * Check if user is authenticated for viewing their favorite cities
 */
function auth_check(req, res, next) { 
    let user = auth.user(req);
    if (!user || !user.id) {
        return auth.deny(req, res); 
    }
    
    next();
}


/*
 * Index action - consolidated view for all users
 * - Regular users: see their favorites in card format
 * - Admins: see all favorites in list format
 * - Admin impersonation (?user_id=X): see specific user's favorites in card format
 */
function index(req, res, next) {
    req.params.page = 1;
    index_page(req, res, next);
}


/*
 * Index action with pagination - handles all favorites views
 */
function index_page(req, res, next) {
    let user = auth.user(req);
    if (!user || !user.id) {
        return auth.deny(req, res); 
    }
    
    let is_admin = user.role === "admin";
    let impersonate_user_id = null;
    let view_format = "cards"; // default to cards
    let title = "My Favorite Cities";
    
    // Check for admin impersonation via query parameter
    if (is_admin && req.query.user_id) {
        let parsed_user_id = parseInt(req.query.user_id, 10);
        if (!isNaN(parsed_user_id)) {
            impersonate_user_id = parsed_user_id;
            title = "Favorite Cities (Admin View)";
            view_format = "cards"; // impersonation uses card format
        }
    } else if (is_admin && !req.query.user_id) {
        // Admin default view - show all favorites in list format
        title = "All User Favorite Cities";
        view_format = "list";
    }
    
    var callback = function(status, results, meta) { // log.debug(status); // log.debug(results); log.debug(meta);
        // Add view format to meta for template
        if (meta) {
            meta.view_format = view_format;
        }
        
        let variables = {
            title: title,
            favorites: results,
            meta: auth.meta_flush(req, meta), // include session message
            user: user,
            impersonating_user_id: impersonate_user_id
        }
        
        if (status != "success") { // log.error(results);
            let error_msg = is_admin ? "Could not retrieve favorite city records" : "Could not retrieve your favorite cities";
            return auth.deny(req, res, error_msg);
        }
        res.render('favorites/index', variables, log.whiteout, res);
    };
    
    // Handle pagination
    let page_num = typeof req.params.page == "undefined" || !all.param_check(req.params, "page", "(int)") ? 
        1 : req.params.page;
    
    let pagination_params = all.index_page_params(page_num);
    req.params.page = page_num;
    req.params.offset = pagination_params.offset;
    req.params.limit = pagination_params.limit;
    
    // Determine which user's data to show
    if (impersonate_user_id) {
        // Admin impersonating specific user
        req.params.user_id = impersonate_user_id;
        req.params.user_role = user.role; // Pass user role for impersonation link generation
        return records.home_page(req, callback); // Use personal view logic
    } else if (is_admin) {
        // Admin viewing all users
        req.params.user_role = user.role; // Pass user role for admin link generation
        return records.index_page(req, callback); // Use admin view logic
    } else {
        // Regular user viewing their own favorites
        req.params.user_id = user.id;
        return records.home_page(req, callback); // Use personal view logic
    }
}


/*
 * View action for given city_id (shows user's favorite rating for that city)
 */
function view(req, res, next) {
    let user = auth.user(req);
    if (!user || !user.id) {
        return auth.deny(req, res); 
    }
    
    let title = "Favorite City";
    
    // Handle admin impersonation via user_id query parameter
    let target_user_id = user.id; // Default to current user
    let impersonate_user_id = null;
    if (req.query.user_id && user.role === "admin") {
        // Only admins can impersonate other users
        let parsed_user_id = parseInt(req.query.user_id, 10);
        if (!isNaN(parsed_user_id)) {
            target_user_id = parsed_user_id;
            impersonate_user_id = parsed_user_id;
            title = "Favorite City (Admin View)";
        }
    }
    
    var callback = function(status, results, meta) { // log.debug(status);  log.debug(results); log.debug(meta);
        if (status != "success") { // log.error(results);
            // Check if this is the "no rating exists" case AND we should redirect
            if (meta && meta.message && meta.message.indexOf("haven't rated this city yet") > -1) {
                let referer = req.header('Referer') || '';
                let current_user = auth.user(req);
                
                // Only redirect if coming from cities page and user role (not admin)
                if (referer.indexOf('/cities') > -1 && current_user && current_user.role !== "admin") {
                    return res.redirect(`${req.app.locals.site_base}/favorites/edit/${req.params.city_id}`);
                }
            }
            return auth.deny(req, res, "Could not retrieve favorite city data");
        }
        
        let variables = {
            title: title,
            favorite: results,
            meta: auth.meta_flush(req, meta), // include session message
            user: auth.user(req),
            impersonating_user_id: impersonate_user_id
        }
        
        res.render('favorites/view', variables, log.whiteout, res);
    };
    
    let city_id_ok = all.param_check(req.params, "city_id", "(int)");
    if (!city_id_ok) { // log.error(results);
        return auth.deny(req, res, "Cannot process parameter");
    }
    
    req.params.user_id = target_user_id;
    records.view(req, callback);
}


/*
 * Delete action for given favorite city rating id 
 */
function del(req, res, next) {
    let id_ok = all.param_check(req.params, "id", "(int)");
    if (!id_ok) { // log.error(results);
        return auth.deny(req, res, "Cannot process parameter");
    }
    let id = req.params.id;
    
    var callback = function(status, results, meta) { // log.debug(status); log.debug(meta);
        let link_back = meta != null && meta.link_back && meta.link_back.length > 0 ?
            meta.link_back : 
            "/favorites";
            
        // Check if we're impersonating and need to preserve user_id
        let user = auth.user(req);
        if (user && user.role === "admin" && req.query.user_id) {
            let impersonate_user_id = parseInt(req.query.user_id, 10);
            if (!isNaN(impersonate_user_id)) {
                // Add impersonation parameter to link_back if it doesn't already have it
                if (link_back.indexOf('?user_id=') === -1) {
                    link_back += (link_back.indexOf('?') > -1 ? '&' : '?') + 'user_id=' + impersonate_user_id;
                }
            }
        }
            
        let message = status != "success" ? 
            "Could not delete favorite city" :
            "Deleted favorite city with id "+ id;
        let message_type = status != "success" ? "error" : status;
        
        auth.meta(req, { 
            message: message,
            message_type: message_type
        });
        
        return res.redirect(link_back); // redirect + check_auth
    };
    
    var user = auth.user(req);
    if (!user || !user.id) {
        return auth.deny(req, res, "Authentication required");
    }
    
    // Pass user info to records for ownership verification
    req.params.user_id = user.id;
    req.params.user_role = user.role;
    
    records.del(req, callback);
}


/*
 * Edit action for creating/editing a favorite city rating
 */
function edit(req, res, next) {
    let user = auth.user(req);
    if (!user || !user.id) {
        return auth.deny(req, res); 
    }
    
    let title = "Rate This City";
    
    // Handle admin impersonation via user_id query parameter
    let target_user_id = user.id; // Default to current user
    let impersonate_user_id = null;
    if (req.query.user_id && user.role === "admin") {
        // Only admins can impersonate other users
        let parsed_user_id = parseInt(req.query.user_id, 10);
        if (!isNaN(parsed_user_id)) {
            target_user_id = parsed_user_id;
            impersonate_user_id = parsed_user_id;
            title = "Rate This City (Admin View)";
        }
    }
    
    var callback = function(status, results, meta) { // log.debug(status);  log.debug(results); log.debug(meta);
        let variables = {
            title: title,
            city: results.city,
            favorite: results.favorite,
            meta: auth.meta_flush(req, meta), // include session message
            user: auth.user(req),
            impersonating_user_id: impersonate_user_id
        }
 
        
        if (status != "success") { // log.error(results);
            return auth.deny(req, res, "Could not load city data for rating");
        }
        res.render('favorites/edit', variables, log.whiteout, res);
    };
    
    let city_id_ok = all.param_check(req.params, "city_id", "(int)");
    if (!city_id_ok) { // log.error(results);
        return auth.deny(req, res, "Cannot process parameter");
    }
    
    req.params.user_id = target_user_id;
    if (impersonate_user_id) {
        req.params.user_role = user.role; // Pass user role for impersonation link generation
    }
    records.edit(req, callback);
}


/*
 * Edit POST action for saving favorite city rating
 */
function edit_post(req, res, next) {
    let user = auth.user(req);
    if (!user || !user.id) {
        return auth.deny(req, res); 
    }
    
    // Handle admin impersonation via user_id query parameter
    let target_user_id = user.id; // Default to current user
    let impersonate_user_id = null;
    if (req.query.user_id && user.role === "admin") {
        // Only admins can impersonate other users
        let parsed_user_id = parseInt(req.query.user_id, 10);
        if (!isNaN(parsed_user_id)) {
            target_user_id = parsed_user_id;
            impersonate_user_id = parsed_user_id;
        }
    }

    var callback = function(status, results, meta) {
        if (status == "success") {
 
            // Success - redirect back to referrer or default
            let link_back = meta && meta.link_back ? meta.link_back : "/cities";
            let message = "Your city rating has been saved successfully!";
 

            auth.meta(req, { 
                message: message,
                message_type: "success"
            });
            
            return res.redirect(link_back);

        } else {
            // Validation errors - re-render form with errors
            let title = impersonate_user_id ? "Rate This City (Admin View)" : "Rate This City";
            let variables = {
                title: title,
                city: results.city,
                favorite: results.favorite,
                meta: auth.meta_flush(req, meta), // include session message and validation errors
                user: auth.user(req),
                impersonating_user_id: impersonate_user_id
            }
            
            return res.render('favorites/edit', variables, log.whiteout, res);
        }
    };
    
    let city_id_ok = all.param_check(req.params, "city_id", "(int)");
    if (!city_id_ok) { // log.error(results);
        return auth.deny(req, res, "Cannot process parameter");
    }
    
    req.params.user_id = target_user_id;
    if (impersonate_user_id) {
        req.params.user_role = user.role; // Pass user role for impersonation link generation
    }
    records.edit_post(req, callback);
}


/*
 * Admin manual demo reset/clear action
 */
function demo_reset(req, res, next) {
    let user = auth.user(req);
    if (!user || user.role !== "admin") {
        return auth.deny(req, res, "Admin access required");
    }
    
    let mode = req.params.mode;
    if (mode !== "prefill" && mode !== "clear") {
        return auth.deny(req, res, "Invalid mode parameter");
    }
    
    var callback = function(status, results, meta) {
        let action_past = mode === "clear" ? "cleared" : "reset";
        let action_desc = mode === "clear" ? 
            "All favorites have been cleared and city averages reset." :
            "All favorites have been cleared and new demo data has been generated.";
            
        let message = status === "success" ? 
            `Demo data has been ${action_past} successfully! ${action_desc}` :
            `Failed to ${mode === "clear" ? "clear" : "reset"} demo data. Please check the server logs.`;
        let message_type = status === "success" ? "success" : "error";
        
        // Prevent double reset by marking today as already checked
        if (status === "success") {
            req.app.locals.demo_checked_today = true;
        }
        
        auth.meta(req, { 
            message: message,
            message_type: message_type
        });
        
        // Redirect back to favorites or cities page
        let referer = req.header('Referer') || '';
        let redirect_to = referer.indexOf('/cities') > -1 ? '/cities' : '/favorites';
        req.app.locals.demo_checked_today = false; // Enable middleware

        return res.redirect(redirect_to);
    };
    
    log.debug(`Admin triggered manual demo ${mode}`);
    records.demo_reset(mode, callback);
}
