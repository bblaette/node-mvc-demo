
let config = require('../main/config.js');
let mysql = require('mysql2');
let log = require('./logging.js');

/*
 * DB class to handle independent query requests
 */
class DB {
    constructor(connection_params) { // log.warn("Hello from constructor()!");
        this.connect_pool = null;
        this.query_count = 0;
        this.last_count = 0;
        this.end_timer = null;
        this.end_count = 0;
        this.auto_timeout = 20 * 1000; // close after 20s in auto() mode
        this.auto_init_end = 0;
        this.auto_timer = null;
        this.prefix = DB.tablePrefix;
        
        this.init(connection_params);
    }

    defaultConnectionParameters() {
        var db_conf = config.get("database");
        return db_conf; 
    }
    
    static get tablePrefix() {
        return "n_";
    }

    init(connection_params) { // initialization of connection pool
        if (typeof connection_params != "object") {
            connection_params = this.defaultConnectionParameters();
        }
        
        if (!connection_params.hasOwnProperty("user") || 
            !connection_params.hasOwnProperty("password")) { 
            log.error("Connection information lacks vital parameters");
            return; 
        }
        if (!connection_params.hasOwnProperty("connectionLimit")) { 
            connection_params["connectionLimit"] = 100;
        }
        
        this.connect_pool = mysql.createPool(connection_params);
    }
    

    end() { // work off query backlog and end connection pool
        if (this.poolNotAvailable()) { return null; }
        
        /** log.debug("query_count: "+ this.query_count +
            ", end_count: "+ this.end_count +
            ", ticking: "+ (this.end_timer === null ? 'no' : 'yes')); **/
        
        if (this.query_count == 0) {
            /** log.debug("OK, queries all done"); **/
            if (this.end_timer !== null) { clearTimeout(this.end_timer); }
            
            this.connect_pool.end();
            return true;
        }
        
        // got pending queries, that need to be worked off, try again
        if (this.end_count < 50) { // 50 * 200 msec = 10 sec
            if (this.query_count >= this.last_count) { // nothing's...
                this.end_count++; // being worked off, so increase count
                
            } else { // some queries have been worked off, so give us...
                this.end_count = 0; // another 10s to reduce backlog
            }
            
            var self = this;
            this.end_timer = setTimeout(function () {
                self.end(); // try again 
            }, 200);
            
        } else { // exceeded number of "retry attempts"
            /** log.debug("STOP, exceeded number of attempts"); **/
            if (this.end_timer !== null) { clearTimeout(this.end_timer); }
            
            this.connect_pool.end();
            return false;        
        }
        
        this.last_count = this.query_count;
              
        return null;
    }
    
    
    poolNotAvailable() {
        return typeof this.connect_pool == "undefined" || 
            this.connect_pool === null ||
            this.connect_pool._closed;
    }
    

    runQuery(query, parameters, result_callback) { // query and return result via callback
        this.query_count++;
        
        var self = this;
        this.connect_pool.getConnection(function(err, connect) {
            if (err) {
                self.query_count--;
                if (typeof result_callback == "function") {
                    err["db_connect"] = "Error: could not connect to database";
                    log.error(err["db_connect"]);
                    log.error(err);
                    result_callback("error", err);
                }
                return false;
            }
            // console.log("connected!");

            connect.query(query, parameters, function(err, results) {
                self.query_count--;
                
                connect.release();
                
                if (err) {
                    if (typeof result_callback == "function") {
                        err.info = "Error: could not execute query "+ query;
                        result_callback("error", err);
                    }
                    return false;
                }
                // console.log("results:"); console.log(results);
                
                if (typeof result_callback == "function") {
                    result_callback("success", results);
                }
                return true;
            });

            // pool.end();
        });
    }
    
    
    auto(milli_sec) { // put DB in auto mode to close pool after timeout
        this.autoInitEnd(milli_sec); 
    }
    
    autoInitEnd(milli_sec) { // pool will be closed after milli_sec
        if (typeof milli_sec == "undefined") { 
            milli_sec = this.auto_timeout;
        }
        this.auto_init_end = milli_sec;
    }
        
    autoStop() { this.autoInitEnd(0); }
    
    autoDisabled() { return this.auto_init_end == 0; }
    
    
    run(query, parameters, result_callback) { // run() in auto mode
        
        if (this.autoDisabled()) { // init() + end() called from outside
            // log.silly("run(): normal runQuery()");
            return this.runQuery(query, parameters, result_callback);
        }
        
        if (this.poolNotAvailable()) { // log.silly("run(): ... init()");
            this.init();
        }
        
        var self = this;
        if (self.auto_timer !== null) { // log.silly("run(): ... CLEAR timout");  
            clearTimeout(self.auto_timer); 
        }
        // log.silly("run(): ... before runQuery()");
        
        return this.runQuery(query, parameters, function(status, results) {
            // log.silly("run(): ... callback from runQuery(), ... query_count: "+ self.query_count);
            
            if (self.query_count == 0) { // looks like the last query
                // log.silly("run(): ... setTimeout()");
                
                let msec = self.auto_init_end;
                self.auto_timer = setTimeout(function () { // log.silly("run(): ... END via setTimeout()");
                    self.end(); // close pool after automatic timeout
                }, msec);
            }
            
            if (typeof result_callback == "function") {
                result_callback(status, results);
            }
        });
    }
}

module.exports = DB;
