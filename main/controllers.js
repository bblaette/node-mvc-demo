
// let site_dirs = require("./site_dirs.js");

var controllers = [
    "home",
    "cities",
    "users",
    "favorites"
];


/*
 * Global pointers to controller files
 */
for (let i = 0; i < controllers.length; i++) {
    let controller = controllers[i];
    let controller_path = pathTo(controller +".js"); // console.log(controller_path);

    let include = require(controller_path);
    module.exports[controller] = include; // forward entire controller
}


/*
 * Helper functions
 */
function pathTo(controller_js) {
    // return __dirname +"/../controllers/"+ controller_js;
    return "../controllers/"+ controller_js;
}
