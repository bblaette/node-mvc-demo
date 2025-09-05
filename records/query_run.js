
let db = require('../main/database.js');
let log = require('../main/logging.js');

module.exports = {
    // init: init, 
    run: run
};


/* 
 * Module globals and defaults
 */
var dbStore = null; // contains an object with a connection pool


/*
 * Initialization and end of connection pool
 */
init();
dbStore.auto(5000); // set timeout for consecutive requests to 5 sec

function init() {
    if (dbStore !== null) { return; } // use the pool we have
    dbStore = new db();
}


/*
 * Run an actual query with a result callback
 */
function run(query, parameters, result_callback) {
    // log.debug('query: '+ query);
    if (typeof parameters == "function") { // no parameters (function!)
        result_callback = parameters;
        return dbStore.run(query, null, result_callback);
    }
    
    return dbStore.run(query, parameters, result_callback);
}
