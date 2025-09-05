
let s = require("./query_string.js");
let q = require("./query_run.js");
let all = require("./all_records.js");
let moment = require("moment");
let log = require('../main/logging.js');

module.exports = {    
    index: index,
    
    index_page: index_page,
    
    view: view,

    del: del,
    
    home_page: home_page,
    
    edit: edit,
    
    edit_post: edit_post,
    
    demo_reset: demo_reset,
    
    get_last_demo_reset: get_last_demo_reset
}


/* 
 * Global parameters
 */
let favoritesTable = "favorites";
let citiesTable = "cities";
let usersTable = "users";

let starsPrecision = 10; // 1 digit for star ratings


/*
 * Home page for user - shows their favorite cities with pagination
 */
function home_page(req, callback) {
    let user_id = req.params.user_id; // auth should provide this
    
    // Join query to get user's favorite cities with city details
    let query = `select f.id, f.city_id, c.city, c.country, c.image_path, f.visited, f.story, 
        f.stars_scenery, f.stars_food, f.stars_culture, f.stars_walkable, f.stars_vibe,
        (f.stars_scenery + f.stars_food + f.stars_culture + f.stars_walkable + f.stars_vibe) / 5 as avg_rating
        from ` + s.prefix(favoritesTable) + ` f 
        left join ` + s.prefix(citiesTable) + ` c on f.city_id = c.id 
        where f.user_id = ? 
        order by f.visited desc 
        limit ?, ?`;
    
    let query_total = `select count(*) from ` + s.prefix(favoritesTable) + ` where user_id = ?`;
    
    let offset = req.params.offset;
    let limit = req.params.limit;
    
    q.run(query_total, [user_id], function(stat, res) {
        let meta_pagination = home_page_meta_pagination(req, stat, res);
        
        q.run(query, [user_id, offset, limit], function(status, results) { 
            let meta = home_page_meta(req, status, results, meta_pagination);
            results = index_results(req, status, results);
            callback(status, results, meta);
        });
    });
}

function home_page_meta_pagination(req, status, results) { 
    if (status != "success") { return null; }
    
    let pages_link = "/favorites/page/";
    return all.indexPagination(req, results, pages_link);
}

function home_page_meta(req, status, results, meta_pagination) {
    if (status != "success") { return null; }
    let total = results.length;
    
    // Capture impersonation context for closures
    let user_role = req.params.user_role;
    let impersonate_user_id = req.params.user_id;
    let is_impersonating = user_role === "admin" && impersonate_user_id;
    
    let columns = [
        { key: "city", label: "City" }, 
        { key: "country", label: "Country" }, 
        { key: "visited", label: "Last Visit" }, 
        { key: "avg_rating", label: "Overall" }, 
        { key: "stars_scenery", label: "Scenery" }, 
        { key: "stars_food", label: "Food" }, 
        { key: "stars_culture", label: "Culture" }, 
        { key: "stars_walkable", label: "Walkable" }, 
        { key: "stars_vibe", label: "Vibe" }
    ];
    let actions = [
        { 
            label: "View",
            link: function(favorite) { 
                let url = "/favorites/view/" + favorite.city_id;
                if (is_impersonating) {
                    url += "?user_id=" + impersonate_user_id;
                }
                return url;
            }
        },
        { 
            label: "Edit",
            link: function(favorite) { 
                let url = "/favorites/edit/" + favorite.city_id;
                if (is_impersonating) {
                    url += "?user_id=" + impersonate_user_id;
                }
                return url;
            }
        },
        { 
            label: "Delete",
            link: function(favorite) { return "/favorites/delete/" + favorite.id; }
        }
    ];
    let meta = {
        total: total,
        columns: columns,
        actions: actions
    }
    
    return Object.assign(meta, meta_pagination); // merge in pagination
}


/*
 * Admin index page - all user favorite cities (data records and meta data)
 */
function index(req, callback) {
    if (typeof callback !== "function") { return false; }
    
    // Join query to get all user favorite cities with details
    let query = `select f.id, f.city_id, f.user_id, u.email, c.city, c.country, c.image_path, f.visited, f.story, 
        f.stars_scenery, f.stars_food, f.stars_culture, f.stars_walkable, f.stars_vibe,
        (f.stars_scenery + f.stars_food + f.stars_culture + f.stars_walkable + f.stars_vibe) / 5 as avg_rating
        from ` + s.prefix(favoritesTable) + ` f 
        left join ` + s.prefix(citiesTable) + ` c on f.city_id = c.id 
        left join ` + s.prefix(usersTable) + ` u on f.user_id = u.id 
        order by f.visited desc`;
    
    q.run(query, null, function(status, results) { 
        index_meta(req, status, results, function(status, meta) {
            results = index_results(req, status, results);
            callback(status, results, meta);
        });
    });
}

function index_results(req, status, results) { // preprocessing results
    if (status != "success") { return results; }
    
    let processed_results = results;
    let keys = results.length > 0 ? Object.keys(results[0]) : [];

    for (let i = 0; i < results.length; i++) {
        processed_results[i] = format_record(results[i], keys);
    }
    return processed_results;
}

function index_structure(req /* , query_records */) {
    let user_role = req.params.user_role; // Captured for closure
    
    let columns = [
        { key: "id", label: "Id", sort: "asc" },
        { key: "email", label: "User", sort: "asc", sort_num: 1,
            filter: "lk",
            filter_type: "first-2"
        }, 
        { key: "city", label: "City", sort: "asc" }, 
        { key: "country", label: "Country", sort: "asc" }, 
        { key: "visited", label: "Visited", sort: "desc" , sort_num: 2 },
        { key: "avg_rating", label: "Overall", sort: "desc",
            filter: "bt",
            filter_type: "step-0.5"
        }, 
        { key: "stars_scenery", label: "Scenery" }, 
        { key: "stars_food", label: "Food" }, 
        { key: "stars_culture", label: "Culture" }, 
        { key: "stars_walkable", label: "Walkable" }, 
        { key: "stars_vibe", label: "Vibe" }
    ];
    // columns = all.columnSortLinks(req, columns, "/favorites"); // add sorting columns
    
    let actions = [
        { 
            label: "View",
            link: function(favorite) { 
                let url = "/favorites/view/" + favorite.city_id;
                if (user_role === "admin") {
                    url += "?user_id=" + favorite.user_id;
                }
                return url;
            }
        },
        { 
            label: "Delete",
            link: function(favorite) { return "/favorites/delete/" + favorite.id; }
        },
    ];
    
    return {
        columns: columns,
        actions: actions
    }
}

function index_meta(req, status, results, meta_pagination, query_records, callback) { // meta data for index page
    if (typeof callback !== "function") { return false; }
    if (status != "success") { 
        return callback(status, null); 
    }
    
    let total = results.length; // note that results are limited
    let grand_total = meta_pagination.total; // all results, all pages
    let structure = index_structure(req /* , query_records */);
    let actions = structure.actions;
    
    // add column sorting, filters and actions as meta data
    let cols = all.columnSortLinks(req, structure.columns, "/favorites"); // columns = columns.slice(0, 16);
    
    // column filters need a callback due to them querying the database
    /// all.columnFilterLinks(req, cols, grand_total, query_records, "/favorites", function(status, columns) {
    {
        let meta = {
            total: total, // will be overwritten by meta_pagination.total
            columns: cols, /// columns,
            actions: actions
        }
        return callback(status, meta);
    }
    /// });
}


/*
 * Favorites for admin index with pagination
 */
function index_page(req, callback) {
    let query = index_page_queries(req);
    
    q.run(query.total, function(stat, res) {
        let meta_pagination = index_page_meta_pagination(req, stat, res);
        
        q.run(query.records, query.params.records, function(status, results) { 
            if (typeof callback == "function") {
                index_page_meta(req, status, results, meta_pagination, query.records, function(status, meta) {
                    results = index_results(req, status, results);
                    
                    if (status != "success") { 
                        log.error("No success after calling index_page_meta()");
                        return callback("error", results, meta); 
                    }
                    callback(status, results, meta);
                });
            }
        });
    });
}

function index_page_queries(req) {
    let structure = index_structure(req); // structure for sorting query
    let col_sorting = all.columnSortOrder(req, structure.columns);
    let order_str = col_sorting.length > 0 ? col_sorting.join(", ") : "f.visited desc"; 
    if (order_str.indexOf("email") > -1) { // empty values be last
        order_str = order_str.replace("email", "u.email IN(\"\", NULL), u.email");
    }

    let records = `select f.id, f.city_id, f.user_id, u.email, c.city, c.country, c.image_path, f.visited, f.story, 
        f.stars_scenery, f.stars_food, f.stars_culture, f.stars_walkable, f.stars_vibe,
        (f.stars_scenery + f.stars_food + f.stars_culture + f.stars_walkable + f.stars_vibe) / 5 as avg_rating
        from ` + s.prefix(favoritesTable) + ` f 
        left join ` + s.prefix(citiesTable) + ` c on f.city_id = c.id 
        left join ` + s.prefix(usersTable) + ` u on f.user_id = u.id 
        order by ` + order_str + ` 
        limit ?, ?`;

    let total = `select count(*) from ` + s.prefix(favoritesTable);  
    
    let offset = req.params.offset;
    let limit = req.params.limit;

    return {
        total: total,
        records: records,
        params: {
            total: [],
            records: [offset, limit]
        }
    }
}

function index_page_meta_pagination(req, status, results) {
    if (status != "success") { return null; }
    
    let pages_link = "/favorites/page/";
    return all.indexPagination(req, results, pages_link);
}

function index_page_meta(req, status, results, meta_pagination, query_records, callback) {
    index_meta(req, status, results, meta_pagination, query_records, function(status, meta) {
        if (status != "success") { 
            log.error("No success after calling index_meta()");
            return callback("error", meta); 
        }
        // if (meta == null) { return null; }
        let meta_combined = Object.assign(meta, meta_pagination); // merge in pagination
        callback(status, meta); 
    });
}


/*
 * View user's favorite city by city_id (data record and meta data)
 */
function view(req, callback) {
    let city_id = parseInt(req.params.city_id, 10);
    let user_id = req.params.user_id;
    
    // Join query to get user's favorite for specific city
    let query = `select f.id, f.user_id, f.city_id, f.visited, f.story, 
        f.stars_scenery, f.stars_food, f.stars_culture, f.stars_walkable, f.stars_vibe,
        (f.stars_scenery + f.stars_food + f.stars_culture + f.stars_walkable + f.stars_vibe) / 5 as avg_rating,
        c.city, c.country, c.image_path, u.email
        from ` + s.prefix(favoritesTable) + ` f 
        left join ` + s.prefix(citiesTable) + ` c on f.city_id = c.id 
        left join ` + s.prefix(usersTable) + ` u on f.user_id = u.id 
        where f.city_id = ? and f.user_id = ?`;
    
    q.run(query, [city_id, user_id], function(status, results) { // log.debug(status); // log.debug(results[0]); 
        if (typeof callback == "function") {
            // If no favorite found, return error
            if (status == "success" && (!results || results.length == 0)) {
                return callback("error", null, { 
                    message: "You haven't rated this city yet. If you'd like to do so, edit a city on the main page.",
                    message_type: "info"
                });
            }
            
            results = view_results(req, status, results);
            let meta = view_meta(req, status, results);
            callback(status, results, meta);
        }
    });
}

function view_results(req, status, results) { // preprocessing results
    if (status != "success") { return results; }
    
    let processed_results = format_record(results[0]); 
    
    return processed_results;
}

function view_fields() {
}

function view_meta(req, status, results) { // meta data for view page
    if (status != "success") { return null; }

    let fields = view_fields();
    
    let js_results = Object.assign({}, results);
    js_results.details = ""; // remove details for javascript
    let js = [
        { variable: "fields", value: JSON.stringify(fields), type: "json" },
        { variable: "results", value: JSON.stringify(js_results), type: "json" },
        { variable: "test_num", value: 123, type: "number" }
    ];
    
    let link_back = all.linkBack(req, 'city', '/cities');

    return {
        fields: fields,
        link_back: link_back,
        js: js
        /* actions: actions */
    }
}




/*
 * Delete favorite item (with ownership verification)
 */
function del(req, callback) { // log.debug("delete()");
    let favorite_id = parseInt(req.params.id, 10);
    let user_id = req.params.user_id;
    let user_role = req.params.user_role;
    
    // First verify ownership (unless admin)
    if (user_role !== "admin") {
        let ownership_query = `select user_id from ` + s.prefix(favoritesTable) + ` where id = ?`;
        
        q.run(ownership_query, [favorite_id], function(check_status, check_results) {
            if (check_status !== "success" || !check_results || check_results.length === 0) {
                let meta = delete_meta(req, "error");
                meta.message = "Favorite not found";
                return callback("error", null, meta);
            }
            
            if (check_results[0].user_id !== user_id) {
                let meta = delete_meta(req, "error");
                meta.message = "Access denied: You can only delete your own favorites";
                return callback("error", null, meta);
            }
            
            // Ownership verified, proceed with deletion
            perform_delete(favorite_id, req, callback);
        });
    } else {
        // Admin can delete any favorite
        perform_delete(favorite_id, req, callback);
    }
}

function perform_delete(favorite_id, req, callback) {
    let query = s.queryDeleteRecord(favoritesTable, "id", favorite_id);
    
    q.run(query, [favorite_id], function(status) {
        results = null;
        let meta = delete_meta(req, status);
        callback(status, results, meta);
    });
}

function delete_meta(req, status) { // meta data for view page
    // Always return a meta object with link_back, even on errors
    return {
        link_back: all.linkBack(req, 'item', '/favorites')
    };
}


/*
 * Formatting helpers for all favorite city records
 */
function format_record(item, keys) { // round figures, format dates
    if (typeof keys == "undefined" || keys === null) {
        keys = Object.keys(item);
    }
    let processed_record = item;
    
    for (let k = 0; k < keys.length; k++) {
        let key = keys[k];
        if (key.indexOf("stars_") > -1 || key == "avg_rating") {
            let number = item[key];
            processed_record[key] = Math.round(number * starsPrecision) / starsPrecision;
            
        } else if (key == "visited") {
            let date_val = item[key];
            if (!date_val || date_val === null || date_val === '') {
                processed_record[key] = '-';
            } else {
                let formatted_date = moment(date_val).format('MMM YYYY');
                processed_record[key] = formatted_date === 'Invalid date' ? '-' : formatted_date;
            }
            
        } else if (key == "story" && item[key] && item[key].length > 100) {
            // Truncate long stories for list view
            processed_record[key + "_short"] = item[key].substring(0, 100) + "...";
        }
    }
    
    return processed_record;
}


/*
 * Edit form data loading - get city info and existing favorite (if any)
 */
function edit(req, callback) {
    if (typeof callback !== "function") { return false; }
    
    let city_id = parseInt(req.params.city_id, 10);
    let user_id = req.params.user_id;
    
    // First get city information
    let city_query = `select id, city, country, image_path from ` + s.prefix(citiesTable) + ` where id = ?`;
    
    q.run(city_query, [city_id], function(status, city_results) {
        if (status != "success" || !city_results || city_results.length == 0) {
            return callback("error", null, null);
        }
        
        let city = city_results[0];
        
        // Then check if user already has a favorite for this city
        let favorite_query = `select id, visited, story, stars_scenery, stars_food, 
            stars_culture, stars_walkable, stars_vibe from ` + s.prefix(favoritesTable) + ` 
            where user_id = ? and city_id = ?`;
        
        q.run(favorite_query, [user_id, city_id], function(status, favorite_results) {
            let favorite = null;
            if (status == "success" && favorite_results && favorite_results.length > 0) {
                favorite = favorite_results[0];
                // Format the visited date for the form
                if (favorite.visited) {
                    let formatted_date = moment(favorite.visited).format('YYYY-MM-DD');
                    favorite.visited = formatted_date === 'Invalid date' ? '' : formatted_date;
                }
            }
            
            let results = {
                city: city,
                favorite: favorite
            };
            
            let meta = edit_meta(req, status, results);
            callback("success", results, meta);
        });
    });
}

function edit_meta(req, status, results) {
    if (status != "success") { return null; }
    
    // Check for hard override from form submission first
    if (req.body && req.body.link_back) {
        return {
            link_back: req.body.link_back
        };
    }
    
    // Determine link_back based on referrer, preserving impersonation
    let referrer = req.header('Referer') || '';
    let link_back = "/cities"; // default
    let impersonation_param = "";
    
    // Check if we're impersonating (admin with user_id)
    let user_role = req.params.user_role;
    let user_id = req.params.user_id;
    if (user_role === "admin" && user_id) {
        impersonation_param = "?user_id=" + user_id;
    }

    // Parse referrer to determine exact return path
    if (referrer.indexOf('/favorites') > -1) {
        let city_id = parseInt(req.params.city_id, 10);
        
        // Check if coming from specific favorites view page
        if (referrer.indexOf('/favorites/view/') > -1) {
            // Return to the specific favorites view page
            link_back = "/favorites/view/" + city_id + impersonation_param;
        
        } else {
            // Fallback for other favorites paths is the index page
            link_back = "/favorites" + impersonation_param;
        }
    
    } else {
        // Not from favorites - likely from cities page
        link_back += impersonation_param;
    }

    return {
        link_back: link_back
    };
}


/*
 * Edit form submission processing with validation
 */
function edit_post(req, callback) {
    if (typeof callback !== "function") { return false; }
    
    let city_id = parseInt(req.params.city_id, 10);
    let user_id = req.params.user_id;
    
    // First get city information for re-rendering on error
    let city_query = `select id, city, country, image_path from ` + s.prefix(citiesTable) + ` where id = ?`;

    q.run(city_query, [city_id], function(status, city_results) { 
        if (status != "success" || !city_results || city_results.length == 0) {
            return callback("error", null, null);
        }
        
        let city = city_results[0];
        
        // Validate form data
        let validation = validate_favorite_data(req.body);
        if (validation.fields.length > 0) {
            // Validation failed - return errors with form data
            let results = {
                city: city,
                favorite: req.body // return submitted data to re-fill form
            };
            
            let meta = {
                message: "Form could not be submitted, please check issues below",
                message_type: "error",
                validation_fields: validation.fields,
                validation_issues: validation.issues,
                link_back: edit_meta(req, "success", results).link_back
            };
            
            return callback("validation_error", results, meta);
        }
        
        // Validation passed - save to database
        save_favorite_data(req, city_id, user_id, function(save_status, save_results, save_meta) {
            if (save_status == "success") {
                // Update city averages after successful favorite save
                let cities = require("./cities.js");
                cities.update_averages(city_id, function(avg_status) {
                    // log.debug("City averages updated: " + avg_status);
                    
                    let results = { city: city, favorite: req.body };
                    let meta = edit_meta(req, "success", results);
                    callback("success", results, meta);
                });
            
            } else {
                // Database error
                let results = { city: city, favorite: req.body };
                let meta = {
                    message: "Could not save your rating. Please try again.",
                    message_type: "error",
                    link_back: edit_meta(req, "success", results).link_back
                };
                callback("error", results, meta);
            }
        });
    });
}

function validate_favorite_data(data) {
    let fields = [];
    let issues = [];
    
    // Story is required
    if (!data.story || data.story.trim().length == 0) {
        fields.push("story");
        issues.push("Please share your story about this city");

    } else if (data.story.length > 2000) {
        fields.push("story");
        issues.push("Story must be less than 2000 characters");
    }
    
    // Validate star ratings
    let star_fields = ['stars_scenery', 'stars_food', 'stars_culture', 'stars_walkable', 'stars_vibe'];
    for (let field of star_fields) {
        let value = parseInt(data[field], 10);
        if (isNaN(value) || value < 1 || value > 5) {
            fields.push(field);
            issues.push("Please rate " + field.replace('stars_', '') + " from 1 to 5 stars");
        }
    }
    
    // Validate visited date (optional)
    if (data.visited && data.visited.trim().length > 0) {
        let date = moment(data.visited, 'YYYY-MM-DD', true);
        if (!date.isValid()) {
            fields.push("visited");
            issues.push("Please enter a valid date");
        }
    }
    
    return {
        fields: fields,
        issues: issues
    };
}

function save_favorite_data(req, city_id, user_id, callback) {
    let data = req.body;
    
    // Check if record already exists
    let check_query = `select id from ` + s.prefix(favoritesTable) + ` where user_id = ? and city_id = ?`;
    
    q.run(check_query, [user_id, city_id], function(status, results) {
        if (status != "success") {
            return callback("error", null, null);
        }
        
        let visited_value = data.visited && data.visited.trim().length > 0 ? data.visited : null;

        if (results && results.length > 0) {
            // Update existing record
            let favorite_id = results[0].id;
            let update_query = `update ` + s.prefix(favoritesTable) + ` set 
                visited = ?, story = ?, stars_scenery = ?, stars_food = ?, 
                stars_culture = ?, stars_walkable = ?, stars_vibe = ? 
                where id = ?`;
            
            let params = [visited_value, data.story, data.stars_scenery, data.stars_food,
                data.stars_culture, data.stars_walkable, data.stars_vibe, favorite_id];
            
            q.run(update_query, params, function(update_status) {
                callback(update_status, null, null);
            });

        } else {
            // Insert new record
            let insert_query = `insert into ` + s.prefix(favoritesTable) + ` 
                (user_id, city_id, visited, story, stars_scenery, stars_food, 
                stars_culture, stars_walkable, stars_vibe) 
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            
            let params = [user_id, city_id, visited_value, data.story, data.stars_scenery, 
                data.stars_food, data.stars_culture, data.stars_walkable, data.stars_vibe];
            
            q.run(insert_query, params, function(insert_status) {
                callback(insert_status, null, null);
            });
        }
    });
}


/*
 * Demo Data System - Reset favorites with pre-generated demo data
 */

// Demo stories for different cities
let demo_stories = [
    "Amazing place! The architecture is breathtaking and the locals are incredibly friendly. Would definitely visit again.",
    "Beautiful city with rich history. The food scene is incredible and there's always something interesting happening.",
    "Loved the vibrant atmosphere and cultural diversity. Great museums and fantastic nightlife.",
    "Perfect blend of modern and traditional. The parks are gorgeous and it's so walkable.",
    "Charming streets and amazing coffee culture. Every corner has something unique to discover.",
    "Incredible scenery and outdoor activities. The mountain views are absolutely stunning.",
    "Historic charm meets contemporary innovation. The local markets are a feast for the senses.",
    "Fantastic public transportation and green spaces everywhere. Very environmentally conscious city.",
    "The art scene is phenomenal and the people are passionate about their culture.",
    "Great food, friendly people, and beautiful architecture. A perfect weekend getaway destination."
];

// Get all cities to generate demo data for
function get_cities_for_demo(callback) {
    let query = `select id, city, country from ` + s.prefix(citiesTable) + ` order by id`;
    q.run(query, [], callback);
}

// Get demo users (non-admin users for realistic demo data)
function get_demo_users(callback) {
    let query = `select id from ` + s.prefix(usersTable) + ` where role != 'admin' limit 10`;
    q.run(query, [], callback);
}

// Generate random demo data for a city-user combination
function generate_demo_rating() {
    return {
        story: demo_stories[Math.floor(Math.random() * demo_stories.length)],
        stars_scenery: Math.floor(Math.random() * 5) + 1,
        stars_food: Math.floor(Math.random() * 5) + 1,
        stars_culture: Math.floor(Math.random() * 5) + 1,
        stars_walkable: Math.floor(Math.random() * 5) + 1,
        stars_vibe: Math.floor(Math.random() * 5) + 1,
        visited: moment().subtract(Math.floor(Math.random() * 365), 'days').format('YYYY-MM-DD')
    };
}

// Main demo reset function - supports both 'prefill' and 'clear' modes
function demo_reset(mode, callback) {
    // Handle both old single-parameter and new dual-parameter usage
    if (typeof mode === "function") {
        callback = mode;
        mode = "prefill"; // default mode for backward compatibility
    }
    if (typeof callback !== "function") { callback = function() {}; }
    
    let action_name = mode === "clear" ? "clear" : "reset";
    // log.debug(`Starting demo data ${action_name}...`);
    
    // Step 1: Clear all existing favorites
    let clear_query = `truncate table ` + s.prefix(favoritesTable);
    
    q.run(clear_query, [], function(status) {
        if (status !== "success") {
            log.error(`Failed to clear favorites table for demo ${action_name}`);
            return callback("error");
        }
        log.debug("Cleared existing favorites data");
        
        // If clear mode, just reset averages to NULL and finish
        if (mode === "clear") {
            let reset_averages_query = `update ` + s.prefix(citiesTable) + ` set 
                ave_scenery = NULL, ave_food = NULL, ave_culture = NULL, 
                ave_walkable = NULL, ave_vibe = NULL`;
            
            q.run(reset_averages_query, [], function(avg_status) {
                if (avg_status !== "success") {
                    log.error("Failed to reset city averages after clear");
                } else {
                    log.debug("Reset city averages to NULL");
                }
                
                // Save clear date
                save_demo_reset_date();
                
                log.debug("Demo data clear completed successfully");
                callback("success");
            });
            return;
        }
        
        // Prefill mode: Step 2: Get cities and users for demo data
        get_cities_for_demo(function(cities_status, cities) {
            if (cities_status !== "success" || !cities || cities.length === 0) {
                log.error("Failed to get cities for demo data");
                return callback("error");
            }
            
            get_demo_users(function(users_status, users) {
                if (users_status !== "success" || !users || users.length === 0) {
                    log.error("Failed to get users for demo data");
                    return callback("error");
                }
                
                // Step 3: Generate demo favorites (each city gets 3-7 random ratings)
                let demo_favorites = [];
                
                for (let city of cities) {
                    let rating_count = Math.floor(Math.random() * 5) + 3; // 3-7 ratings per city
                    let used_users = new Set();
                    
                    for (let i = 0; i < rating_count && used_users.size < users.length; i++) {
                        let user_index;
                        do {
                            user_index = Math.floor(Math.random() * users.length);
                        } while (used_users.has(user_index));
                        
                        used_users.add(user_index);
                        let user = users[user_index];
                        let rating = generate_demo_rating();
                        
                        demo_favorites.push([
                            user.id, city.id, rating.visited, rating.story,
                            rating.stars_scenery, rating.stars_food, rating.stars_culture,
                            rating.stars_walkable, rating.stars_vibe
                        ]);
                    }
                }
                
                // Step 4: Insert demo data
                if (demo_favorites.length === 0) {
                    log.debug("No demo data to insert");
                    return update_all_city_averages(callback);
                }
                
                let insert_query = `insert into ` + s.prefix(favoritesTable) + ` 
                    (user_id, city_id, visited, story, stars_scenery, stars_food, 
                    stars_culture, stars_walkable, stars_vibe) values ?`;
                
                q.run(insert_query, [demo_favorites], function(insert_status) {
                    if (insert_status !== "success") {
                        log.error("Failed to insert demo favorites data");
                        return callback("error");
                    }
                    
                    log.debug(`Inserted ${demo_favorites.length} demo favorite records`);
                    
                    // Step 5: Update city averages and save reset date
                    update_all_city_averages(function(avg_status) {
                        if (avg_status !== "success") {
                            log.error("Failed to update city averages after demo reset");
                        }
                        
                        // Save reset date
                        save_demo_reset_date();
                        
                        log.debug("Demo data reset completed successfully");
                        callback("success");
                    });
                });
            });
        });
    });
}

// Update averages for all cities
function update_all_city_averages(callback) {
    if (typeof callback !== "function") { callback = function() {}; }
    
    let cities = require("./cities.js");
    
    // Get all city IDs
    get_cities_for_demo(function(status, city_results) {
        if (status !== "success" || !city_results) {
            return callback("error");
        }
        
        let update_promises = [];
        let completed = 0;
        let total = city_results.length;
        
        if (total === 0) {
            return callback("success");
        }
        
        for (let city of city_results) {
            cities.update_averages(city.id, function(update_status) {
                completed++;
                if (completed === total) {
                    callback("success");
                }
            });
        }
    });
}

// Save demo reset date to a simple file
function save_demo_reset_date() {
    let fs = require('fs');
    let today = moment().format('YYYY-MM-DD');
    
    try {
        fs.writeFileSync('./logs/last_demo_reset.txt', today, 'utf8');
        log.debug("Saved demo reset date: " + today);
    } catch (error) {
        log.error("Failed to save demo reset date: " + error.message);
    }
}

// Get last demo reset date
function get_last_demo_reset(callback) {
    if (typeof callback !== "function") { return false; }
    
    let fs = require('fs');
    
    try {
        let last_reset = fs.readFileSync('./logs/last_demo_reset.txt', 'utf8').trim();
        callback("success", last_reset);
    } catch (error) {
        // File doesn't exist or can't be read - treat as never reset
        callback("success", null);
    }
}
