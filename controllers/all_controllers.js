
let log = require('../main/logging.js');


module.exports = {  
    index_page_params: index_page_params, // parameters for pagination
    
    param_check: param_check,
}


/* 
 * Pagination parameters and helper functions
 */
var results_per_page = 10;

function index_page_params(page_num) {
    if (page_num <= 0) { page_num = 1; }
    let offset = (page_num - 1) * results_per_page;
    return {
        offset: offset,
        limit: results_per_page
    }
}

module.exports.index_page_lines = results_per_page;


/*
 * Helper function to check parameter type, e.g. "(int)" or "^\\d$"
 */
function param_check(params, name, type_check) {
    if (typeof params != "object") { return false; }
    if (typeof name != "string") { return false; }
    if (name.length == 0) { return false; }
    
    let ok_so_far = params.hasOwnProperty(name);
    if (ok_so_far && params[name].length > 1024) { // less than silly
        return false; 
    }
    if (!ok_so_far || typeof type_check == "undefined") {
        return ok_so_far; // no further check required
    }
    if (typeof type_check != "string") { return false; }
    
    if (type_check.indexOf("(") === 0 && type_check.indexOf(")") > 0) {
        type_check = type_check.replace("(", "").replace(")", "").toLowerCase();
        switch (type_check) {
            case "int":
                ok_so_far = ok_so_far && params[name] * 1 == parseInt(params[name], 10);
                break;
            case "number":
                ok_so_far = ok_so_far && params[name] * 1 == parseFloat(params[name]);
                break;
            case "string":
                ok_so_far = ok_so_far && typeof params[name] == "string";
                break;
            default:
                ok_so_far = ok_so_far && typeof params[name] == type_check;
        }
        return ok_so_far;
    }
    
    let regx = new RegExp(type_check, "i"); // case insensitive
    let match = regx.test(params[name]);
    ok_so_far = ok_so_far && match;
    
    return ok_so_far;
}
