
var express = require('express');
var router = express.Router();
var auth = require('./auth.js');
var path = require('path');
// var session = require('express-session');
var controllers = require('./controllers.js');
let log = require('../main/logging.js');


/*
 * Global definition of routes
 */
router.get('/', controllers.home.index);

router.get('/favorites', controllers.favorites.auth_check, controllers.favorites.index);
router.get('/favorites/page/:page', controllers.favorites.auth_check, controllers.favorites.index_page);

router.get('/favorites/view/:city_id', controllers.favorites.auth_check, controllers.favorites.view);
router.get('/favorites/delete/:id', controllers.favorites.auth_check, controllers.favorites.del);

router.get('/favorites/edit/:city_id', controllers.favorites.auth_check, controllers.favorites.edit);
router.post('/favorites/edit/:city_id', controllers.favorites.auth_check, controllers.favorites.edit_post);

router.get('/cities', controllers.cities.index);
router.get('/cities/page/:page', controllers.cities.index_page);
router.get('/cities/view/:id', controllers.cities.view);
router.get('/cities/delete/:id', auth.check, controllers.cities.del);

router.get('/login', controllers.users.login);
router.post('/login', controllers.users.login_post);
router.get('/logout', controllers.users.logout);

router.get('/admin/demo-reset/:mode', auth.check, controllers.favorites.demo_reset);

router.get('*', auth.unknown);


router.use(function (err, req, res, next) { // error handler
    let is_err = typeof err == "object" && typeof err.message == "string" && err.message.length > 0;
    if (is_err) {
        log.whiteout(err, res);
    }
});


/*
 * Export router (used in site.js for express app)
 */
module.exports = router;
