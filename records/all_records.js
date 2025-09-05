
// let records = require("../records/favorites.js");
let s = require("./query_string.js");
let q = require("./query_run.js");
let log = require('../main/logging.js');
let parallel = require('asynckit/parallel'); // https://www.npmjs.com/package/asynckit


module.exports = {    
    linkBack: linkBack,
    
    indexPagination: indexPagination,
    
    columnSortLinks: columnSortLinks,
    
    columnSortOrder: columnSortOrder,
    
    columnFilterLinks: columnFilterLinks,
    
    httpDomain: httpDomain,
    
    httpBase: httpBase,

    siteBase: siteBase
}


/*
 * Helper function to check parameter type, e.g. "(int)" or "^\\d$"
 */
let os = require("os");

function linkBack(req, ref_contains, default_link) { // log.debug("linkBack()");
    if (typeof req.header('Referer') != "string") { 
        return default_link;
    }
    if (req.header('Referer').indexOf(ref_contains) == -1) { 
        return default_link;
    }
    
    let site_base = siteBase(req);
    // let http_base = httpBase(req);
    let referer = req.header('Referer');
    let referer_short = referer.replace(/^http..?\/\/[^\/]+/i, ""); // no http://...
    let base_idx = referer_short.indexOf(site_base);
    if (base_idx === 0 && site_base.length > 0) {
        referer_short = referer_short.substring(site_base.length);
    }
    
    return referer_short;
}

/*
 * Pagination globals and helpers
 */
var paginationDefaultLimit = 10;

function indexPagination(req, results, page_link) { 

    if (typeof results != "object" || typeof results[0] != "object" ||
        req.params.hasOwnProperty("page") == false) { return false; }
    
    let total = 0;
    for (let key in results[0]) { 
        if (key.indexOf("count") > -1) {
            total = results[0][key]; break;
        }
    }

    let url_str = urlParts(req);
    let query_tail = url_str.query.length > 0 ? "?"+ url_str.query : "";
    
    let page = parseInt(req.params.page, 10); 
    if (page <= 0) { page = 1; }
    let limit = req.params.hasOwnProperty("limit") ?
        req.params.limit : paginationDefaultLimit;  
    if (limit <= 0) { limit = 1; }
    
    let from = (page - 1) * limit + 1;
    let to = from + limit - 1;
    if (total < to) { to = total; }
    if (from > to)  { from = 0; to = 0; }
    // log.debug("pagination, from: "+ from +", to: "+ to);
    
    let page_first = 1;
    let page_last = total > 0 ? parseInt((total-1) / limit, 10) + 1 : 1;
    let page_prev = page <= 1 ? null: page - 1;
    let page_next = page >= page_last ? null: page + 1;
    
    let pages = []; // page_link = "/favorites/page/";
    page_link = page_link.replace(/\/\s*$/, "") +"/"; // force trailing
    for (let i = page_first; i <= page_last; i++) {
        pages.push({
            label: i, 
            link: page_link + i + query_tail
        });
    }
    let pages_jump = [];
    pages_jump.push({ label: "<<", link: page_link +"1"+ query_tail });
    pages_jump.push({ label: "<", link: page_prev ? page_link + page_prev + query_tail : null });
    pages_jump.push({ label: ">", link: page_next ? page_link + page_next + query_tail : null });
    pages_jump.push({ label: ">>", link: page_link + page_last + query_tail });
    
    return {
        total: total,
        limit: limit,
        from: from,
        to: to,
        page: page,
        page_first: page_first,
        page_last:  page_last,
        page_prev:  page_prev,
        page_next:  page_next,
        pages: pages,
        pages_jump: pages_jump
    }
}


/*
 * Add filtering links to definition of columns
 * 
 * Only columns with a filter parameter will get filter_links
 * Other parameters in the query string are preserved
 * 
 * { "sort": "id-up.ck-dn",
 *   "filter": "rco-in(ar01-18)(po02-18)~~id-ge(27)~~rid-eq(R5o30)~~
                id-bt(10)(19)~~ttl-bt(an)(lo)~~fil-xt(txt)(pdf)~~
                ttl-lk(New+things*)"  }  // req.query
 */
var filterDelim = "~~";
var filterCodes = [
    "in", "eq", "iq", "ge", "gt", "le", "lt", "bt", "xt", "lk" 
];
var filterMarkKey = "##--KEY--##";
var filterMarkFilter = "##--FILTER--##";


function columnFilterLinks(req, columns, total, query_records, base_path, callback) { // log.debug("columnFilterLinks()");
    if (typeof callback !== "function") { return false; }

    let lookup = columnKeysShort(columns);
    let query_filter = columnFilterSplit(req); // filter info in req
    // log.debug("query_records: "+ query_records);
    
    let url_str = urlParts(req); // log.debug(urlParts(req));
    let url_path = typeof base_path == "undefined" || url_str.path.indexOf(base_path) > -1 ?
        url_str.path : base_path;
    let mask_replace = filterMarkFilter; // "##--FILTER--##";
    let query_mask = url_str.query.replace(/filter\=[^\&]*\&?/g, mask_replace).replace(/\&$/, "");
    // log.debug(lookup); log.debug(req.query); log.debug(query_sort);
    
    // log.debug("column loop filters...");

    // parallel() is part of asynckit: https://github.com/alexindigo/asynckit
    parallel( // array_to_iterate, async_func_and_callback, result_callback
        columns, 
        function(column, i, callbk) {
            let details = columnFilterDetails(column, query_filter, lookup);
            // log.debug("parallel: "+ i); log.debug(details);
            if (details === false) { 
                return callbk(null, column); // "continue", keep original
            }
            
            let key = details.key;
            let type = details.type;  // let type = key == "end_date" ? "year-mon-day" : "left-3";
            
            let query = columnFilterQuery(req, type, key, total, query_records);
            // log.debug("query: "+ query);
            if (query == false) { /** handle error **/ 
                return callbk(null, column); // "continue", next column
            }
     
            let params = [];
            let grand_total = total; // total of all current records
            q.run(query, params, function(stat, res) { 
                // log.debug(stat); // log.debug(results); // log.debug(results[0]);
                if (stat != "success") {
                    return callbk(null, column); // can't do much
                }
                
                let processed_results = columnFilterProcessed(res, type, grand_total); 
                // log.debug("key: "+ key);  log.debug(processed_results);
                if (processed_results === false) {
                    return callbk(null, column);
                }
                column.filter_values = processed_results;
                
                return callbk(null, column); // can't do much
                // result_callback(processed_results);
                // result_callback(status, processed_results);
            });
            
            // callbk(null, column);
        },
        function(status, columns_done) {
            // log.debug("columns_done");
            // log.debug(columns_done);
            // log.debug(status);
            callback("success", columns_done);
        }
    );

    /***                 
        // let qu_quest = qu_sort_str.length > 0 || query_tail.length > 0 ? "?" : "";
        // let qu_amp = qu_sort_str.length > 0 && query_tail.length > 0 ? "&" : ""; 
        // columns[i].sort_link = url_path + qu_quest + qu_sort_str + qu_amp + query_tail;
        // columns[i].sort_flag = sort.flag;
        columns[i].filter_values = query_run; // function for filters
    }
    ***/
    
    // log.debug(columns); // log.debug(query_tail);
    // callback("success", columns);
    // return columns;
}

function columnFilterProcessed(results, type, total) { // log.debug("columnFilterProcessed()"); // post-process database results
    if (typeof results == "undefined" || !results) { return false; }
    if (typeof results[0].count == "undefined") { return false; }
    
    let fops = columnFilterOperators(type, total);
    if (fops === false) { return false; }
    
    let step_add = 0; // for step boundary, if any
    let step_digits = 0; // step precision, if any
    // let processed = {}; // processed results
    let processed = []; // processed results
    
    for (let r = 0; r < results.length; r++) {
        let result = results[r];
        let value = result.count;
        let key = "";
        let key_arr = [];

        for (let i = 0; i < fops.as.length; i++) {
            let as = fops.as[i];
            let dash = i > 0 ? "-" : ""; //// use fop.delimiter perhaps?

            if (typeof result[as] == "undefined") { break; }
            let k = result[as];
            if (as == "year" || as == "month" || as == "day") { 
                if (k < 10) { k = "0"+ k; }
                key_arr.push(k);
                
            } else if (as.indexOf("step-") === 0) { // i < 1
                let k_val = parseFloat(k, 10); // log.debug(k_val); 
                let step_str = as.replace(/[^\.\d]/g, "");
                let step_val = parseFloat(step_str, 10); // log.debug(step_val);
                if (r == 0 && i == 0) { // do this once for all results
                    step_add = step_val; // reasonable default
                    let step_dot_pos = step_str.indexOf(".");
                    let is_fraction = step_dot_pos > -1;
                    // log.debug("step_dot_pos: "+ step_dot_pos);
                    if (is_fraction) {
                        step_digits = step_str.length - step_dot_pos - 1;
                    }
                }
                if (!isNaN(k_val) && !isNaN(step_val)) {
                    let is_last = r == results.length - 1;
                    let is_first = r == 0;
                    let k_step = k_val + step_add;
                    if (step_digits > 0) {
                        k_step = k_step.toFixed(step_digits);
                        k = k.toFixed(step_digits);
                    }
                    key_arr.push(parseFloat(k));
                    key_arr.push(parseFloat(k_step));
                    k = is_last ? "≥ "+ k :
                        is_first ? "< "+ k_step :
                        k +" ≤ .. < "+ k_step;
                }
                
            } else if (as.indexOf("irst-") === 1) { // first or First
                key_arr.push(k);
            }
            key += dash + k;
            // log.debug(k); log.debug(key);
        }
        if (key.length == 0) { key = "(empty)"; /* key_arr = [ "(empty)" ]; */ }
        // processed[key] = value;
        processed.push({
            // type: type,
            keys: key_arr,
            text: key,
            count: value
        });
    }
    
    return processed;
}

function columnFilterQuery(req, type, key, total, query_records) { // log.debug("columnFilterQuery()");
    let query_fops = "";
    let group_fops = "";
    let query_core = columnFilterQueryCore(query_records);
    // log.debug(query_core);
    
    let fops = columnFilterOperators(type, total);
    // log.debug(fops);
    
    let query_select = "SELECT "+ fops.select +", count(*) as 'count' ";
    let query_group = fops.group != "" ? "GROUP BY "+ fops.group : "";
    query_select = query_select.split(filterMarkKey).join(key);
    query_group = query_group.split(filterMarkKey).join(key);
    let query = query_select + query_core + query_group;
    
    return query;
}

function columnFilterQueryCore(query_records) {
    // extract core of the query
    let query_from = query_records.toLowerCase().indexOf("from");
    let query_to_1 = query_records.toLowerCase().lastIndexOf("order by");
    let query_to_2 = query_records.toLowerCase().lastIndexOf("limit");
    if (query_from < 0) { query_from = 0; }
    if (query_to_1 < 0) { query_to_1 = query_records.length; }
    if (query_to_2 < 0) { query_to_2 = query_records.length; }
    let query_to = query_to_1 < query_to_2 ? query_to_1 : query_to_2;
    // log.debug(query_from +", "+ query_to_1 +", "+ query_to_2); log.debug(query_from +" -> "+ query_to);
    let query_core = query_records.substring(query_from, query_to); // log.debug(query_core);
    
    return query_core;
}

function columnFilterOperators(type, total) {
    if (typeof type == "undefined") { return false; }
    if (typeof total == "undefined") { total = false; }
    // log.debug("(cfo) total: "+ total);
    
    let select = "";
    let as = [];
    let where = "";
    let group = "";
    let key = filterMarkKey; // use placeholder now -> columnFilterQuery
    let step_max = 40;
    
    if (type.indexOf("step") === 0) { // case sensitive a-zA-Z0-9
        let step = parseFloat(type.replace(/[^\.\d]/g, ""), 10); // log.debug("step: "+ step);
        if (!step) {
            let step_frac = total ? Math.floor(total / step_max) : 1;
            let step_base = parseInt("1"+ "0".repeat(String(step_frac).length - 1), 10);
            let step_calc = step_frac <= step_base * 1.5 ? step_base :
                step_frac <= step_base * 3 /* 3.5 */ ? step_base * 2 :
                step_frac <= step_base * 7 /* 7.5 */ ? step_base * 5 : step_base * 10;
            // if (step < step_calc) { step = step_calc; }
            step = step_calc;
            // log.debug("step_frac: "+ step_frac); log.debug("step_base: "+ step_base); 
            // log.debug("step_calc: "+ step_calc); log.debug("step: "+ step);
        }
        let alias = "step-"+ step;
        as.push(alias);
        let func = step +"*FLOOR("+ key +"/"+ step +")";
        select = func +" AS '"+ as[0] +"'"; // mysql filter with group by
        group =  func;
        
    } else if (type.indexOf("irst") === 1) { // first n characters
        let len = parseInt(type.replace(/[^\d]/g, ""), 10); // log.debug("First: "+ len);
        if (!len) { len = 1; } // 1 ... len
        let case_sens = type[0] == "F";
        as.push(type);
        let func = case_sens ? "LEFT("+ key +", "+ len +")" :
            "LOWER(LEFT("+ key +", "+ len +"))";
        select = func +" AS '"+ as[0] +"'"; // mysql filter with group by
        group =  func;
        
    } else if (type.indexOf("year-month-day") === 0) {
        operators = [ "YEAR", "MONTH", "DAY" ]; // mysql functions
        as = [ 'year', 'month', 'day' ];
        select = "YEAR("+ key +") AS '"+ as[0] +"', "+
            "MONTH("+ key +") AS '"+ as[1] +"', "+
            "DAY("+ key +") AS '"+ as[2] +"'";
        group =  "YEAR("+ key +"), MONTH("+ key +"), DAY("+ key +")";
    }
    
    return {
        select: select,
        as: as,
        where: where,
        group: group
    }
}

/*
 * Split up filter parameter from query into code and value parts
 */
function columnFilterSplit(req) { // log.debug("columnFilterSplit()");
    let filters = typeof req.query.filter == "string" ? req.query.filter.split(filterDelim) : [];
    let filter_parts = {};
    
    for (let i = 0; i < filters.length; i++) {
        let f_str = filters[i];
        let f_parts = f_str.match(/^([a-z0-9]+\-[a-z0-9]+)\((.*)\)$/i);
        // log.debug(f_str); // log.debug(f_parts);
        if (!f_parts || f_parts.length < 3) { continue; } // no matching parts
        
        let code = f_parts[1].toLowerCase();
        let values = f_parts[2].split(")(");
        if (typeof filter_parts[code] != "undefined") { continue; } 
        
        filter_parts[code] = values;
        // log.debug({ code: code,  values: values });
    }
    // log.debug(filter_parts);
    
    return filter_parts;
}

/*
 * Determine current filter and default for given column
 */
function columnFilterDetails(column, query_filter, lookup) {
    if (typeof column.filter == "undefined") { return false; }
    
    let key = column.key;
    if (typeof column.qkey != "undefined") { key = column.qkey; }
    
    let key_short = lookup.short[key];  // log.debug(key +": "+ key_short);
    
    let filter_code = column.filter;
    let unknown_code = !filter_code.length || filterCodes.indexOf(filter_code) == -1;
    if (unknown_code) { return false; }
    
    let filter_default = key_short +"-"+ filter_code;
    
    let filter_current = typeof query_filter[filter_default] != "undefined" ?
        filter_default : false;
    
    let values = filter_current === false ? [] : query_filter[filter_current];
    
    let filter_types = [ "step", "first", "First", "year-month-day" ];
    let default_type = "first"; // alphabetic / first letter
    let type = typeof column.filter_type != "undefined" && 
        filter_types.indexOf(column.filter_type.replace(/-[\.\d]+/g, "")) > -1 ? 
        column.filter_type : default_type;
        
    return {
        key: key,
        filter: filter_code,
        type: type,
        defined: filter_default,
        
        current: filter_current,
        values: values
        // flag: sort_flag
    }
}



/*
 * Add sorting links to definition of columns
 * 
 * Only columns with a sort parameter will get a sort_link
 * Other parameters in the query string are preserved
 * Sorting toggles through 3 states: default -> opposite -> no sorting
 * 
 * { "sort": "id-up.ck-dn",
 *   "filter": "rco-like-abc def|cka-ge-3.5" }  // req.query
 *
 * [ "id-up", "ck-dn" ]  // query_sort
 *
 * { "key": "r_code", "label": "Respondent", "sort": "asc", "sort_num": 1, 
 *   "sort_link": "/favorites?sort=rco-dn" },
 * { "key": "end_date", "label": "Date", "sort": "desc", "sort_num": 2,
 *   "sort_link": "/favorites?sort=end-up" }  // columns with sort_links
 */
var sortDelim = "~~";

function columnSortLinks(req, columns, base_path) {
    let lookup = columnKeysShort(columns);
    let query_sort = typeof req.query.sort == "string" ? req.query.sort.split(sortDelim) : [];
    let url_str = urlParts(req); // log.debug(urlParts(req));
    let url_path = typeof base_path == "undefined" || url_str.path.indexOf(base_path) > -1 ?
        url_str.path : base_path;
    let query_tail = url_str.query.replace(/sort\=[^\&]*\&?/g, "").replace(/\&$/, "");
    // log.debug(lookup); log.debug(req.query); log.debug(query_sort);
    
    for (let i = 0; i < columns.length; i++) {        
        // get current and defined sorting order for given column
        let sort = columnSortDetails(columns[i], query_sort, lookup);
        if (sort === false) { continue; } // no sorting for this column
        
        // 3 toggle states: up -> down -> <remove sort> -> up -> ...
        // likewise:        down -> up -> <remove sort> -> down -> ...
        let sort_param = sort.current == sort.defined ? 
            (sort.current == sort.up ? sort.dn : sort.up) : 
            (sort.current === false ? sort.defined : false); // false == <remove sort>
        // log.debug(sort.current +" -> "+ sort_param);
        
        let qu_sort_str = "";
        if (sort_param !== false) { query_sort.push(sort_param); }
        
        for (let s = 0; s < query_sort.length; s++) {
            if (query_sort[s] === sort.current) { continue; } // skip
            let del = qu_sort_str.length > 0 ? sortDelim : "";
            qu_sort_str += del + query_sort[s]; // keep other params
        }
        if (qu_sort_str.length > 0) {
            qu_sort_str = "sort="+ qu_sort_str;
        }
        if (sort_param !== false) { query_sort.pop(); }
        // log.debug("qu_sort_str: "+ qu_sort_str);
        
        let qu_quest = qu_sort_str.length > 0 || query_tail.length > 0 ? "?" : "";
        let qu_amp = qu_sort_str.length > 0 && query_tail.length > 0 ? "&" : "";
        columns[i].sort_link = url_path + qu_quest + qu_sort_str + qu_amp + query_tail;
        columns[i].sort_flag = sort.flag;
        // log.debug(columns[i].sort_link); // log.debug(columns[i]);
    }
    // log.debug(columns); // log.debug(query_tail);
    
    return columns;
}

/*
 * Determine sorting order based on request parameter and column specs
 */
function columnSortOrder(req, columns) {
    let lookup = columnKeysShort(columns);
    let query_sort = typeof req.query.sort == "string" ? req.query.sort.split(sortDelim) : [];
    let col_sorting = [];  // log.debug("-- columnSortOrder --"); log.debug(query_sort);
    let col_strings = [];
    
    for (let i = 0; i < query_sort.length; i++) { // query comes first
        let qu_spec = query_sort[i].toLowerCase();
        let qu_parts = qu_spec.split("-");
        let qu_key = qu_parts.length > 0 ? qu_parts[0] : false;
        let qu_up_dn = qu_parts.length > 1 ? qu_parts[1] == "up" || qu_parts[1] == "dn" : false;
        
        if (qu_up_dn && qu_key && typeof lookup.key[qu_key] != "undefined") {
            col_sorting.push(qu_spec);
            let order_str = interpretSortParam(qu_spec, lookup);
            if (order_str !== false) { col_strings.push(order_str); }
        }
    }
    
    let num_sorting = [];
    let any_sorting = [];
    for (let i = 0; i < columns.length; i++) { // next any sort_nums
        let sort = columnSortDetails(columns[i], query_sort, lookup);
        if (sort === false) { continue; }
        
        var sort_current = sort.current ? sort.current : sort.defined;
        if (col_sorting.indexOf(sort_current) > -1) { continue; }
        
        var sort_num = typeof columns[i].sort_num != "undefined" ? columns[i].sort_num : false;
        if (sort_num !== false && typeof num_sorting[sort_num] == "undefined") {
            num_sorting[sort_num] = sort_current;
        
        } else {
            any_sorting.push(sort_current);  // finally unordered sorts
        }
    }
    for (let i = 0; i < num_sorting.length; i++) {
        if (!num_sorting[i]) { continue; } 
        let order_str = interpretSortParam(num_sorting[i], lookup);
        if (order_str !== false) { col_strings.push(order_str); }
    }
    for (let i = 0; i < any_sorting.length; i++) {
        let order_str = interpretSortParam(any_sorting[i], lookup);
        if (order_str !== false) { col_strings.push(order_str); }
    }
    // log.debug(num_sorting); log.debug(any_sorting); log.debug(col_sorting); 
    // log.debug("col_strings: "); log.debug(col_strings);
    
    return col_strings;
}

/*
 * Translate sort params for query, incl. up -> ASC and dn -> DESC
 */
function interpretSortParam(param_str, lookup) {
    let parts = param_str.split("-");
    let k = parts.length > 0 ? parts[0] : false;
    if (k === false) { return false; }
    if (typeof lookup.key[k] == "undefined") { return false; }
    
    let up_dn = parts.length > 1 ? 
        (parts[1] == "dn" ? " DESC" : " ASC") : "";
        
    let order_str = lookup.key[k] + up_dn;
    return order_str;
}


/*
 * Determine current sorting order and sorting default for given column
 */
function columnSortDetails(column, query_sort, lookup) {
    if (typeof column.sort == "undefined") { return false; }
    
    let key = column.key;
    if (typeof column.qkey != "undefined") { key = column.qkey; }
    
    let key_short = lookup.short[key];  // log.debug(key +": "+ key_short);
    let sort_default = column.sort == "desc" || column.sort == "dn" ? 
        key_short +"-dn" : key_short +"-up";
    let sort_up = key_short +"-up";
    let sort_dn = key_short +"-dn";
    
    let sort_flag = query_sort.indexOf(sort_up) > -1 ? "up" : 
        query_sort.indexOf(sort_dn) > -1 ? "dn" : "";
    let sort_current = sort_flag == "up" ? sort_up : 
        sort_flag == "dn" ? sort_dn : false;
        
    return {
        key: key,
        up: sort_up,
        dn: sort_dn,
        defined: sort_default,
        current: sort_current,
        flag: sort_flag
    }
}


/*
 * Generate lookup table to get shortened column keys (sort and filter)
 */
function columnKeysShort(columns) {
    let lookup_key = {};
    let lookup_short = {};
    let short_keys = [];
    let short_i = {};
    let key_i = {};
    
    for (let i = 0; i < columns.length; i++) {
        let key = columns[i].key;
        if (typeof columns[i].qkey != "undefined") { key = columns[i].qkey; }
        
        let key_compressed = key.toLowerCase().replace(/^[a-z].?\./, "").replace(/[^0-9a-z]/g, "");
        var key_short = key_compressed.substring(0, 3);

        let n = 0; let k = key_short;
        while (short_keys.indexOf(k) > -1) {
            if (n == 0) { 
                k = key_compressed.substring(0, 4);
                
            } else {
                k = key_short + n;
            }
            n++;
        }
        short_keys.push(k);
        
        lookup_key[key] = k;
        lookup_short[k] = key;
        
        short_i[k] = i; // remember column index for reverse lookup
        key_i[key] = i; 
    }
    
    return {
        short: lookup_key,
        key: lookup_short,
        short_i: short_i,
        key_i: key_i
    }
}


/*
 * Get site base folder (if any -> see ../main/site.js)
 */
function siteBase(req) { 
    return req.app.locals.site_base; 
}


/*
 * Get protocol and domain
 */
function httpDomain(req) {
    let env = req.app.locals.env;
    let protocol = env == "DEV" ? "http" : "https"; // req.protocol;
    let host = req.hasOwnProperty("session") && req.session.hasOwnProperty("host") ? 
        req.session.host : (req.app.locals.host ? req.app.locals.host : req.headers.host);
    // log.debug("httpDomain"); log.debug(req.session); log.debug(req.headers);
    
    return protocol +"://"+ host;
}


/*
 * Get protocol, domain and site_base directory (if any)
 */
function httpBase(req) {
    let http_domain = httpDomain(req);
    let site_base = siteBase(req);
    
    return http_domain + site_base;
}


/*
 * Get original url parts
 */
function urlParts(req) {
    let original = req.originalUrl
    let path = original.replace(/\?.*$/g, "");
    let query = original.replace(path, "").replace(/^\?/, "");
    
    return {
        original: original,
        path: path,
        query: query
    }
}

