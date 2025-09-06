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
    
    update_averages: update_averages
}


/* 
 * Global parameters
 */
let citiesTable = "cities";
let favoritesTable = "favorites";

let starsPrecision = 10; // 1 digit for star ratings


/*
 * Admin index page - all cities with their averages
 */
function index(req, callback) {
    if (typeof callback !== "function") { return false; }
    let query = s.querySelectAll(citiesTable); // log.debug("query: "+ query);
    
    q.run(query, null, function(status, results) { // log.debug(status); log.debug(results[0]); 
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

    for (let i = 0; i < results.length; i++) { // if (i < 3) { log.debug(results[i]); }
        processed_results[i] = format_record(results[i], keys);
    }
    return processed_results;
}

function index_structure(req /* , query_records */) {
    let columns = [
        { key: "id", label: "Id", sort: "asc" },
        { key: "city", label: "City", sort: "asc", sort_num: 1 }, 
        { key: "country", label: "Country", sort: "asc", sort_num: 2 }, 
        { key: "image_path", label: "Image" },
        { key: "ave_scenery", label: "Avg Scenery", sort: "desc" }, 
        { key: "ave_food", label: "Avg Food", sort: "desc" }, 
        { key: "ave_culture", label: "Avg Culture", sort: "desc" }, 
        { key: "ave_walkable", label: "Avg Walkable", sort: "desc" }, 
        { key: "ave_vibe", label: "Avg Vibe", sort: "desc" },
        { key: "overall_avg", label: "Overall", sort: "desc" }
    ];
    // columns = all.columnSortLinks(req, columns, "/cities"); // add sorting columns
    
    let actions = [
        { 
            label: "View",
            link: function(id) { return "/cities/view/"+ id; }
        },
        { 
            label: "Delete",
            link: function(id) { return "/cities/delete/"+ id; }
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
    let grand_total = meta_pagination ? meta_pagination.total : total; // all results, all pages
    let structure = index_structure(req /* , query_records */);
    let actions = structure.actions;
    
    // add column sorting, filters and actions as meta data
    let cols = all.columnSortLinks(req, structure.columns, "/cities"); // columns = columns.slice(0, 16);
    
    let meta = {
        total: total, // will be overwritten by meta_pagination.total
        columns: cols,
        actions: actions
    }
    return callback(status, meta);
}


/*
 * Cities admin index with pagination
 */
function index_page(req, callback) {
    let query = index_page_queries(req);
    
    q.run(query.total, function(stat, res) {
        let meta_pagination = index_page_meta_pagination(req, stat, res);
        
        q.run(query.records, query.params.records, function(status, results) {  // log.debug(status); log.debug(results[0]); 
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
    let order_str = col_sorting.length > 0 ? col_sorting.join(", ") : "city asc"; 
    // log.debug(order_str); log.debug(col_sorting);

    // Add calculated overall average in the SELECT
    let records = `select id, city, country, image_path, ave_scenery, ave_food, ave_culture, ave_walkable, ave_vibe,
        (ave_scenery + ave_food + ave_culture + ave_walkable + ave_vibe) / 5 as overall_avg
        from ` + s.prefix(citiesTable) + ` 
        order by ` + order_str + ` 
        limit ?, ?`;

    let total = s.select.count + 
        s.from + s.prefix(citiesTable);  
    // log.debug(total);
    
    let offset = req.params.offset;
    let limit = req.params.limit; // log.debug("offset: "+ offset +", limit: "+ limit);

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
    
    let pages_link = "/cities/page/";
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
 * View individual city (data record and meta data)
 */
function view(req, callback) { // log.debug("view()");
    let value = parseInt(req.params.id, 10);
    
    // Modified query to include rating count from favorites
    let query = `select c.*, 
        (select count(*) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id) as rating_count
        from ` + s.prefix(citiesTable) + ` c 
        where c.id = ?`;
    
    q.run(query, [value], function(status, results) { // log.debug(status); // log.debug(results[0]); 
        if (typeof callback == "function") {
            results = view_results(req, status, results);
            let meta = view_meta(req, status, results);
            callback(status, results, meta);
        }
    });
}

function view_results(req, status, results) { // preprocessing results
    if (status != "success") { return results; }
    
    let processed_results = format_record(results[0]); 
    
    // log.debug(processed_results);
    return processed_results;
}

function view_fields() {
    return [
        { key: "id", label: "Id" }, 
        { key: "city", label: "City" }, 
        { key: "country", label: "Country" }, 
        { key: "image_path", label: "Image Path" }, 
        { key: "ave_scenery", label: "Average Scenery Rating" }, 
        { key: "ave_food", label: "Average Food Rating" }, 
        { key: "ave_culture", label: "Average Culture Rating" }, 
        { key: "ave_walkable", label: "Average Walkability Rating" }, 
        { key: "ave_vibe", label: "Average Vibe Rating" },
        { key: "overall_avg", label: "Overall Average Rating" }
    ];
}

function view_meta(req, status, results) { // meta data for view page
    if (status != "success") { return null; }
    // log.debug("view_meta()");

    let fields = view_fields();
    
    let js_results = Object.assign({}, results);
    let js = [
        { variable: "fields", value: JSON.stringify(fields), type: "json" },
        { variable: "results", value: JSON.stringify(js_results), type: "json" }
    ];
    
    let link_back = all.linkBack(req, 'city', '/cities');

    return {
        fields: fields,
        link_back: link_back,
        js: js
    }
}


/*
 * Admin delete to remove a city
 */
function del(req, callback) { // log.debug("delete()");
    let value = parseInt(req.params.id, 10);
    let query = s.queryDeleteRecord(citiesTable, "id", value); // log.debug("query: "+ query);
    
    q.run(query, [value], function(status) { // log.debug(status); // log.debug(results[0]); 
        results = null;
        let meta = delete_meta(req, status);
        callback(status, results, meta);
    });
}

function delete_meta(req, status) { // meta data for delete page
    if (status != "success") { return null; }
    // log.debug("delete_meta()");

    return {
        link_back: all.linkBack(req, 'city', '/cities')
    }
}


/*
 * Update city averages from favorites data
 */
function update_averages(city_id, callback) {
    if (typeof callback !== "function") { callback = function() {}; }
    
    // Calculate averages from favorites for this city
    let avg_query = `update ` + s.prefix(citiesTable) + ` c set
        ave_scenery = (select avg(stars_scenery) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id),
        ave_food = (select avg(stars_food) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id),
        ave_culture = (select avg(stars_culture) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id),
        ave_walkable = (select avg(stars_walkable) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id),
        ave_vibe = (select avg(stars_vibe) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id)
        where c.id = ?`;
    
    q.run(avg_query, [city_id], function(status) {
        callback(status);
    });
}

/*
 * Formatting helpers for all city records
 */
function format_record(item, keys) { // round figures, format dates
    if (typeof keys == "undefined" || keys === null) {
        keys = Object.keys(item);
    }
    let processed_record = item;
    
    for (let k = 0; k < keys.length; k++) {
        let key = keys[k];
        if (key.indexOf("ave_") > -1 || key == "overall_avg") {
            let number = item[key];
            processed_record[key] = Math.round(number * starsPrecision) / starsPrecision;
        }
    }
    
    // Calculate overall average
    if (item.ave_scenery && item.ave_food && item.ave_culture && item.ave_walkable && item.ave_vibe) {
        let overall = (item.ave_scenery + item.ave_food + item.ave_culture + item.ave_walkable + item.ave_vibe) / 5;
        processed_record["overall_avg"] = Math.round(overall * starsPrecision) / starsPrecision;
    }
    
    return processed_record;
}
