
require('dotenv').config();

module.exports = {
    get: get,

    set: set
}

/*
 * Environment normalization helper - supports standard and abbreviated forms
 */
function normalizeEnv(env) {
    const normalized = (env || 'development').toLowerCase();
    if (normalized === 'dev' || normalized === 'development') return 'DEV';
    if (normalized === 'prod' || normalized === 'production') return 'PROD';
    return 'DEV'; // default fallback
}

/*
 * Global configuration
 */
let config = {
    log_level: process.env.LOG_LEVEL || "info",  // global log level, e.g. 'debug' or 'info'
    env: normalizeEnv(process.env.NODE_ENV),     // normalized to "DEV" or "PROD"
    ip: process.env.SERVER_IP || "127.0.0.1",
    port: parseInt(process.env.SERVER_PORT) || 8088,
    hostname: process.env.HOSTNAME || "localhost",
    site_base: process.env.SITE_BASE || "",      // see site.js, "/subdir" -> start slash, no trailing one
    city_img_path: process.env.CITY_IMG_PATH || "/city-img",  // path to city images
    session: {          // see site.js
        secret: process.env.SESSION_SECRET || "",  // REQUIRED, set this in .env
        name: process.env.SESSION_NAME || 'node_mvc_id',
        resave: true,
        saveUninitialized: true,
        cookie: {}
    },
    database: {         // see database.js, params for mysql.createPool()
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "",          // REQUIRED, set this in .env
        password: process.env.DB_PASSWORD || "",  // REQUIRED, set this in .env
        database: process.env.DB_NAME || "node_mvc",
        connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 100, // size of connection pool
    }
}

/*
 * Get and set config parameters
 */
function get(param) {
    if (typeof param == "undefined") {
        return config;
    }
    
    // console.log(param +": "); console.log(config[param]);
    return config[param];
}

function set(param, value) {
    // console.log("setting '"+ param +"':"); console.log(value);
    config[param] = value;
}
