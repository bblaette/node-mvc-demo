let s = require("./query_string.js");
let q = require("./query_run.js");
let all = require("./all_records.js");
let moment = require("moment");
let log = require('../main/logging.js');

module.exports = {    
    showcase: showcase
}


/* 
 * Global parameters
 */
let citiesTable = "cities";
let favoritesTable = "favorites";

let starsPrecision = 10; // 1 digit for star ratings


/*
 * Home page city showcase with General/Featured/Trending sections
 */
function showcase(req, callback) {
    if (typeof callback !== "function") { return false; }
    
    // Run general query first - this is critical for home page
    let general_query = showcase_general_query();
    
    q.run(general_query, null, function(general_status, general_results) {
        // If general query fails, we still try to return something
        if (general_status != "success") {
            log.error("General cities query failed for home showcase");
            let fallback_results = { general: [], featured: [], trending: [] };
            let fallback_meta = showcase_meta(req, fallback_results);
            return callback("error", fallback_results, fallback_meta);
        }
        
        // General query succeeded, now try optional queries
        let featured_query = showcase_featured_query();
        let trending_query = showcase_trending_query();
        
        q.run(featured_query, null, function(featured_status, featured_results) {
            // If featured fails, log it but continue
            if (featured_status != "success") {
                log.debug("No featured cities - section will be hidden");
                featured_results = [];
            }
            
            q.run(trending_query, null, function(trending_status, trending_results) {
                // If trending fails, log it but continue
                if (trending_status != "success") {
                    log.debug("No trending cities - section will be hidden");
                    trending_results = [];
                }
                
                let results = showcase_results(req, general_status, general_results, featured_status, featured_results, trending_status, trending_results);
                let meta = showcase_meta(req, results);
                
                // Always return success if we have general results
                callback("success", results, meta);
            });
        });
    });
}

function showcase_general_query() {
    // Always get 6 cities for potential fallback, randomized by current date
    let query = `select id, city, country, image_path, ave_scenery, ave_food, ave_culture, ave_walkable, ave_vibe,
        (ave_scenery + ave_food + ave_culture + ave_walkable + ave_vibe) / 5 as overall_avg,
        (select count(*) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id) as rating_count
        from ` + s.prefix(citiesTable) + ` c 
        order by RAND(DAYOFYEAR(NOW())) 
        limit 6`;
    
    return query;
}

function showcase_featured_query() {
    // Cities with credible ratings (3+ ratings) ordered by overall average
    let query = `select c.id, c.city, c.country, c.image_path, c.ave_scenery, c.ave_food, c.ave_culture, c.ave_walkable, c.ave_vibe,
        (c.ave_scenery + c.ave_food + c.ave_culture + c.ave_walkable + c.ave_vibe) / 5 as overall_avg,
        (select count(*) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id) as rating_count
        from ` + s.prefix(citiesTable) + ` c 
        where (select count(*) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id) >= 3
        order by (c.ave_scenery + c.ave_food + c.ave_culture + c.ave_walkable + c.ave_vibe) / 5 desc
        limit 3`;
    
    return query;
}

function showcase_trending_query() {
    // Cities ordered by most recent rating activity
    let query = `select c.id, c.city, c.country, c.image_path, c.ave_scenery, c.ave_food, c.ave_culture, c.ave_walkable, c.ave_vibe,
        (c.ave_scenery + c.ave_food + c.ave_culture + c.ave_walkable + c.ave_vibe) / 5 as overall_avg,
        (select count(*) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id) as rating_count,
        (select max(f.updated_at) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id) as last_rating
        from ` + s.prefix(citiesTable) + ` c 
        where (select count(*) from ` + s.prefix(favoritesTable) + ` f where f.city_id = c.id) > 0
        order by last_rating desc
        limit 3`;
    
    return query;
}

function showcase_results(req, general_status, general_results, featured_status, featured_results, trending_status, trending_results) {
    let processed_results = {
        general: [],
        featured: [],
        trending: []
    };
    
    // Process general results (always present)
    if (general_status == "success" && general_results && general_results.length > 0) {
        // Check if we have featured or trending results
        let has_featured = featured_status == "success" && featured_results && featured_results.length > 0;
        let has_trending = trending_status == "success" && trending_results && trending_results.length > 0;
        
        // If we have other sections, limit general to 3, otherwise show all 6
        let general_limit = (has_featured || has_trending) ? 3 : 6;
        processed_results.general = general_results.slice(0, general_limit);
        
        // Process and format general cities
        for (let i = 0; i < processed_results.general.length; i++) {
            processed_results.general[i] = format_record(processed_results.general[i]);
        }
    }
    
    // Process featured results (conditional)
    if (featured_status == "success" && featured_results && featured_results.length > 0) {
        processed_results.featured = featured_results;
        for (let i = 0; i < processed_results.featured.length; i++) {
            processed_results.featured[i] = format_record(processed_results.featured[i]);
        }
    }
    
    // Process trending results (conditional)
    if (trending_status == "success" && trending_results && trending_results.length > 0) {
        processed_results.trending = trending_results;
        for (let i = 0; i < processed_results.trending.length; i++) {
            processed_results.trending[i] = format_record(processed_results.trending[i]);
        }
    }
    
    return processed_results;
}

function showcase_meta(req, results) {
    return {
        has_featured: results.featured.length > 0,
        has_trending: results.trending.length > 0,
        general_count: results.general.length,
        featured_count: results.featured.length,
        trending_count: results.trending.length
    };
}

/*
 * Formatting helpers for city records
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
    
    // Calculate overall average if individual averages exist
    if (item.ave_scenery && item.ave_food && item.ave_culture && item.ave_walkable && item.ave_vibe) {
        let overall = (item.ave_scenery + item.ave_food + item.ave_culture + item.ave_walkable + item.ave_vibe) / 5;
        processed_record["overall_avg"] = Math.round(overall * starsPrecision) / starsPrecision;
    }
    
    return processed_record;
}