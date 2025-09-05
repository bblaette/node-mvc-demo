
let config = require('./main/config.js');
let site = require('./main/site.js');

let ip = config.get('ip');
let port = config.get('port');

site.init();

site.app.listen(port, ip, function () {
   var host = this.address().address
   var port = this.address().port
   
   console.log("Node MVC site listening at http://%s:%s", host, port)
});
