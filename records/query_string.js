
// let log = require('../main/logging.js');
let db = require('../main/database.js');

/* 
 * Module globals and defaults
 */
var s = {
    select: {
        all:      "select * ",
        fields:   "select ",
        distinct: "select distinct ",
        count:    "select count(*) ",
        count_distinct: function(field) { 
            return "select count(distinct "+ field +") ";
        },
    },
    
    insert_into: "insert into ", 
    insert_set:  " set ",
    
    delete_from: "delete from ",

    update:     "update ", 
    update_set: " set ",
        
    left_join: " left join ",
    on: " on ",

    from:  " from ",
    where: " where ",
    and:   " and ",
    or:    " or ",
    
    is_null:  " is NULL ",
    is_equal: " = ",
    is_in:    function(one_of_them) { 
        return " in ("+ one_of_them +") "; 
    },
    equals:   " = ",
    
    not_null:  " is not NULL ",
    not_empty: " <> '' ",
    
    order_by: " order by ",
    limit: " limit ?, ? ",
    
    question: "?",
    comma:    ", "
}

module.exports = Object.assign({}, s, {
    querySelectAll: querySelectAll,
    
    querySelectAllRange: querySelectAllRange,
    
    querySelectAllConditionRange: querySelectAllConditionRange,

    querySelectFields: querySelectFields,
    
    querySelectCount: querySelectCount,
    
    querySelectRecords: querySelectRecords,
    
    queryDeleteRecord: queryDeleteRecord,
    
    queryConditionIsIn: queryConditionIsIn,
    
    questionMarks: questionMarks,
    
    brackets: brackets,
    
    prefix: prefix
});


/*
 * Convenience query functions
 */
function querySelectAll(table_name) {
    return s.select.all + s.from + prefix(table_name); 
}

function querySelectAllRange(table_name /* , offset, limit */) {
    return s.select.all + s.from + prefix(table_name) + s.limit; 
}

function querySelectAllConditionRange(table_name, condition) {
    return querySelectAll(table_name) + s.where + condition + s.limit; 
}

function querySelectFields(fields, table_name) {
    return s.select.fields + fields + s.from + prefix(table_name); 
}

function querySelectCount(table_name) {
    return s.select.count + s.from + prefix(table_name); 
}

function querySelectCount(table_name) {
    return s.select.count + s.from + prefix(table_name); 
}

function querySelectRecords(table_name, field, value_or_values) {
    let query_all = querySelectAll(table_name);
    let condition = queryConditionIsIn(field, value_or_values);
    let more_cond = "";

    for (let i = 3; i < arguments.length; i++) {
        let param = arguments[i].trim().toLowerCase();
        if (["and", "or"].indexOf(param) > -1) {
            more_cond += s[param];
            i++;
            param = arguments[i].trim().toLowerCase();
            
        } else {
            more_cond += s.and;
        }
        i++;
        if (i >= arguments.length) { break; }
        let val = arguments[i].trim().toLowerCase();
        more_cond += queryConditionIsIn(param, val);
    }
    return query_all + s.where + condition + more_cond;
}

function queryDeleteRecord(table_name, field, value) {
    if (typeof field == "undefined" || typeof value == "undefined") {
        return false;
    }
    let condition = queryConditionIsIn(field, value);
    return s.delete_from + prefix(table_name) + s.where + condition;
}

function queryConditionIsIn(field, value_or_values) {
    if (value_or_values === null || value_or_values.length == 0) {
        return field + s.is_null;
        
    } else if (typeof value_or_values == "string" ||
        typeof value_or_values == "number" ||
        value_or_values.length == 1) {
        return field + s.is_equal + s.question;
        
    }
    // value_or_values.length > 1
    var tokens = questionMarks(value_or_values);
    return field + s.is_in(tokens);
}


function questionMarks(fields) {
    var mark = s.question;
    var comma = s.comma
    var comma_separated = new Array(fields.length).fill(mark).join(comma);
    return comma_separated;
}

function brackets(term) { 
    return " ("+ term +") "; 
}


function prefix(table_name) {
    return db.tablePrefix + table_name;
}
